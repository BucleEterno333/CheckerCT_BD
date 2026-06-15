const express = require('express');
const router = express.Router();
const { authenticate, requireRole, trackActivity } = require('../middleware/auth');
const User = require('../models/User');
const { pool } = require('../database');
const { getSetting, setSetting } = require('../database');
const SERVICE_API_KEY = process.env.SERVICE_API_KEY;
const BOT_API_KEY = process.env.BOT_API_KEY;
const { getUserDevices, banDevice, unbanDevice } = require('../utils/deviceUtils');
const { notifyAdminsAndGroups } = require('../utils/notifications');

const allowBot = (req, res, next) => {
    const botKey = req.headers['x-bot-key'];
    if (botKey && botKey === BOT_API_KEY) {
        req.user = { id: 0, role: 'admin', is_active: true, credits: 999999 };
        return next();
    }
    next();
};
router.use(allowBot);
router.use(authenticate);

const botAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    if (token !== process.env.BOT_API_KEY) return res.status(401).json({ success: false, error: 'No autorizado' });
    next();
};

async function kickUserFromGroupByUserId(userId) {
    const { bot } = require('../bot_telegram');
    const GROUP_CHAT_ID = process.env.GROUP_CHAT_ID;
    if (!bot || !GROUP_CHAT_ID) return;
    const res = await pool.query('SELECT telegram_id FROM users WHERE id = $1', [userId]);
    const telegramId = res.rows[0]?.telegram_id;
    if (telegramId) {
        try { await bot.telegram.kickChatMember(GROUP_CHAT_ID, telegramId); } catch (e) { console.error(e); }
    }
}

router.post('/bot/toggle-service', async (req, res) => {
    const botKey = req.headers['x-bot-key'] || req.headers['authorization']?.split(' ')[1];
    if (botKey !== BOT_API_KEY) return res.status(401).json({ success: false, error: 'No autorizado' });
    const current = await getSetting('cookie_generator_enabled', true);
    const newStatus = !current;
    await setSetting('cookie_generator_enabled', newStatus, null);
    res.json({ success: true, enabled: newStatus });
});

router.get('/service-status-for-generator', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== SERVICE_API_KEY) return res.status(401).json({ success: false, error: 'No autorizado' });
    const enabled = await getSetting('cookie_generator_enabled', true);
    res.json({ success: true, enabled });
});

router.get('/service-status', authenticate, async (req, res) => {
    const enabled = await getSetting('cookie_generator_enabled', true);
    res.json({ success: true, enabled });
});

router.post('/toggle-service', authenticate, botAuth, requireRole('admin'), async (req, res) => {
    const current = await getSetting('cookie_generator_enabled', true);
    const newStatus = !current;
    await setSetting('cookie_generator_enabled', newStatus, req.user.id);
    res.json({ success: true, enabled: newStatus });
});

