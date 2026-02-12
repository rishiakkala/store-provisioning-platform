const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Set timezone to IST for all database connections
pool.on('connect', (client) => {
  client.query("SET timezone='Asia/Kolkata'");
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
  process.exit(-1);
});

async function initDB() {
  try {
    console.log('🔧 Initializing database...');

    // Create stores table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stores (
        id SERIAL PRIMARY KEY,
        store_id VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) DEFAULT 'woocommerce',
        status VARCHAR(50) DEFAULT 'provisioning',
        url TEXT,
        admin_url TEXT,
        namespace VARCHAR(100),
        error TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create store_events table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS store_events (
        id SERIAL PRIMARY KEY,
        store_id VARCHAR(50) REFERENCES stores(store_id) ON DELETE CASCADE,
        event_type VARCHAR(100) NOT NULL,
        message TEXT,
        severity VARCHAR(20) DEFAULT 'info',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create index on store_id for faster queries
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_stores_store_id ON stores(store_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_store_events_store_id ON store_events(store_id)
    `);

    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

module.exports = { pool, initDB };
