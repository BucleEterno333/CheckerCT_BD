// routes/user.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const User = require('../models/User');

// Todas las rutas requieren autenticación
router.use(authenticate);

// Obtener perfil del usuario actual
router.get('/profile', async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        }
        res.json({ success: true, user });
    } catch (error) {
        console.error('Error obteniendo perfil:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Incrementar contador de cookies generadas (llamado desde el frontend)
router.post('/cookie-generated', async (req, res) => {
    try {
        await User.incrementCookieCount(req.user.id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error incrementando contador:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Obtener contador de cookies del usuario actual
router.get('/cookie-count', async (req, res) => {
    try {
        const count = await User.getCookieCount(req.user.id);
        res.json({ success: true, count });
    } catch (error) {
        console.error('Error obteniendo contador:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;