// ========== LISTAR USUARIOS ==========
router.get('/users', requireRole('admin', 'seller'), async (req, res) => {
    try {
        const { role, page = 1, limit = 2000, search = '', min_credits, max_credits, min_days, max_days } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        let query = `SELECT u.id, u.username, u.display_name, u.credits, u.days_remaining, u.role, u.total_checks, u.total_lives, u.created_at, u.last_login, u.is_active, u.cookies_generated, u.telegram_username,
            COALESCE((SELECT SUM(ct.amount) FROM credit_transactions ct WHERE ct.to_user_id = u.id AND ct.transaction_type = 'credits' AND ct.amount < 0), 0) * -1 AS total_credits_used,
            COALESCE((SELECT SUM(ct.amount) FROM credit_transactions ct WHERE ct.to_user_id = u.id AND ct.transaction_type = 'days' AND ct.amount > 0), 0) AS total_days_received
            FROM users u WHERE 1=1`;
        const params = []; let pi = 1;
        if (req.user.role === 'admin' && role) { query += ` AND u.role = $${pi}`; params.push(role); pi++; }
        else if (req.user.role === 'seller') query += ` AND u.role = 'user'`;
        if (search) { query += ` AND u.username ILIKE $${pi}`; params.push(`%${search}%`); pi++; }
        if (min_credits) { query += ` AND u.credits >= $${pi}`; params.push(parseInt(min_credits)); pi++; }
        if (max_credits) { query += ` AND u.credits <= $${pi}`; params.push(parseInt(max_credits)); pi++; }
        if (min_days) { query += ` AND u.days_remaining >= $${pi}`; params.push(parseInt(min_days)); pi++; }
        if (max_days) { query += ` AND u.days_remaining <= $${pi}`; params.push(parseInt(max_days)); pi++; }
        query += ` ORDER BY u.created_at DESC LIMIT $${pi} OFFSET $${pi+1}`; params.push(parseInt(limit), offset);
        const result = await pool.query(query, params);
        let countQuery = `SELECT COUNT(*) as total FROM users u WHERE 1=1`; const countParams = []; let ci = 1;
        if (req.user.role === 'admin' && role) { countQuery += ` AND u.role = $${ci}`; countParams.push(role); ci++; }
        else if (req.user.role === 'seller') countQuery += ` AND u.role = 'user'`;
        if (search) { countQuery += ` AND u.username ILIKE $${ci}`; countParams.push(`%${search}%`); ci++; }
        if (min_credits) { countQuery += ` AND u.credits >= $${ci++}`; countParams.push(min_credits); }
        if (max_credits) { countQuery += ` AND u.credits <= $${ci++}`; countParams.push(max_credits); }
        if (min_days) { countQuery += ` AND u.days_remaining >= $${ci++}`; countParams.push(min_days); }
        if (max_days) { countQuery += ` AND u.days_remaining <= $${ci++}`; countParams.push(max_days); }
        const totalResult = await pool.query(countQuery, countParams);
        res.json({ success: true, users: result.rows, pagination: { page: parseInt(page), limit: parseInt(limit), total: parseInt(totalResult.rows[0].total), totalPages: Math.ceil(parseInt(totalResult.rows[0].total) / parseInt(limit)) } });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/users/:userId', requireRole('admin'), async (req, res) => {
    try {
        const result = await pool.query(`SELECT id, username, display_name, credits, days_remaining, role, is_active, created_at, last_login, telegram_username, telegram_verified FROM users WHERE id = $1`, [req.params.userId]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        res.json({ success: true, user: result.rows[0] });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/users/:userId/credits', requireRole('admin'), trackActivity, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { credits, reason = '' } = req.body;
        const newCredits = parseInt(credits);
        if (isNaN(newCredits) || newCredits < 0) throw new Error('Créditos inválidos');
        const userResult = await client.query('SELECT credits FROM users WHERE id = $1 FOR UPDATE', [req.params.userId]);
        if (userResult.rows.length === 0) throw new Error('Usuario no encontrado');
        const oldCredits = userResult.rows[0].credits;
        await client.query('UPDATE users SET credits = $1, updated_at = NOW() WHERE id = $2', [newCredits, req.params.userId]);
        if (newCredits - oldCredits !== 0) {
            await client.query(`INSERT INTO credit_transactions (from_user_id, to_user_id, transaction_type, amount, previous_amount, new_amount, reason) VALUES ($1, $2, 'credits', $3, $4, $5, $6)`, [req.user.id, req.params.userId, newCredits - oldCredits, oldCredits, newCredits, reason || 'Ajuste admin']);
        }
        await client.query('COMMIT');
        if (newCredits === 0) await kickUserFromGroupByUserId(req.params.userId);
        res.json({ success: true });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, error: error.message });
    } finally { client.release(); }
});

router.put('/users/:userId/days', requireRole('admin'), trackActivity, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { days, reason = '' } = req.body;
        const newDays = parseInt(days);
        if (isNaN(newDays) || newDays < 0) throw new Error('Días inválidos');
        const userResult = await client.query('SELECT days_remaining FROM users WHERE id = $1 FOR UPDATE', [req.params.userId]);
        if (userResult.rows.length === 0) throw new Error('Usuario no encontrado');
        const oldDays = userResult.rows[0].days_remaining;
        await client.query('UPDATE users SET days_remaining = $1, updated_at = NOW() WHERE id = $2', [newDays, req.params.userId]);
        if (newDays - oldDays !== 0) {
            await client.query(`INSERT INTO credit_transactions (from_user_id, to_user_id, transaction_type, amount, previous_amount, new_amount, reason) VALUES ($1, $2, 'days', $3, $4, $5, $6)`, [req.user.id, req.params.userId, newDays - oldDays, oldDays, newDays, reason || 'Ajuste admin']);
        }
        await client.query('COMMIT');
        if (newDays === 0) await kickUserFromGroupByUserId(req.params.userId);
        res.json({ success: true });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, error: error.message });
    } finally { client.release(); }
});

