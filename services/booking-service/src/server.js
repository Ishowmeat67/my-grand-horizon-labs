const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const redis   = require('redis');
const cors    = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT     = process.env.PORT || 3003;
const HOLD_TTL = 900;   // seconds — a room hold expires after 15 minutes (SET ... EX)

// ── Configuration (all from environment variables) ─────────────────────────
// MONGO_URL may contain credentials, so it has NO hardcoded default.
const MONGO_URL = process.env.MONGO_URL;
if (!MONGO_URL) {
  console.error('[booking-service] Missing required environment variable: MONGO_URL');
  process.exit(1); // docker compose "restart: on-failure" will retry
}
const MONGO_DB_NAME     = process.env.MONGO_DB_NAME     || 'grand_horizon_mongo';
const REDIS_URL         = process.env.REDIS_URL         || 'redis://redis:6379';
const GUEST_SERVICE_URL = process.env.GUEST_SERVICE_URL || 'http://guest-service:3001';
const ROOM_SERVICE_URL  = process.env.ROOM_SERVICE_URL  || 'http://room-service:3002';

// Add-on prices are decided HERE on the server, never trusted from the browser.
const ADDONS = {
  'Breakfast Buffet': 35.00,
  'Airport Transfer': 60.00,
  'Late Checkout':    50.00
};
const ACTIVE_STATUSES = ['pending', 'confirmed', 'checked_in'];   // these block a room
const ALL_STATUSES    = [...ACTIVE_STATUSES, 'checked_out', 'cancelled'];

app.get('/health', (req, res) =>
  res.json({ status: 'ok', service: 'booking-service', port: Number(PORT) })
);

// ── MongoDB connection (bookings = permanent) ──────────────────────────────
const mongoClient = new MongoClient(MONGO_URL);
let bookingsDb;
mongoClient.connect()
  .then(async () => {
    bookingsDb = mongoClient.db(MONGO_DB_NAME);
    const col = bookingsDb.collection('bookings');
    await col.createIndex({ 'room.roomId': 1, checkIn: 1, checkOut: 1 });  // availability check
    await col.createIndex({ guestId: 1, placedAt: -1 });                   // booking history
    console.log('[booking-service] MongoDB connected');
  })
  .catch(err => console.error('[booking-service] MongoDB error:', err.message));

// ── Redis connection (holds = temporary) ───────────────────────────────────
const redisClient = redis.createClient({ url: REDIS_URL });
redisClient.on('error', err => console.error('[booking-service] Redis error:', err.message));
redisClient.connect()
  .then(() => console.log('[booking-service] Redis connected'))
  .catch(err => console.error('[booking-service] Redis connect failed:', err.message));

// Refuse API calls until both databases are connected
app.use('/api', (req, res, next) => {
  if (!bookingsDb || !redisClient.isReady) {
    return res.status(503).json({ error: 'Databases not ready, try again shortly' });
  }
  next();
});

// ── Helpers ────────────────────────────────────────────────────────────────
const holdKey  = (guestId) => `hold:guest${guestId}`;          // e.g. hold:guest1
const round2   = (n) => Math.round(n * 100) / 100;
const bookings = () => bookingsDb.collection('bookings');
const isId     = (n) => Number.isInteger(n) && n > 0;

