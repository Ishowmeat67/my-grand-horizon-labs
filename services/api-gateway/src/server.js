const express      = require('express');
const cors         = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
app.use(cors());
// Do NOT add express.json() here. It would consume the request body and
// the proxied POST/PUT/PATCH requests would hang. The gateway only forwards bytes.

// ── Service URLs (Docker Compose DNS names) ────────────
const SERVICES = {
  guest:   process.env.GUEST_SERVICE_URL   || 'http://guest-service:3001',
  room:    process.env.ROOM_SERVICE_URL    || 'http://room-service:3002',
  booking: process.env.BOOKING_SERVICE_URL || 'http://booking-service:3003',
};

// ── Health check for the gateway itself ────────────────
const PORT = process.env.PORT || 8000;
app.get('/health', (req, res) =>
  res.json({
    status: 'ok',
    service: 'api-gateway',
    port: Number(PORT),
    routes: {
      '/api/auth':       'guest-service',
      '/api/guests':     'guest-service',
      '/api/rooms':      'room-service',
      '/api/room-types': 'room-service',
      '/api/holds':      'booking-service',
      '/api/bookings':   'booking-service'
    }
  })
);

// ── Proxy factory helper ───────────────────────────────
function proxy(name, target) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    // app.use('/api/rooms', …) strips '/api/rooms' from req.url, but our services
    // define full paths (/api/rooms/…). Put the original URL back.
    pathRewrite: (path, req) => req.originalUrl,
    on: {
      error: (err, req, res) => {
        // Log the real reason on the server; do not leak internal hostnames to clients
        console.error(`[api-gateway] ${name} unreachable:`, err.message);
        res.status(503).json({
          error: 'Upstream service unavailable',
          service: name
        });
      }
    }
  });
}

// ══════════════════════════════════════════════════════
//  ROUTE TABLE
// ══════════════════════════════════════════════════════

// ── Guest Service ──────────────────────────────────────
app.use('/api/auth',       proxy('guest-service', SERVICES.guest));
app.use('/api/guests',     proxy('guest-service', SERVICES.guest));    // later: add authenticateToken

// ── Room Service — public (browsing rooms doesn't need login) ─
app.use('/api/rooms',      proxy('room-service', SERVICES.room));
app.use('/api/room-types', proxy('room-service', SERVICES.room));

// ── Booking Service ────────────────────────────────────
app.use('/api/holds',      proxy('booking-service', SERVICES.booking));   // later: add authenticateToken
app.use('/api/bookings',   proxy('booking-service', SERVICES.booking));   // later: add authenticateToken

// ── 404 for unknown routes ─────────────────────────────
app.use((req, res) =>
  res.status(404).json({
    error:           'Route not found in gateway',
    requestedPath:   req.path,
    availableRoutes: ['/api/auth', '/api/guests', '/api/rooms', '/api/room-types', '/api/holds', '/api/bookings']
  })
);

app.listen(PORT, () => {
  console.log(`[api-gateway] Listening on :${PORT}`);
  console.log(`  /api/auth, /api/guests         → ${SERVICES.guest}`);
  console.log(`  /api/rooms, /api/room-types    → ${SERVICES.room}`);
  console.log(`  /api/holds, /api/bookings      → ${SERVICES.booking}`);
});
