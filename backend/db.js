const mysql = require('mysql2/promise');

// Credentials come ONLY from environment variables (set in docker-compose.yml
// from your .env file). No fallback passwords are hardcoded here.
const required = ['DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missing  = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1); // docker compose "restart: on-failure" will retry
}

const pool = mysql.createPool({
  host:               process.env.DB_HOST || 'db', // Service name in docker-compose.yml (not a secret)
  user:               process.env.DB_USER,
  password:           process.env.DB_PASSWORD,
  database:           process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit:    10,   // Max 10 simultaneous DB operations
  queueLimit:         0     // Queue unlimited requests (0 = no limit)
});

// Test the pool at startup — logs an error if MySQL is unreachable
pool.getConnection()
  .then((conn) => {
    console.log('✅ MySQL connected — Grand Horizon pool ready');
    conn.release();
  })
  .catch((err) => console.error('❌ MySQL connection error:', err.message));

module.exports = pool;
