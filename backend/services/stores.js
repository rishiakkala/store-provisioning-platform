const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const orchestrator = require('./orchestrator');

// GET /api/stores - List all stores
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM stores 
       WHERE status != 'deleted' 
       ORDER BY created_at DESC`
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching stores:', error);
        res.status(500).json({ error: 'Failed to fetch stores' });
    }
});

// GET /api/stores/:id - Get single store with events
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const storeResult = await pool.query(
            'SELECT * FROM stores WHERE store_id = $1',
            [id]
        );

        if (storeResult.rows.length === 0) {
            return res.status(404).json({ error: 'Store not found' });
        }

        const eventsResult = await pool.query(
            'SELECT * FROM store_events WHERE store_id = $1 ORDER BY created_at DESC',
            [id]
        );

        res.json({
            store: storeResult.rows[0],
            events: eventsResult.rows
        });
    } catch (error) {
        console.error('Error fetching store:', error);
        res.status(500).json({ error: 'Failed to fetch store' });
    }
});

// POST /api/stores - Create new store
router.post('/', async (req, res) => {
    try {
        const { name, type = 'woocommerce' } = req.body;

        // Validation
        if (!name || name.trim().length < 2) {
            return res.status(400).json({ error: 'Store name must be at least 2 characters' });
        }

        // Check active store limit
        const countResult = await pool.query(
            "SELECT COUNT(*) as count FROM stores WHERE status NOT IN ('deleted', 'failed')"
        );
        const activeCount = parseInt(countResult.rows[0].count);

        if (activeCount >= 10) {
            return res.status(429).json({
                error: 'Maximum number of active stores reached (10). Please delete some stores first.'
            });
        }

        // Generate unique store ID
        const storeId = 'store-' + Math.random().toString(36).substring(2, 10);
        const namespace = storeId;
        const hostname = `${storeId}.${process.env.CLUSTER_IP}.nip.io`;
        const url = `http://${hostname}`;

        // Insert into database
        await pool.query(
            `INSERT INTO stores (store_id, name, type, status, namespace, url) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
            [storeId, name.trim(), type, 'provisioning', namespace, url]
        );

        // Start provisioning in background (fire and forget)
        orchestrator.provisionStore(storeId, name.trim(), type)
            .catch(err => {
                console.error(`Background provisioning error for ${storeId}:`, err);
            });

        // Return immediately with 202 Accepted
        res.status(202).json({
            storeId,
            name: name.trim(),
            type,
            status: 'provisioning',
            url,
            message: 'Store provisioning started'
        });
    } catch (error) {
        console.error('Error creating store:', error);
        res.status(500).json({ error: 'Failed to create store' });
    }
});

// DELETE /api/stores/:id - Delete a store
router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        // Get store details
        const storeResult = await pool.query(
            'SELECT * FROM stores WHERE store_id = $1',
            [id]
        );

        if (storeResult.rows.length === 0) {
            return res.status(404).json({ error: 'Store not found' });
        }

        const store = storeResult.rows[0];

        // Update status to 'deleting'
        await pool.query(
            'UPDATE stores SET status = $1, updated_at = NOW() WHERE store_id = $2',
            ['deleting', id]
        );

        // Log deletion start
        await orchestrator.logEvent(id, 'store_deletion_started', 'Store deletion started', 'info');

        // Delete in background using Helm
        const HelmClient = require('./helmClient');
        const helm = new HelmClient();

        helm.deleteStore(id)
            .then(async () => {
                console.log(`✅ Store ${id} deleted successfully via Helm`);

                // Update status to 'deleted'
                await pool.query(
                    'UPDATE stores SET status = $1, updated_at = NOW() WHERE store_id = $2',
                    ['deleted', id]
                );

                // Log deletion success
                await orchestrator.logEvent(id, 'store_deleted', 'Store resources cleaned up successfully', 'success');
            })
            .catch(async (error) => {
                console.error(`❌ Failed to delete store ${id}:`, error);

                // Update status to 'failed'
                await pool.query(
                    'UPDATE stores SET status = $1, error = $2, updated_at = NOW() WHERE store_id = $3',
                    ['failed', error.message, id]
                );

                // Log deletion failure
                await orchestrator.logEvent(id, 'store_deletion_failed', `Deletion failed: ${error.message}`, 'error');
            });

        res.json({
            message: 'Store deletion started',
            storeId: id,
            status: 'deleting'
        });
    } catch (error) {
        console.error('Error deleting store:', error);
        res.status(500).json({ error: 'Failed to delete store' });
    }
});

module.exports = router;
