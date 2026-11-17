const express = require('express');
const cors    = require('cors');
const db      = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
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
