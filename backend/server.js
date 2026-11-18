const express = require('express');
const cors    = require('cors');
const db      = require('./db');

// ════════════════════════════════════════════════════
// 🟢 GUEST SERVICE ZONE  →  services/guest-service/
//    Deps: express · mysql2 · bcrypt · cors
//    DB:   MySQL  (guests table)
//    EXISTS today (in auth.js):  POST /api/auth/register · POST /api/auth/login
//    NEW in Lab 5.1:             GET /api/guests/:id
// ════════════════════════════════════════════════════

// ════════════════════════════════════════════════════
// 🔵 ROOM SERVICE ZONE  →  services/room-service/
//    Deps: express · mysql2 · cors
//    DB:   MySQL  (rooms + room_types tables)
//    EXISTS today (in server.js): GET /api/rooms · GET /api/rooms/:id
//                                 GET /api/rooms/type/:type · GET /api/room-types
//    NEW in Lab 5.1:              nothing required (room lookup by id is already written)
// ════════════════════════════════════════════════════

// ════════════════════════════════════════════════════
// 🟣 BOOKING SERVICE ZONE  →  services/booking-service/
//    Deps: express · mongodb · redis · cors
//    DB:   MongoDB (bookings) + Redis (holds)
//    EXISTS today: nothing — Lab 4.2 used redis-cli and mongosh only
//    NEW in Lab 5.1: hold routes + booking routes (all written fresh)
// ════════════════════════════════════════════════════


const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use('/api/auth', require('./auth'));
app.use(express.static('public'));        // Serve HTML/CSS from /public

// Shared query: every room joined with its room type (name, price, capacity...)
const ROOM_SELECT = `
  SELECT r.id, r.room_number, r.floor, r.status,
         t.id AS room_type_id, t.name AS room_type, t.capacity,
         t.base_price, t.description, t.badge
  FROM rooms r
  JOIN room_types t ON t.id = r.room_type_id`;

// ── HEALTH CHECK ───────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'grand-horizon-backend' });
});

// ── GET ALL ROOM TYPES ─────────────────────────────
app.get('/api/room-types', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM room_types ORDER BY base_price');
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Room types fetch error:', err.message);
    res.status(500).json({ success: false, error: 'Could not load room types' });
  }
});

// ── GET ALL ROOMS ──────────────────────────────────
app.get('/api/rooms', async (req, res) => {
  try {
    const [rows] = await db.query(`${ROOM_SELECT} ORDER BY r.room_number`);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Rooms fetch error:', err.message);
    res.status(500).json({ success: false, error: 'Could not load rooms' });
  }
});

// ── GET ROOMS BY ROOM TYPE NAME ────────────────────
// Example: /api/rooms/type/Deluxe%20King
app.get('/api/rooms/type/:type', async (req, res) => {
  try {
    const [rows] = await db.query(
      `${ROOM_SELECT} WHERE t.name = ? ORDER BY r.room_number`,
      [req.params.type]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Rooms by type error:', err.message);
    res.status(500).json({ success: false, error: 'Could not load rooms' });
  }
});

// ── GET ONE ROOM BY ID ─────────────────────────────
app.get('/api/rooms/:id', async (req, res) => {
  try {
    const [rows] = await db.query(`${ROOM_SELECT} WHERE r.id = ?`, [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Room fetch error:', err.message);
    res.status(500).json({ success: false, error: 'Could not load room' });
  }
});

app.listen(PORT, () => console.log(`Grand Horizon backend running on port ${PORT}`));
