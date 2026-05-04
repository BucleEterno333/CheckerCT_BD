const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const User = require('../models/User');
const { pool } = require('../database');

const BOT_API_KEY = process.env.BOT_API_KEY || 'AALOL23894238HWKEJSNFSDGF';

// ========== RUTAS PÚBLICAS PARA EL BOT ==========
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
            'SELECT id, credits, role, days_remaining FROM users WHERE telegram_id = $1 FOR UPDATE',
            [telegram_id]
        );
        if (userRes.rows.length === 0) {
            throw new Error('Usuario no encontrado');
        }
        const userId = userRes.rows[0].id;
        const currentCredits = userRes.rows[0].credits;
        const role = userRes.rows[0].role;
        const daysRemaining = userRes.rows[0].days_remaining;

        if (daysRemaining <= 0) {
            throw new Error('Días expirados');
        }
        if (currentCredits < amountToUse) {
            throw new Error('Créditos insuficientes');
        }

        const newCredits = currentCredits - amountToUse;
        await client.query('UPDATE users SET credits = $1 WHERE id = $2', [newCredits, userId]);
        await client.query(
            `INSERT INTO credit_transactions 
             (to_user_id, transaction_type, amount, previous_amount, new_amount, reason, created_at)
             VALUES ($1, 'credits', $2, $3, $4, $5, NOW())`,
            [userId, amountToUse, currentCredits, newCredits, 'Generación desde bot']
        );

        if (newCredits === 0) {
            await client.query(
                `INSERT INTO activity_logs (user_id, action_type, details, created_at)
                 VALUES ($1, 'credits_exhausted', $2, NOW())`,
                [userId, JSON.stringify({ previous_credits: currentCredits, used_amount: amountToUse })]
            );
        }

        await client.query('COMMIT');
        res.json({
            success: true,
            newCredits,
            role,
            credits_zero: newCredits === 0
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en /bot/use-credits:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
});

router.post('/bot/check-credits', async (req, res) => {
    const { telegram_id, bot_key } = req.body;
    if (bot_key !== BOT_API_KEY) {
        return res.status(401).json({ success: false, error: 'No autorizado' });
    }
    try {
        const result = await pool.query('SELECT credits, days_remaining FROM users WHERE telegram_id = $1', [telegram_id]);
        const credits = result.rows[0]?.credits || 0;
        const days = result.rows[0]?.days_remaining || 0;
        res.json({ success: true, credits, days });
    } catch (error) {
        console.error('Error en /bot/check-credits:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/bot/increment-cookie-count', async (req, res) => {
    const { telegram_id, bot_key } = req.body;
    if (bot_key !== BOT_API_KEY) {
        return res.status(401).json({ success: false, error: 'No autorizado' });
    }
    try {
        const userRes = await pool.query('SELECT id FROM users WHERE telegram_id = $1', [telegram_id]);
        if (userRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        }
        const userId = userRes.rows[0].id;
        await User.incrementCookieCount(userId);
        await pool.query(
            `INSERT INTO activity_logs (user_id, action_type, details, created_at)
             VALUES ($1, 'cookie_generated_bot', $2, NOW())`,
            [userId, JSON.stringify({ source: 'telegram_bot' })]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Error incrementando cookie count (bot):', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== RUTAS PROTEGIDAS PARA FRONTEND ==========
router.use(authenticate);

router.get('/credits', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT credits, role, days_remaining FROM users WHERE id = $1',
            [req.user.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        }
        const { credits, role, days_remaining } = result.rows[0];
        res.json({ success: true, credits, role, days_remaining });
    } catch (error) {
        console.error('Error obteniendo créditos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/use-credits', async (req, res) => {
    const { amount } = req.body;
    const amountToUse = parseInt(amount) || 3;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const userRes = await client.query(
            'SELECT credits, days_remaining FROM users WHERE id = $1 FOR UPDATE',
            [req.user.id]
        );
        if (userRes.rows.length === 0) throw new Error('Usuario no encontrado');
        const currentCredits = userRes.rows[0].credits;
        const daysRemaining = userRes.rows[0].days_remaining;

        if (daysRemaining <= 0) throw new Error('Días expirados');
        if (currentCredits < amountToUse) throw new Error('Créditos insuficientes');

        const newCredits = currentCredits - amountToUse;
        await client.query('UPDATE users SET credits = $1 WHERE id = $2', [newCredits, req.user.id]);
        await client.query(
            `INSERT INTO credit_transactions 
             (to_user_id, transaction_type, amount, previous_amount, new_amount, reason, created_at)
             VALUES ($1, 'credits', $2, $3, $4, $5, NOW())`,
            [req.user.id, amountToUse, currentCredits, newCredits, 'Generación desde frontend']
        );

        if (newCredits === 0) {
            await client.query(
                `INSERT INTO activity_logs (user_id, action_type, details, created_at)
                 VALUES ($1, 'credits_exhausted', $2, NOW())`,
                [req.user.id, JSON.stringify({ previous_credits: currentCredits, used_amount: amountToUse })]
            );
        }

        await client.query('COMMIT');
        res.json({ success: true, newCredits, credits_zero: newCredits === 0 });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en /use-credits:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
});

router.get('/profile', async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        res.json({ success: true, user });
    } catch (error) {
        console.error('Error obteniendo perfil:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/cookie-generated', async (req, res) => {
    try {
        await User.incrementCookieCount(req.user.id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error incrementando contador:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

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