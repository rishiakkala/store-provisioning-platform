require('dotenv').config();
process.env.TZ = 'Asia/Kolkata'; // Set timezone to IST
const express = require('express');
const cors = require('cors');
const { initDB } = require('./config/database');
const storesRouter = require('./services/stores');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: process.env.CORS_ORIGIN }));
app.use(express.json());

// Routes
app.use('/api/stores', storesRouter);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});

// Metrics endpoint
app.get('/api/metrics', async (req, res) => {
    try {
        const { pool } = require('./config/database');

        const totalResult = await pool.query(
            "SELECT COUNT(*) as count FROM stores WHERE status != 'deleted'"
        );

        const activeResult = await pool.query(
            "SELECT COUNT(*) as count FROM stores WHERE status = 'ready'"
        );

        const provisioningResult = await pool.query(
            "SELECT COUNT(*) as count FROM stores WHERE status LIKE '%ing%'"
        );

        const failedResult = await pool.query(
            "SELECT COUNT(*) as count FROM stores WHERE status = 'failed'"
        );

        res.json({
            total: parseInt(totalResult.rows[0].count),
            active: parseInt(activeResult.rows[0].count),
            provisioning: parseInt(provisioningResult.rows[0].count),
            failed: parseInt(failedResult.rows[0].count),
        });
    } catch (error) {
        console.error('❌ Error fetching metrics:', error);
        res.status(500).json({ error: 'Failed to fetch metrics' });
    }
});

// Events endpoint
app.get('/api/events', async (req, res) => {
    try {
        const { pool } = require('./config/database');

        const result = await pool.query(
            `SELECT se.*, s.name as store_name 
             FROM store_events se
             LEFT JOIN stores s ON se.store_id = s.store_id
             ORDER BY se.created_at DESC 
             LIMIT 50`
        );
        res.json(result.rows);
    } catch (error) {
        console.error('❌ Error fetching events:', error);
        res.status(500).json({ error: 'Failed to fetch events' });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('❌ Server error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
});

// Initialize database and start server
async function startServer() {
    try {
        await initDB();

        app.listen(PORT, () => {
            console.log('');
            console.log('🚀 Store Platform Backend');
            console.log('========================');
            console.log(`✅ Server running on port ${PORT}`);
            console.log(`✅ Environment: ${process.env.NODE_ENV}`);
            console.log(`✅ Database: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
            console.log(`✅ CORS origin: ${process.env.CORS_ORIGIN}`);
            console.log(`✅ Cluster IP: ${process.env.CLUSTER_IP}`);
            console.log('');
            console.log(`🔗 Health check: http://localhost:${PORT}/health`);
            console.log(`🔗 Metrics: http://localhost:${PORT}/api/metrics`);
            console.log('');
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
