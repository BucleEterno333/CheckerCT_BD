const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const User = require('../models/User');
const { pool } = require('../database');
const { logUserAccess } = require('../utils/deviceUtils');
const BOT_API_KEY = process.env.BOT_API_KEY || 'AALOL23894238HWKEJSNFSDGF';

// ========== RUTAS PÚBLICAS PARA EL BOT ==========
router.post('/bot/use-credits', async (req, res) => {
    const { telegram_id, amount, bot_key } = req.body;
    if (bot_key !== BOT_API_KEY) return res.status(401).json({ success: false, error: 'No autorizado' });
    const amountToUse = parseInt(amount) || 3;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const userRes = await client.query('SELECT id, credits, role, days_remaining FROM users WHERE telegram_id = $1 FOR UPDATE', [telegram_id]);
        if (userRes.rows.length === 0) throw new Error('Usuario no encontrado');
        const userId = userRes.rows[0].id;
        const currentCredits = userRes.rows[0].credits;
        const daysRemaining = userRes.rows[0].days_remaining;
        if (daysRemaining <= 0) throw new Error('Días expirados');
        if (currentCredits < amountToUse) throw new Error('Créditos insuficientes');
        const newCredits = currentCredits - amountToUse;
        await client.query('UPDATE users SET credits = $1 WHERE id = $2', [newCredits, userId]);
        await client.query(`INSERT INTO credit_transactions (to_user_id, transaction_type, amount, previous_amount, new_amount, reason) VALUES ($1, 'credits', $2, $3, $4, 'Generación desde bot')`, [userId, amountToUse, currentCredits, newCredits]);
        if (newCredits === 0) await client.query(`INSERT INTO activity_logs (user_id, action_type, details) VALUES ($1, 'credits_exhausted', $2)`, [userId, JSON.stringify({ previous_credits: currentCredits })]);
        await client.query('COMMIT');
        res.json({ success: true, newCredits, role: userRes.rows[0].role, credits_zero: newCredits === 0 });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, error: error.message });
    } finally { client.release(); }
});

router.post('/bot/check-credits', async (req, res) => {
    const { telegram_id, bot_key } = req.body;
    if (bot_key !== BOT_API_KEY) return res.status(401).json({ success: false, error: 'No autorizado' });
    try {
        const result = await pool.query('SELECT credits, days_remaining FROM users WHERE telegram_id = $1', [telegram_id]);
        res.json({ success: true, credits: result.rows[0]?.credits || 0, days: result.rows[0]?.days_remaining || 0 });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/bot/increment-cookie-count', async (req, res) => {
    const { telegram_id, bot_key } = req.body;
    if (bot_key !== BOT_API_KEY) return res.status(401).json({ success: false, error: 'No autorizado' });
    try {
        const userRes = await pool.query('SELECT id FROM users WHERE telegram_id = $1', [telegram_id]);
        if (userRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        await User.incrementCookieCount(userRes.rows[0].id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== RUTAS PROTEGIDAS ==========
router.use(authenticate);

router.get('/credits', async (req, res) => {
    try {
        const result = await pool.query('SELECT credits, role, days_remaining FROM users WHERE id = $1', [req.user.id]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        res.json({ success: true, ...result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/use-credits', async (req, res) => {
    const amountToUse = parseInt(req.body.amount) || 3;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const userRes = await client.query('SELECT credits, days_remaining FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
        if (userRes.rows.length === 0) throw new Error('Usuario no encontrado');
        const currentCredits = userRes.rows[0].credits;
        const daysRemaining = userRes.rows[0].days_remaining;
        if (daysRemaining <= 0) throw new Error('Días expirados');
        if (currentCredits < amountToUse) throw new Error('Créditos insuficientes');
        const newCredits = currentCredits - amountToUse;
        await client.query('UPDATE users SET credits = $1 WHERE id = $2', [newCredits, req.user.id]);
        await client.query(`INSERT INTO credit_transactions (to_user_id, transaction_type, amount, previous_amount, new_amount, reason) VALUES ($1, 'credits', $2, $3, $4, 'Generación desde frontend')`, [req.user.id, amountToUse, currentCredits, newCredits]);
        await client.query('COMMIT');
        res.json({ success: true, newCredits, credits_zero: newCredits === 0 });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, error: error.message });
    } finally { client.release(); }
});

router.get('/profile', async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/cookie-generated', async (req, res) => {
    try {
        await User.incrementCookieCount(req.user.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/cookie-count', async (req, res) => {
    try {
        const count = await User.getCookieCount(req.user.id);
        res.json({ success: true, count });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// NUEVO ENDPOINT: Asociar fingerprint a usuario logueado
router.post('/associate-fingerprint', authenticate, async (req, res) => {
    const { device_fingerprint } = req.body;
    if (!device_fingerprint) {
        return res.status(400).json({ success: false, error: 'Fingerprint requerido' });
    }
    try {
        // 1. Actualizar el fingerprint del usuario en la tabla users
        await pool.query(
            'UPDATE users SET device_fingerprint = $1 WHERE id = $2',
            [device_fingerprint, req.user.id]
        );

        // 2. Guardar el log de acceso (con el fingerprint asociado)
        const ip = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || '0.0.0.0';
        const userAgent = req.headers['user-agent'] || '';
        await logUserAccess(req.user.id, device_fingerprint, ip, userAgent, req);

        // 3. (Opcional) Detectar multicuentas con este fingerprint
        const multicuentas = await detectMulticuentas(device_fingerprint, req.user.id, req.user.username);
        if (multicuentas) {
            console.log(`⚠️ Multicuentas detectadas para ${req.user.username}:`, multicuentas.length);
        }

        res.json({ success: true, message: 'Fingerprint asociado correctamente' });
    } catch (err) {
        console.error('Error asociando fingerprint:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;