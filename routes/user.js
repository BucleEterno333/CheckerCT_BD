// routes/user.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const User = require('../models/User');

const { pool } = require('../database');

// Todas las rutas requieren autenticación
router.use(authenticate);

// POST /api/user/bot/use-credits
router.post('/bot/use-credits', async (req, res) => {
    const { telegram_id, amount, bot_key } = req.body;
    if (bot_key !== process.env.BOT_API_KEY) return res.status(401).json({ success: false, error: 'No autorizado' });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const userRes = await client.query('SELECT id, credits FROM users WHERE telegram_id = $1 FOR UPDATE', [telegram_id]);
        if (userRes.rows.length === 0) throw new Error('Usuario no encontrado');
        const user = userRes.rows[0];
        if (user.credits < amount) throw new Error('Créditos insuficientes');
        const newCredits = user.credits - amount;
        await client.query('UPDATE users SET credits = $1 WHERE id = $2', [newCredits, user.id]);
        await client.query(
            `INSERT INTO credit_transactions (to_user_id, transaction_type, amount, previous_amount, new_amount, reason)
             VALUES ($1, 'cookie_generation_bot', $2, $3, $4, 'Generación desde bot')`,
            [user.id, amount, user.credits, newCredits]
        );
        await client.query('COMMIT');
        res.json({ success: true, newCredits });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
});

// POST /api/user/bot/check-credits
router.post('/bot/check-credits', async (req, res) => {
    const { telegram_id, bot_key } = req.body;
    if (bot_key !== process.env.BOT_API_KEY) return res.status(401).json({ success: false, error: 'No autorizado' });
    try {
        const result = await pool.query('SELECT credits FROM users WHERE telegram_id = $1', [telegram_id]);
        if (result.rows.length === 0) return res.json({ success: true, credits: 0 });
        res.json({ success: true, credits: result.rows[0].credits });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/user/credits - Devuelve los créditos del usuario autenticado
router.get('/credits', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await pool.query('SELECT credits FROM users WHERE id = $1', [userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        }
        res.json({ success: true, credits: result.rows[0].credits });
    } catch (error) {
        console.error('Error obteniendo créditos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


// routes/user.js (agrega este endpoint)
router.post('/use-credits', authenticate, async (req, res) => {
    try {
        const { amount } = req.body;
        const userId = req.user.id;
        const amountToUse = parseInt(amount) || 3;

        // Verificar créditos disponibles
        const userResult = await pool.query(
            'SELECT credits FROM users WHERE id = $1 FOR UPDATE',
            [userId]
        );
        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        }
        const currentCredits = userResult.rows[0].credits;
        if (currentCredits < amountToUse) {
            return res.status(400).json({ success: false, error: 'Créditos insuficientes' });
        }

        // Restar créditos
        await pool.query(
            'UPDATE users SET credits = credits - $1 WHERE id = $2',
            [amountToUse, userId]
        );

        // Registrar transacción - USAR to_user_id porque el usuario es el que gasta créditos
        await pool.query(
            `INSERT INTO credit_transactions 
             (to_user_id, transaction_type, amount, previous_amount, new_amount, reason, created_at)
             VALUES ($1, 'cookie_generation', $2, $3, $4, $5, NOW())`,
            [userId, amountToUse, currentCredits, currentCredits - amountToUse, 'Generación de cookie Amazon']
        );

        res.json({ success: true, newCredits: currentCredits - amountToUse });
    } catch (error) {
        console.error('Error al descontar créditos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


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

// routes/user.js - Agrega esto al final del archivo, antes de module.exports

const BOT_API_KEY = process.env.BOT_API_KEY || 'cambia_esta_clave_secreta';

// Endpoint para que el bot descuente créditos (usa API key en lugar de token)
router.post('/bot/use-credits', async (req, res) => {
    try {
        const { username, amount, bot_key } = req.body;
        if (bot_key !== BOT_API_KEY) {
            return res.status(401).json({ success: false, error: 'No autorizado' });
        }
        const amountToUse = parseInt(amount) || 3;

        const userResult = await pool.query(
            'SELECT id, credits FROM users WHERE username = $1 FOR UPDATE',
            [username]
        );
        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        }
        const userId = userResult.rows[0].id;
        const currentCredits = userResult.rows[0].credits;
        if (currentCredits < amountToUse) {
            return res.status(400).json({ success: false, error: 'Créditos insuficientes' });
        }

        await pool.query(
            'UPDATE users SET credits = credits - $1 WHERE id = $2',
            [amountToUse, userId]
        );

        // Registrar transacción (opcional pero recomendado)
        await pool.query(
            `INSERT INTO credit_transactions 
             (user_id, transaction_type, amount, previous_amount, new_amount, reason, created_at)
             VALUES ($1, 'cookie_generation_bot', $2, $3, $4, $5, NOW())`,
            [userId, amountToUse, currentCredits, currentCredits - amountToUse, 'Generación de cookie desde bot']
        );

        res.json({ success: true, newCredits: currentCredits - amountToUse });
    } catch (error) {
        console.error('Error al descontar créditos (bot):', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;