// routes/user.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const User = require('../models/User');
const { pool } = require('../database');

// ============================================
// RUTAS PÚBLICAS PARA EL BOT (usan API key)
// ============================================
const BOT_API_KEY = process.env.BOT_API_KEY || 'AALOL23894238HWKEJSNFSDGF';

// Descontar créditos desde el bot (usa telegram_id)
router.post('/bot/use-credits', async (req, res) => {
    const { telegram_id, amount, bot_key } = req.body;
    if (bot_key !== BOT_API_KEY) {
        return res.status(401).json({ success: false, error: 'No autorizado' });
    }
    const amountToUse = parseInt(amount) || 3;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const userRes = await client.query(
            'SELECT id, credits FROM users WHERE telegram_id = $1 FOR UPDATE',
            [telegram_id]
        );
        if (userRes.rows.length === 0) {
            throw new Error('Usuario no encontrado');
        }
        const userId = userRes.rows[0].id;
        const currentCredits = userRes.rows[0].credits;
        if (currentCredits < amountToUse) {
            throw new Error('Créditos insuficientes');
        }
        const newCredits = currentCredits - amountToUse;
        await client.query('UPDATE users SET credits = $1 WHERE id = $2', [newCredits, userId]);
        // Usar un valor más corto para transaction_type (por ejemplo, 'cookie_bot')
        await client.query(
            `INSERT INTO credit_transactions 
             (to_user_id, transaction_type, amount, previous_amount, new_amount, reason, created_at)
             VALUES ($1, 'credits', $2, $3, $4, $5, NOW())`,
            [userId, amountToUse, currentCredits, newCredits, 'Generación desde bot']
        );
        await client.query('COMMIT');
        res.json({ success: true, newCredits });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en /bot/use-credits:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
});

// Consultar créditos desde el bot (usa telegram_id)
router.post('/bot/check-credits', async (req, res) => {
    const { telegram_id, bot_key } = req.body;
    if (bot_key !== BOT_API_KEY) {
        return res.status(401).json({ success: false, error: 'No autorizado' });
    }
    try {
        const result = await pool.query('SELECT credits FROM users WHERE telegram_id = $1', [telegram_id]);
        const credits = result.rows[0]?.credits || 0;
        res.json({ success: true, credits });
    } catch (error) {
        console.error('Error en /bot/check-credits:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// RUTAS PROTEGIDAS PARA EL FRONTEND (usan JWT)
// ============================================
router.use(authenticate);

// Obtener créditos del usuario autenticado
router.get('/credits', async (req, res) => {
    try {
        const result = await pool.query('SELECT credits FROM users WHERE id = $1', [req.user.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        }
        res.json({ success: true, credits: result.rows[0].credits });
    } catch (error) {
        console.error('Error obteniendo créditos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Descontar créditos desde el frontend (por ejemplo, al generar cookie)
router.post('/use-credits', async (req, res) => {
    const { amount } = req.body;
    const amountToUse = parseInt(amount) || 3;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const userRes = await client.query(
            'SELECT credits FROM users WHERE id = $1 FOR UPDATE',
            [req.user.id]
        );
        if (userRes.rows.length === 0) {
            throw new Error('Usuario no encontrado');
        }
        const currentCredits = userRes.rows[0].credits;
        if (currentCredits < amountToUse) {
            throw new Error('Créditos insuficientes');
        }
        const newCredits = currentCredits - amountToUse;
        await client.query('UPDATE users SET credits = $1 WHERE id = $2', [newCredits, req.user.id]);
        await client.query(
            `INSERT INTO credit_transactions 
             (to_user_id, transaction_type, amount, previous_amount, new_amount, reason, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            [req.user.id, 'cookie_front', amountToUse, currentCredits, newCredits, 'Generación desde frontend']
        );
        await client.query('COMMIT');
        res.json({ success: true, newCredits });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en /use-credits:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
});

// Obtener perfil del usuario autenticado
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

// Incrementar contador de cookies generadas
router.post('/cookie-generated', async (req, res) => {
    try {
        await User.incrementCookieCount(req.user.id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error incrementando contador:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Obtener contador de cookies del usuario autenticado
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