router.put('/users/:userId/role', requireRole('admin'), trackActivity, async (req, res) => {
    try {
        const { new_role } = req.body;
        if (!['user', 'seller', 'admin'].includes(new_role)) return res.status(400).json({ success: false, error: 'Rol inválido' });
        await User.changeRole(req.params.userId, new_role, req.user.id);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/users/:userId/status', requireRole('admin'), async (req, res) => {
    try {
        const { is_active } = req.body;
        if (typeof is_active !== 'boolean') return res.status(400).json({ success: false, error: 'is_active debe ser booleano' });
        await pool.query('UPDATE users SET is_active = $1 WHERE id = $2', [is_active, req.params.userId]);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/stats/platform', requireRole('admin'), async (req, res) => {
    try {
        const stats = await pool.query(`SELECT COUNT(*) as total_users, COUNT(CASE WHEN role = 'admin' THEN 1 END) as admin_count, COUNT(CASE WHEN role = 'seller' THEN 1 END) as seller_count, COUNT(CASE WHEN role = 'user' THEN 1 END) as user_count, COALESCE(SUM(CASE WHEN role = 'user' THEN credits ELSE 0 END),0) as total_credits, COALESCE(SUM(CASE WHEN role = 'user' THEN days_remaining ELSE 0 END),0) as total_days FROM users`);
        res.json({ success: true, stats: stats.rows[0] });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/transactions/sellers', requireRole('admin'), async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        const offset = (parseInt(page)-1)*parseInt(limit);
        const result = await pool.query(`SELECT ct.*, u.username as seller_username, u2.username as user_username FROM credit_transactions ct JOIN users u ON ct.from_user_id = u.id AND u.role = 'seller' JOIN users u2 ON ct.to_user_id = u2.id ORDER BY ct.created_at DESC LIMIT $1 OFFSET $2`, [parseInt(limit), offset]);
        res.json({ success: true, transactions: result.rows, pagination: { page: parseInt(page), limit: parseInt(limit) } });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/settings/force-playwright', async (req, res) => {
    try {
        const result = await pool.query(`SELECT value FROM global_settings WHERE key = 'force_playwright'`);
        let enabled = result.rows.length > 0 ? result.rows[0].value === 'true' : false;
        res.json({ success: true, enabled });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/users/:userId/devices', requireRole('admin'), async (req, res) => {
    const devices = await getUserDevices(req.params.userId);
    res.json({ success: true, devices });
});

router.get('/suspicious-multicuentas', requireRole('admin'), async (req, res) => {
    const result = await pool.query(`SELECT al.device_fingerprint, array_agg(DISTINCT u.id) as user_ids, array_agg(DISTINCT u.username) as usernames, COUNT(DISTINCT u.id) as user_count, MAX(al.created_at) as last_used FROM access_logs al JOIN users u ON al.user_id = u.id WHERE al.device_fingerprint IS NOT NULL GROUP BY al.device_fingerprint HAVING COUNT(DISTINCT u.id) > 1 ORDER BY user_count DESC`);
    res.json({ success: true, suspicious: result.rows });
});

router.post('/ban-device', requireRole('admin'), async (req, res) => {
    const { device_fingerprint, reason } = req.body;
    if (!device_fingerprint) return res.status(400).json({ success: false, error: 'Fingerprint requerido' });
    await banDevice(device_fingerprint, reason, req.user.id);
    await notifyAdminsAndGroups(`🔒 DISPOSITIVO BANEADO\nFingerprint: ${device_fingerprint}\nRazón: ${reason || 'No especificada'}\nPor: ${req.user.username}`);
    res.json({ success: true });
});

router.post('/unban-device', requireRole('admin'), async (req, res) => {
    const { device_fingerprint } = req.body;
    await unbanDevice(device_fingerprint);
    res.json({ success: true });
});

module.exports = router;