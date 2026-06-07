const express = require('express');
const router = express.Router();
const { pool } = require('../database');

router.get('/force-playwright', async (req, res) => {
    try {
        const result = await pool.query('SELECT value FROM global_settings WHERE key = $1', ['force_playwright']);
        const enabled = result.rows.length > 0 ? result.rows[0].value === 'true' : false;
        res.json({ success: true, enabled });
    } catch (error) {
        console.error('Error obteniendo force_playwright:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;