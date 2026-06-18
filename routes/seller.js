const express = require('express');
const router = express.Router();
const { authenticate, requireRole, trackActivity } = require('../middleware/auth');
const User = require('../models/User');
const { pool } = require('../database');
const { notifyAdminsAndGroups } = require('../utils/notifications');


const allowBot = (req, res, next) => {
    const botKey = req.headers['x-bot-key'];
    const BOT_API_KEY = process.env.BOT_API_KEY || 'AALOL23894238HWKEJSNFSDGF';
    if (botKey && botKey === BOT_API_KEY) {
        req.user = { id: 0, role: 'admin', is_active: true, credits: 999999 };
        return next();
    }
    next();
};
router.use(allowBot);
router.use(authenticate);

router.post('/add-credits', requireRole('seller', 'admin'), trackActivity, async (req, res) => {
    try {
        const { user_id, amount, reason = '' } = req.body;
        if (!user_id || !amount || amount <= 0) return res.status(400).json({ success: false, error: 'Datos inválidos' });
        if (parseInt(user_id) === req.user.id) return res.status(400).json({ success: false, error: 'No puedes añadirte a ti mismo' });
        const targetUser = await User.findById(user_id);
        if (!targetUser || targetUser.role !== 'user') return res.status(400).json({ success: false, error: 'Solo puedes añadir a usuarios normales' });
        const result = await User.addCreditsOrDays(req.user.id, user_id, 'credits', parseInt(amount), reason);
        // Notificar a administradores
            await notifyAdminsAndGroups(
                `*AJUSTE DE CRÉDITOS (SELLER)*\n` +
                `👤 Seller: ${req.user.username}\n` +
                `💰 Créditos nuevos: ${newCredits}\n` +
                `🧑‍💻 Usuario: ${user.username}\n` +
                `✏️ Razón: ${reason || 'Ajuste manual'}\n` +
                `⏰ ${new Date().toLocaleString()}`
            );
        res.json({ success: true, message: `Se añadieron ${amount} créditos a ${result.username}` });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/add-days', requireRole('seller', 'admin'), trackActivity, async (req, res) => {
    try {
        const { user_id, amount, reason = '' } = req.body;
        if (!user_id || !amount || amount <= 0) return res.status(400).json({ success: false, error: 'Datos inválidos' });
        if (parseInt(user_id) === req.user.id) return res.status(400).json({ success: false, error: 'No puedes añadirte a ti mismo' });
        const targetUser = await User.findById(user_id);
        if (!targetUser || targetUser.role !== 'user') return res.status(400).json({ success: false, error: 'Solo puedes añadir a usuarios normales' });
        const result = await User.addCreditsOrDays(req.user.id, user_id, 'days', parseInt(amount), reason);
        // Notificar a administradores
            await notifyAdminsAndGroups(
                `*AJUSTE DE DÍAS (SELLER)*\n` +
                `👤 Seller: ${req.user.username}\n` +
                `💰 Días otorgados: ${amount}\n` +
                `🧑‍💻 Usuario: ${result.username}\n` +
                `✏️ Razón: ${reason || 'Ajuste manual'}\n` +
                `⏰ ${new Date().toLocaleString()}`
            );
        res.json({ success: true, message: `Se añadieron ${amount} días a ${result.username}` });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/stats', requireRole('seller', 'admin'), async (req, res) => {
    const stats = await User.getSellerStats(req.user.id);
    res.json({ success: true, stats });
});

router.get('/transactions', requireRole('seller', 'admin'), async (req, res) => {
    const { page = 1, limit = 50 } = req.query;
    const transactions = await User.getSellerTransactions(req.user.id, parseInt(page), parseInt(limit));
    res.json({ success: true, transactions, pagination: { page: parseInt(page), limit: parseInt(limit) } });
});

router.get('/search-user', requireRole('seller', 'admin'), async (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ success: false, error: 'username requerido' });
    const result = await pool.query(`SELECT id, username, display_name, credits, days_remaining, role, created_at, is_active FROM users WHERE username ILIKE $1 AND role = 'user' LIMIT 10`, [`%${username}%`]);
    res.json({ success: true, users: result.rows });
});

module.exports = router;