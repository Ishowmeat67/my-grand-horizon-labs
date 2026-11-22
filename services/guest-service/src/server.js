const express = require('express');
const mysql   = require('mysql2/promise');
const bcrypt  = require('bcrypt');
const cors    = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const SALT_ROUNDS = 10;   // same value as the backend auth lab — never go below 10
const PORT        = process.env.PORT || 3001;

// Credentials come ONLY from environment variables (set in docker-compose.yml
// from your .env file). No fallback passwords are hardcoded here.
const required = ['DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missing  = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`[guest-service] Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1); // docker compose "restart: on-failure" will retry
}

// ── Health check endpoint (required for Docker Compose)
app.get('/health', (req, res) =>
  res.json({ status: 'ok', service: 'guest-service', port: Number(PORT) })
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

// ── POST /api/auth/register  (moved from backend/auth.js)
app.post('/api/auth/register', async (req, res) => {
  const { email, password, full_name, phone } = req.body;

  if (!email || !password || !full_name) {
    return res.status(400).json({ error: 'Email, password, and full name are required' });
  }
  if (typeof email !== 'string' || typeof password !== 'string' || typeof full_name !== 'string') {
    return res.status(400).json({ error: 'Email, password, and full name must be text' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    // The role is NOT read from the request: new accounts are always 'guest'
    // (the column default), so nobody can register themselves as staff/admin.
    const [result] = await db.query(
      'INSERT INTO guests (email, password_hash, full_name, phone) VALUES (?, ?, ?, ?)',
      [email.trim().toLowerCase(), password_hash, full_name.trim(), phone || null]
    );
    res.status(201).json({
      message: 'Guest account created successfully',
      guestId: result.insertId
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    console.error('Registration error:', err.message);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ── POST /api/auth/login  (moved from backend/auth.js)
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email and password must be text' });
  }

  try {
    const [rows] = await db.query(
      'SELECT id, email, password_hash, full_name, role FROM guests WHERE email = ?',
      [email.trim().toLowerCase()]
    );
    // Same message for "not found" and "wrong password" (no email enumeration)
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const guest = rows[0];
    const match = await bcrypt.compare(password, guest.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // A later week will return a JWT here instead
    res.json({
      message:  'Login successful',
      guestId:  guest.id,
      fullName: guest.full_name,
      email:    guest.email,
      role:     guest.role
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── GET /api/guests/:id  (NEW — the Booking Service calls this to check a guest exists)
app.get('/api/guests/:id', async (req, res) => {
  try {
    // Never select password_hash here — other services will call this route
    const [rows] = await db.query(
      'SELECT id, email, full_name, phone, created_at FROM guests WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Guest not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Guest lookup error:', err.message);
    res.status(500).json({ error: 'Could not load guest' });
  }
});



app.listen(PORT, () =>
  console.log(`[guest-service] Running on http://localhost:${PORT}`)
);