// 'YYYY-MM-DD' -> Date at UTC midnight, or null if invalid
function parseDate(str) {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const d = new Date(`${str}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== str ? null : d;
}
const nightsBetween = (ci, co) => Math.round((co - ci) / 86400000);

function calcTotal(hold) {
  const addons = hold.addons.reduce((sum, a) => sum + a.qty * a.price, 0);
  return round2(hold.nights * hold.room.pricePerNight + addons);
}

// Fetch JSON from another service (Node 18+ has fetch built in)
async function getJson(url) {
  const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
  let body = null;
  try { body = await resp.json(); } catch (_) { /* no JSON body */ }
  return { status: resp.status, body };
}

// Is the room taken for these dates? Returns 'booked', 'held' or null (free).
// Overlap rule: existing.checkIn < requested.checkOut AND existing.checkOut > requested.checkIn
async function roomConflict(roomId, checkIn, checkOut, excludeGuestId) {
  const clash = await bookings().findOne({
    'room.roomId': roomId,
    status:   { $in: ACTIVE_STATUSES },
    checkIn:  { $lt: parseDate(checkOut) },
    checkOut: { $gt: parseDate(checkIn) }
  });
  if (clash) return 'booked';

  // Other guests' active holds in Redis also block the room (ISO dates compare as text)
  for await (const key of redisClient.scanIterator({ MATCH: 'hold:guest*', COUNT: 100 })) {
    if (key === holdKey(excludeGuestId)) continue;
    const raw = await redisClient.get(key);
    if (!raw) continue;
    const other = JSON.parse(raw);
    if (other.room.roomId === roomId && other.checkIn < checkOut && other.checkOut > checkIn) {
      return 'held';
    }
  }
  return null;
}

// ── GET /api/holds/:guestId — read the hold from Redis ─────────────────────
app.get('/api/holds/:guestId', async (req, res) => {
  try {
    const raw = await redisClient.get(holdKey(req.params.guestId));
    if (!raw) return res.status(404).json({ error: 'No active hold' });
    const ttl = await redisClient.ttl(holdKey(req.params.guestId));
    res.json({ ...JSON.parse(raw), expiresInSeconds: ttl });
  } catch (err) {
    console.error('Hold read error:', err.message);
    res.status(500).json({ error: 'Could not read hold' });
  }
});

// ── POST /api/holds — hold a room   body: { guestId, roomId, checkIn, checkOut } ──
app.post('/api/holds', async (req, res) => {
  const guestId = Number(req.body.guestId);
  const roomId  = Number(req.body.roomId);
  const { checkIn, checkOut } = req.body;

  if (!isId(guestId) || !isId(roomId)) {
    return res.status(400).json({ error: 'guestId and roomId are required' });
  }
  const ci = parseDate(checkIn);
  const co = parseDate(checkOut);
  if (!ci || !co) {
    return res.status(400).json({ error: 'checkIn and checkOut must be dates like 2026-12-01' });
  }
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  if (ci < today) {
    return res.status(400).json({ error: 'checkIn cannot be in the past' });
  }
  if (co <= ci) {
    return res.status(400).json({ error: 'checkOut must be after checkIn' });
  }

  try {
    // 1. Ask the Guest Service whether this guest exists
    const guestResp = await getJson(`${GUEST_SERVICE_URL}/api/guests/${guestId}`);
    if (guestResp.status === 404) return res.status(404).json({ error: 'Guest not found' });
    if (guestResp.status !== 200) return res.status(502).json({ error: 'Guest service unavailable' });

    // 2. Ask the Room Service for the room and its price (the server decides the price)
    const roomResp = await getJson(`${ROOM_SERVICE_URL}/api/rooms/${roomId}`);
    if (roomResp.status === 404) return res.status(404).json({ error: 'Room not found' });
    if (roomResp.status !== 200) return res.status(502).json({ error: 'Room service unavailable' });
    const room = roomResp.body.data;
    if (room.status !== 'available') {
      return res.status(409).json({ error: 'Room is not available for booking' });
    }

    // 3. Make sure nobody else has booked or is holding this room for these dates
    const conflict = await roomConflict(roomId, checkIn, checkOut, guestId);
    if (conflict) {
      return res.status(409).json({
        error: conflict === 'booked'
          ? 'Room is already booked for these dates'
          : 'Room is currently being held by another guest'
      });
    }

    // 4. Store the hold in Redis with an expiry (replaces any earlier hold by this guest)
    const hold = {
      guestId,
      guestName: guestResp.body.full_name,
      room: {
        roomId:        room.id,
        roomNumber:    room.room_number,
        type:          room.room_type,
        pricePerNight: Number(room.base_price)
      },
      checkIn,
      checkOut,
      nights:    nightsBetween(ci, co),
      addons:    [],
      createdAt: new Date().toISOString()
    };
    hold.total = calcTotal(hold);
    await redisClient.set(holdKey(guestId), JSON.stringify(hold), { EX: HOLD_TTL });
    res.status(201).json({ ...hold, expiresInSeconds: HOLD_TTL });
  } catch (err) {
    console.error('Hold create error:', err.message);
    res.status(500).json({ error: 'Could not create hold' });
  }
});

// ── POST /api/holds/:guestId/addons — add an add-on   body: { name, qty } ──
app.post('/api/holds/:guestId/addons', async (req, res) => {
  const { name } = req.body;
  const qty = Number(req.body.qty);
  if (!Object.prototype.hasOwnProperty.call(ADDONS, name) || !Number.isInteger(qty) || qty < 1) {
    return res.status(400).json({
      error: `name must be one of: ${Object.keys(ADDONS).join(', ')}; qty must be 1 or more`
    });
  }

  try {
    const key = holdKey(req.params.guestId);
    const raw = await redisClient.get(key);
    if (!raw) return res.status(404).json({ error: 'No active hold (it may have expired)' });
    const hold = JSON.parse(raw);

    const existing = hold.addons.find(a => a.name === name);
    if (existing) existing.qty += qty;
    else hold.addons.push({ name, qty, price: ADDONS[name] });

    hold.total = calcTotal(hold);
    await redisClient.set(key, JSON.stringify(hold), { EX: HOLD_TTL });   // editing restarts the timer
    res.status(201).json({ ...hold, expiresInSeconds: HOLD_TTL });
  } catch (err) {
    console.error('Hold update error:', err.message);
    res.status(500).json({ error: 'Could not update hold' });
  }
});

// ── DELETE /api/holds/:guestId — release the hold ──────────────────────────
app.delete('/api/holds/:guestId', async (req, res) => {
  try {
    const removed = await redisClient.del(holdKey(req.params.guestId));
    res.json({ message: removed ? 'Hold released' : 'No active hold' });
  } catch (err) {
    console.error('Hold delete error:', err.message);
    res.status(500).json({ error: 'Could not release hold' });
  }
});

// ── POST /api/bookings — confirm   body: { guestId, specialRequests? } ─────
// The hold (temporary, Redis) becomes a booking (permanent, MongoDB).
app.post('/api/bookings', async (req, res) => {
  const guestId = Number(req.body.guestId);
  if (!isId(guestId)) {
    return res.status(400).json({ error: 'guestId is required' });
  }

  try {
    const raw = await redisClient.get(holdKey(guestId));
    if (!raw) {
      return res.status(404).json({ error: 'No active hold (it may have expired). Please hold a room again.' });
    }
    const hold = JSON.parse(raw);

    // Check again: the room must still be free at the moment of confirmation
    const conflict = await roomConflict(hold.room.roomId, hold.checkIn, hold.checkOut, guestId);
    if (conflict) {
      return res.status(409).json({ error: 'Room is no longer available for these dates' });
    }

    const now = new Date();
    const booking = {
      guestId,
      guestName:       hold.guestName,
      room:            hold.room,               // snapshot: keeps the price the guest agreed to
      checkIn:         parseDate(hold.checkIn),
      checkOut:        parseDate(hold.checkOut),
      nights:          hold.nights,
      addons:          hold.addons,
      total:           hold.total,
      status:          'pending',
      specialRequests: typeof req.body.specialRequests === 'string' ? req.body.specialRequests : null,
      placedAt:        now,
      statusHistory:   [{ status: 'pending', at: now }]
    };
    const result = await bookings().insertOne(booking);

    // Confirmation done: the hold is no longer needed
    await redisClient.del(holdKey(guestId));

    res.status(201).json({
      message:   'Booking placed',
      bookingId: result.insertedId,
      total:     booking.total
    });
  } catch (err) {
    console.error('Booking create error:', err.message);
    res.status(500).json({ error: 'Could not place booking' });
  }
});

// ── GET /api/bookings/guest/:guestId — booking history from MongoDB ────────
app.get('/api/bookings/guest/:guestId', async (req, res) => {
  try {
    const list = await bookings()
      .find({ guestId: Number(req.params.guestId) })
      .sort({ placedAt: -1 })
      .toArray();
    res.json(list);
  } catch (err) {
    console.error('Booking history error:', err.message);
    res.status(500).json({ error: 'Could not load bookings' });
  }
});

// ── GET /api/bookings/:id — one booking ────────────────────────────────────
app.get('/api/bookings/:id', async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid booking id' });
  }
  try {
    const booking = await bookings().findOne({ _id: new ObjectId(req.params.id) });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    res.json(booking);
  } catch (err) {
    console.error('Booking fetch error:', err.message);
    res.status(500).json({ error: 'Could not load booking' });
  }
});

// ── PATCH /api/bookings/:id/status — update status   body: { status } ──────
// $set and $push in ONE update, so the status and its history never drift apart.
app.patch('/api/bookings/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!ALL_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${ALL_STATUSES.join(', ')}` });
  }
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid booking id' });
  }

  try {
    const result = await bookings().updateOne(
      { _id: new ObjectId(req.params.id) },
      {
        $set:  { status },
        $push: { statusHistory: { status, at: new Date() } }
      }
    );
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Booking not found' });
    res.json({ message: 'Status updated', status });
  } catch (err) {
    console.error('Status update error:', err.message);
    res.status(500).json({ error: 'Could not update status' });
  }
});

app.listen(PORT, () =>
  console.log(`[booking-service] Running on http://localhost:${PORT}`)
);
