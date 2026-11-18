const express = require('express');
const mysql   = require('mysql2/promise');
const cors    = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3002;

// Credentials come ONLY from environment variables (set in docker-compose.yml
// from your .env file). No fallback passwords are hardcoded here.
const required = ['DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missing  = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`[room-service] Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1); // docker compose "restart: on-failure" will retry
}

app.get('/health', (req, res) =>
  res.json({ status: 'ok', service: 'room-service', port: Number(PORT) })
);

// ── MySQL connection — same settings as backend/db.js
const db = mysql.createPool({
  host:     process.env.DB_HOST || 'db',   // service name in docker-compose.yml (not a secret)
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0
});

// Shared query: every room joined with its room type (name, price, capacity...)
const ROOM_SELECT = `
  SELECT r.id, r.room_number, r.floor, r.status,
         t.id AS room_type_id, t.name AS room_type, t.capacity,
         t.base_price, t.description, t.badge
  FROM rooms r
  JOIN room_types t ON t.id = r.room_type_id`;

// ── GET /api/room-types  (moved from backend/server.js)
app.get('/api/room-types', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM room_types ORDER BY base_price');
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Room types fetch error:', err.message);
    res.status(500).json({ success: false, error: 'Could not load room types' });
  }
});

// ── GET /api/rooms  (moved from backend/server.js)
app.get('/api/rooms', async (req, res) => {
  try {
    const [rows] = await db.query(`${ROOM_SELECT} ORDER BY r.room_number`);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Rooms fetch error:', err.message);
    res.status(500).json({ success: false, error: 'Could not load rooms' });
  }
});

// ── GET /api/rooms/type/:type  (moved from backend/server.js)
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

// ── GET /api/rooms/:id  (the Booking Service calls this to look up a room and its price)
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

app.listen(PORT, () =>
  console.log(`[room-service] Running on http://localhost:${PORT}`)
);
