const express = require('express');
const bcrypt  = require('bcrypt');
const db      = require('./db');
const router = express.Router();
const SALT_ROUNDS = 10;   // 2^10 = 1024 rounds — never go below 10

// ── POST /api/auth/register ──────────────────────────────────
router.post('/register', async (req, res) => {
  const { email, password, full_name, phone } = req.body;

  // Input validation
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
    // Hash the password — ~100ms intentional delay (SALT_ROUNDS = 10)
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    // Insert into database — plain text password is now discarded.
    // The role is NOT read from the request: new accounts are always 'guest'
    // (the column default), so nobody can register themselves as staff/admin.
    const [result] = await db.query(
      'INSERT INTO guests (email, password_hash, full_name, phone) VALUES (?, ?, ?, ?)',
      [email.trim().toLowerCase(), password_hash, full_name.trim(), phone || null]
    );

    res.status(201).json({
      message:  'Guest account created successfully',
      guestId:  result.insertId
    });

  } catch (err) {
    // ER_DUP_ENTRY: email already registered (UNIQUE constraint)
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    console.error('Registration error:', err.message);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ── POST /api/auth/login ─────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email and password must be text' });
  }

  try {
    // Lookup guest by email (fast — UNIQUE constraint creates an index on email)
    const [rows] = await db.query(
      'SELECT id, email, password_hash, full_name, role FROM guests WHERE email = ?',
      [email.trim().toLowerCase()]
    );

    // Use same error message for "not found" and "wrong password"
    // (prevents email enumeration attacks)
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const guest = rows[0];

    // bcrypt.compare re-hashes the submitted password and compares
    // It does NOT decrypt the stored hash
    const match = await bcrypt.compare(password, guest.password_hash);

    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Login successful — a later week will return a JWT token here instead
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

module.exports = router;
