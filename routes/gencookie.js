const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

const GENCOOKIE_API_URL = process.env.API_GENCOOKIE_URL || 'https://p01--gencookie--7ppzd7xy487n.code.run';

// ========== GENERAR COOKIE (PROXY) ==========
router.post('/generate', authenticate, async (req, res) => {
    try {
        const { country, add_address, force_playwright } = req.body;

        const requestBody = { country, add_address: add_address || true };
        if (force_playwright) requestBody.force_playwright = true;

        const response = await fetch(`${GENCOOKIE_API_URL}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        // Devolver la respuesta al frontend
        res.status(response.status).json(data);
    } catch (error) {
        console.error('❌ Error en proxy gencookie:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;