const express = require('express');
const router = express.Router();
const { authenticate, requireRole, trackActivity } = require('../middleware/auth');
const User = require('../models/User');
const { pool } = require('../database');
const { getSetting, setSetting } = require('../database');
const SERVICE_API_KEY = process.env.SERVICE_API_KEY;
const BOT_API_KEY = process.env.BOT_API_KEY;

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
    console.log('Headers:', req.headers);
    console.log('x-bot-key:', req.headers['x-bot-key']);
    console.log('authorization:', req.headers['authorization']);
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

// ========== LISTAR USUARIOS (CORREGIDO) ==========
router.get('/users', requireRole('admin', 'seller'), async (req, res) => {
    try {
        const { role, page = 1, limit = 2000, search = '', min_credits, max_credits, min_days, max_days } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        
        let query = `
            SELECT 
                u.id, u.username, u.display_name, u.credits, u.days_remaining, 
                u.role, u.total_checks, u.total_lives, u.created_at, u.last_login, u.is_active,
                u.cookies_generated, u.telegram_username,
                COALESCE((
                    SELECT SUM(ct.amount) FROM credit_transactions ct 
                    WHERE ct.to_user_id = u.id AND ct.transaction_type = 'credits' AND ct.amount < 0
                ), 0) * -1 AS total_credits_used,
                COALESCE((
                    SELECT SUM(ct.amount) FROM credit_transactions ct 
                    WHERE ct.to_user_id = u.id AND ct.transaction_type = 'days' AND ct.amount > 0
                ), 0) AS total_days_received
            FROM users u
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;
        
        if (req.user.role === 'admin' && role) {
            query += ` AND u.role = $${paramIndex}`;
            params.push(role);
            paramIndex++;
        } else if (req.user.role === 'seller') {
            query += ` AND u.role = 'user'`;
        }
        
        if (search) {
            query += ` AND u.username ILIKE $${paramIndex}`;
            params.push(`%${search}%`);
            paramIndex++;
        }
        if (min_credits && min_credits !== '') {
            query += ` AND u.credits >= $${paramIndex}`;
            params.push(parseInt(min_credits));
            paramIndex++;
        }
        if (max_credits && max_credits !== '') {
            query += ` AND u.credits <= $${paramIndex}`;
            params.push(parseInt(max_credits));
            paramIndex++;
        }
        if (min_days && min_days !== '') {
            query += ` AND u.days_remaining >= $${paramIndex}`;
            params.push(parseInt(min_days));
            paramIndex++;
        }
        if (max_days && max_days !== '') {
            query += ` AND u.days_remaining <= $${paramIndex}`;
            params.push(parseInt(max_days));
            paramIndex++;
        }
        
        query += ` ORDER BY u.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), offset);
        
        const result = await pool.query(query, params);
        
        let countQuery = `SELECT COUNT(*) as total FROM users u WHERE 1=1`;
        const countParams = [];
        let countIndex = 1;
        if (req.user.role === 'admin' && role) {
            countQuery += ` AND u.role = $${countIndex}`;
            countParams.push(role);
            countIndex++;
        } else if (req.user.role === 'seller') {
            countQuery += ` AND u.role = 'user'`;
        }
        if (search) {
            countQuery += ` AND u.username ILIKE $${countIndex}`;
            countParams.push(`%${search}%`);
            countIndex++;
        }
        if (min_credits) { countQuery += ` AND u.credits >= $${countIndex++}`; countParams.push(min_credits); }
        if (max_credits) { countQuery += ` AND u.credits <= $${countIndex++}`; countParams.push(max_credits); }
        if (min_days) { countQuery += ` AND u.days_remaining >= $${countIndex++}`; countParams.push(min_days); }
        if (max_days) { countQuery += ` AND u.days_remaining <= $${countIndex++}`; countParams.push(max_days); }
        
        const totalResult = await pool.query(countQuery, countParams);
        const total = parseInt(totalResult.rows[0].total);
        
        res.json({ 
            success: true,
            users: result.rows,
            pagination: { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / parseInt(limit)) }
        });
    } catch (error) {
        console.error('Error listando usuarios:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== OBTENER UN USUARIO (con telegram_username) ==========
router.get('/users/:userId', requireRole('admin'), async (req, res) => {
    try {
        const { userId } = req.params;
        const result = await pool.query(
            `SELECT id, username, display_name, credits, days_remaining, role, is_active, created_at, last_login, telegram_username, telegram_verified
             FROM users WHERE id = $1`,
            [userId]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        res.json({ success: true, user: result.rows[0] });
    } catch (error) {
        console.error('Error obteniendo usuario:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== ACTUALIZAR CRÉDITOS ==========
router.put('/users/:userId/credits', requireRole('admin'), trackActivity, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { userId } = req.params;
        let { credits, reason = '' } = req.body;
        const newCredits = parseInt(credits, 10);
        if (isNaN(newCredits) || newCredits < 0) return res.status(400).json({ success: false, error: 'Créditos inválidos' });
        const userIdInt = parseInt(userId, 10);
        const adminId = req.user.id;
        const userResult = await client.query('SELECT id, username, credits FROM users WHERE id = $1 FOR UPDATE', [userIdInt]);
        if (userResult.rows.length === 0) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        const user = userResult.rows[0];
        const oldCredits = parseInt(user.credits, 10);
        const amount = newCredits - oldCredits;
        await client.query('UPDATE users SET credits = $1, updated_at = NOW() WHERE id = $2', [newCredits, userIdInt]);
        if (amount !== 0) {
            await client.query(
                `INSERT INTO credit_transactions 
                 (from_user_id, to_user_id, transaction_type, amount, previous_amount, new_amount, reason, created_at)
                 VALUES ($1, $2, 'credits', $3, $4, $5, $6, NOW())`,
                [adminId, userIdInt, amount, oldCredits, newCredits, reason || 'Ajuste por administrador']
            );
        }
        await client.query('COMMIT');
        if (newCredits === 0) await kickUserFromGroupByUserId(userIdInt);
        res.json({ success: true, message: 'Créditos actualizados', old: oldCredits, new: newCredits });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error actualizando créditos:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally { client.release(); }
});

// ========== ACTUALIZAR DÍAS ==========
router.put('/users/:userId/days', requireRole('admin'), trackActivity, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { userId } = req.params;
        let { days, reason = '' } = req.body;
        const newDays = parseInt(days, 10);
        if (isNaN(newDays) || newDays < 0) return res.status(400).json({ success: false, error: 'Días inválidos' });
        const userIdInt = parseInt(userId, 10);
        const adminId = req.user.id;
        const userResult = await client.query('SELECT id, username, days_remaining FROM users WHERE id = $1 FOR UPDATE', [userIdInt]);
        if (userResult.rows.length === 0) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        const user = userResult.rows[0];
        const oldDays = parseInt(user.days_remaining, 10);
        const amount = newDays - oldDays;
        await client.query('UPDATE users SET days_remaining = $1, updated_at = NOW() WHERE id = $2', [newDays, userIdInt]);
        if (amount !== 0) {
            await client.query(
                `INSERT INTO credit_transactions 
                 (from_user_id, to_user_id, transaction_type, amount, previous_amount, new_amount, reason, created_at)
                 VALUES ($1, $2, 'days', $3, $4, $5, $6, NOW())`,
                [adminId, userIdInt, amount, oldDays, newDays, reason || 'Ajuste por administrador']
            );
        }
        await client.query('COMMIT');
        if (newDays === 0) await kickUserFromGroupByUserId(userIdInt);
        res.json({ success: true, message: 'Días actualizados', old: oldDays, new: newDays });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error actualizando días:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally { client.release(); }
});

// ========== CAMBIAR ROL ==========
router.put('/users/:userId/role', requireRole('admin'), trackActivity, async (req, res) => {
    try {
        const { userId } = req.params;
        const { new_role } = req.body;
        if (!['user', 'seller', 'admin'].includes(new_role)) return res.status(400).json({ success: false, error: 'Rol inválido' });
        const result = await User.changeRole(userId, new_role, req.user.id);
        res.json({ success: true, message: `Rol cambiado a ${new_role}`, data: result });
    } catch (error) {
        console.error('Error cambiando rol:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== CAMBIAR ESTADO ==========
router.put('/users/:userId/status', requireRole('admin'), async (req, res) => {
    try {
        const { userId } = req.params;
        const { is_active } = req.body;
        if (typeof is_active !== 'boolean') return res.status(400).json({ success: false, error: 'is_active debe ser true o false' });
        await pool.query('UPDATE users SET is_active = $1 WHERE id = $2', [is_active, userId]);
        res.json({ success: true, message: `Usuario ${is_active ? 'activado' : 'desactivado'}` });
    } catch (error) {
        console.error('Error cambiando estado:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== ESTADÍSTICAS (excluyendo admins/sellers) ==========
router.get('/stats/platform', requireRole('admin'), async (req, res) => {
    try {
        const stats = await pool.query(`
            SELECT 
                COUNT(*) as total_users,
                COUNT(CASE WHEN role = 'admin' THEN 1 END) as admin_count,
                COUNT(CASE WHEN role = 'seller' THEN 1 END) as seller_count,
                COUNT(CASE WHEN role = 'user' THEN 1 END) as user_count,
                COALESCE(SUM(CASE WHEN role = 'user' THEN credits ELSE 0 END), 0) as total_credits,
                COALESCE(SUM(CASE WHEN role = 'user' THEN days_remaining ELSE 0 END), 0) as total_days,
                COUNT(CASE WHEN is_active = FALSE THEN 1 END) as inactive_users,
                COUNT(CASE WHEN last_login >= NOW() - INTERVAL '7 days' THEN 1 END) as active_7d,
                COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as new_users_30d
            FROM users
        `);
        const transactions = await pool.query(`
            SELECT 
                COUNT(*) as total_transactions,
                COALESCE(SUM(CASE WHEN transaction_type = 'credits' THEN amount ELSE 0 END), 0) as total_credits_given,
                COALESCE(SUM(CASE WHEN transaction_type = 'days' THEN amount ELSE 0 END), 0) as total_days_given,
                COUNT(DISTINCT from_user_id) as total_sellers_active,
                COUNT(DISTINCT to_user_id) as total_users_credited
            FROM credit_transactions
            WHERE transaction_type IN ('credits', 'days')
        `);
        res.json({ success: true, stats: { ...stats.rows[0], ...transactions.rows[0] } });
    } catch (error) {
        console.error('Error obteniendo estadísticas:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/transactions/sellers', requireRole('admin'), async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        const result = await pool.query(
            `SELECT ct.*, u.username as seller_username, u2.username as user_username, u.role as seller_role
             FROM credit_transactions ct
             JOIN users u ON ct.from_user_id = u.id AND u.role = 'seller'
             JOIN users u2 ON ct.to_user_id = u2.id
             ORDER BY ct.created_at DESC
             LIMIT $1 OFFSET $2`,
            [parseInt(limit), offset]
        );
        res.json({ success: true, transactions: result.rows, pagination: { page: parseInt(page), limit: parseInt(limit) } });
    } catch (error) {
        console.error('Error obteniendo transacciones:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


// GET /api/settings/force-playwright - Público (sin autenticación)
router.get('/settings/force-playwright', async (req, res) => {
    try {
        const result = await pool.query(`SELECT value FROM global_settings WHERE key = 'force_playwright'`);
        let enabled = false;
        if (result.rows.length === 0) {
            // Insertar valor por defecto si no existe
            await pool.query(`INSERT INTO global_settings (key, value) VALUES ('force_playwright', 'false')`);
        } else {
            enabled = result.rows[0].value === 'true';
        }
        res.json({ success: true, enabled });
    } catch (error) {
        console.error('Error obteniendo force_playwright:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


// Ejemplo de endpoint para admin
router.get('/admin/user-insights/:userId', requireRole('admin'), async (req, res) => {
    const userId = req.params.userId;
    // Obtener todos los dispositivos usados por este usuario
    const devices = await pool.query(
        `SELECT device_fingerprint, COUNT(*) as access_count, 
         array_agg(DISTINCT ip_address) as ips,
         MAX(created_at) as last_seen
         FROM access_logs WHERE user_id = $1 GROUP BY device_fingerprint`,
        [userId]
    );
    // Buscar otros usuarios que hayan usado esos mismos fingerprints
    const relatedUsers = await pool.query(`
        SELECT DISTINCT al2.user_id, u.username 
        FROM access_logs al2
        JOIN users u ON al2.user_id = u.id
        WHERE al2.device_fingerprint IN (SELECT device_fingerprint FROM access_logs WHERE user_id = $1)
        AND al2.user_id != $1
    `, [userId]);
    
    res.json({ success: true, devices: devices.rows, relatedUsers: relatedUsers.rows });
});

module.exports = router;