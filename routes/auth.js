const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { pool } = require('../database');
const { trackActivity } = require('../middleware/auth');
const { isDeviceBanned, logUserAccess, detectMulticuentas } = require('../utils/deviceUtils');

const JWT_SECRET = process.env.JWT_SECRET || 'checkerct-secret-key';
const { sendSafeMessage } = require('../bot_telegram');

// ========== REGISTRO ==========
router.post('/register', trackActivity, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { username, password, display_name, device_fingerprint } = req.body;
        if (!username || !password) return res.status(400).json({ success: false, error: 'Usuario y contraseña requeridos' });
        if (!/^[a-zA-Z0-9_]{5,32}$/.test(username)) return res.status(400).json({ success: false, error: 'Usuario inválido' });
        if (!/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{6,}$/.test(password)) return res.status(400).json({ success: false, error: 'Contraseña débil' });
        
        const existingUser = await client.query('SELECT id, telegram_chat_id FROM users WHERE username = $1', [username]);
        if (existingUser.rows.length === 0) return res.status(400).json({ success: false, error: 'Debes dar /start al bot primero' });
        const user = existingUser.rows[0];
        if (!user.telegram_chat_id) return res.status(400).json({ success: false, error: 'No tienes chat_id. Da /start al bot.' });
        
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        await client.query(
            `UPDATE users SET password_hash = $1, display_name = $2, credits = 4, days_remaining = 1, 
             telegram_username = $3, is_active = FALSE, updated_at = NOW() WHERE id = $4`,
            [passwordHash, display_name || username, `@${username}`, user.id]
        );
        
        const verificationCode = crypto.randomInt(100000, 999999).toString();
        const expiresAt = new Date(Date.now() + 2 * 60 * 1000);
        await client.query(`INSERT INTO verification_codes (user_id, code, expires_at) VALUES ($1, $2, $3)`, [user.id, verificationCode, expiresAt]);
        
        const { bot } = require('../bot_telegram');
        if (bot && user.telegram_chat_id) {
            await sendSafeMessage(user.telegram_chat_id, `🔐 Código: *${verificationCode}* (válido 2 min)`, { parse_mode: 'Markdown' });
        }
        await client.query('COMMIT');
        res.json({ success: true, requires_verification: true, user: { id: user.id, username } });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(error);
        res.status(500).json({ success: false, error: 'Error interno' });
    } finally { client.release(); }
});

// ========== SOLICITAR CÓDIGO ==========
router.post('/request-verification', trackActivity, async (req, res) => {
    const client = await pool.connect();
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ success: false, error: 'Usuario requerido' });
        const cleanUsername = username.replace(/^@/, '');
        const userResult = await client.query('SELECT id, telegram_chat_id FROM users WHERE username = $1', [cleanUsername]);
        if (userResult.rows.length === 0) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        const user = userResult.rows[0];
        if (!user.telegram_chat_id) return res.status(400).json({ success: false, error: 'No tienes chat_id. Da /start al bot.' });
        
        await client.query('DELETE FROM verification_codes WHERE user_id = $1', [user.id]);
        const code = crypto.randomInt(100000, 999999).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        await client.query(`INSERT INTO verification_codes (user_id, code, expires_at) VALUES ($1, $2, $3)`, [user.id, code, expiresAt]);
        const { bot } = require('../bot_telegram');
        if (bot && user.telegram_chat_id) {
            await sendSafeMessage(user.telegram_chat_id, `🔐 Nuevo código: *${code}* (válido 10 min)`, { parse_mode: 'Markdown' });
        }
        await client.query('COMMIT');
        res.json({ success: true, message: 'Código reenviado' });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, error: 'Error interno' });
    } finally { client.release(); }
});

// ========== VERIFICAR CÓDIGO ==========
router.post('/verify-code', trackActivity, async (req, res) => {
    const client = await pool.connect();
    try {
        const { username, code } = req.body;
        if (!username || !code) return res.status(400).json({ success: false, error: 'Datos incompletos' });
        const cleanUsername = username.replace(/^@/, '');
        const result = await client.query(
            `SELECT u.id, u.is_active, vc.expires_at FROM users u
             JOIN verification_codes vc ON u.id = vc.user_id
             WHERE u.username = $1 AND vc.code = $2 ORDER BY vc.created_at DESC LIMIT 1`,
            [cleanUsername, code]
        );
        if (result.rows.length === 0) return res.status(400).json({ success: false, error: 'Código incorrecto' });
        const { id, is_active, expires_at } = result.rows[0];
        if (new Date(expires_at) < new Date()) return res.status(400).json({ success: false, error: 'Código expirado' });
        if (is_active) return res.status(400).json({ success: false, error: 'Ya verificada' });
        await client.query(`UPDATE users SET is_active = TRUE, telegram_verified = TRUE, verified_at = NOW() WHERE id = $1`, [id]);
        await client.query(`DELETE FROM verification_codes WHERE user_id = $1`, [id]);
        await client.query('COMMIT');
        res.json({ success: true, message: 'Cuenta verificada' });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, error: 'Error interno' });
    } finally { client.release(); }
});

// ========== LOGIN (CORREGIDO, SIN DUPLICADO) ==========
router.post('/login', trackActivity, async (req, res) => {
    try {
        const { username, password, device_fingerprint } = req.body;
        if (!username || !password) return res.status(400).json({ success: false, error: 'Datos incompletos' });
        const cleanUsername = username.replace(/^@/, '');
        
        if (device_fingerprint && await isDeviceBanned(device_fingerprint)) {
            return res.status(403).json({ success: false, error: 'Dispositivo baneado' });
        }
        
        const userResult = await pool.query(`SELECT * FROM users WHERE username = $1`, [cleanUsername]);
        if (userResult.rows.length === 0) return res.status(401).json({ success: false, error: 'Credenciales incorrectas' });
        const user = userResult.rows[0];
        if (!user.is_active) return res.status(403).json({ success: false, error: 'Cuenta no verificada', requires_verification: true });
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) return res.status(401).json({ success: false, error: 'Credenciales incorrectas' });
        if (user.credits <= 0) return res.status(403).json({ success: false, error: 'No tienes créditos' });
        
        if (device_fingerprint) {
            const ip = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
            const userAgent = req.headers['user-agent'];
            await logUserAccess(user.id, device_fingerprint, ip, userAgent, req);
            await detectMulticuentas(device_fingerprint, user.id, user.username);
        }
        
        await pool.query(`UPDATE users SET last_login = NOW() WHERE id = $1`, [user.id]);
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
        const safeUser = { id: user.id, username: user.username, display_name: user.display_name, credits: user.credits, days_remaining: user.days_remaining, role: user.role };
        res.json({ success: true, token, user: safeUser });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

// ========== VERIFICAR TOKEN ==========
router.post('/verify', trackActivity, async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ success: false, error: 'Token requerido' });
        const decoded = jwt.verify(token, JWT_SECRET);
        const userResult = await pool.query(`SELECT id, username, display_name, credits, days_remaining, role, is_active FROM users WHERE id = $1`, [decoded.id]);
        if (userResult.rows.length === 0 || !userResult.rows[0].is_active) return res.status(401).json({ success: false, error: 'Usuario no válido' });
        res.json({ success: true, user: userResult.rows[0] });
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') return res.status(403).json({ success: false, error: 'Token inválido' });
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

// ========== VERIFICAR DISPONIBILIDAD ==========
router.get('/check-username/:username', async (req, res) => {
    try {
        const cleanUsername = req.params.username.replace(/^@/, '');
        const result = await pool.query('SELECT id FROM users WHERE username = $1', [cleanUsername]);
        res.json({ success: true, available: result.rows.length === 0 });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error interno' });
    }
});

// ========== RECUPERAR CONTRASEÑA ==========
router.post('/forgot-password', trackActivity, async (req, res) => {
    const client = await pool.connect();
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ success: false, error: 'Usuario requerido' });
        const cleanUsername = username.replace(/^@/, '');
        const userResult = await client.query(`SELECT id, telegram_chat_id FROM users WHERE username = $1`, [cleanUsername]);
        if (userResult.rows.length === 0) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        const user = userResult.rows[0];
        if (!user.telegram_chat_id) return res.status(400).json({ success: false, error: 'Sin chat_id, da /start al bot' });
        const resetCode = crypto.randomInt(100000, 999999).toString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
        await client.query(`INSERT INTO password_reset_codes (user_id, code, expires_at) VALUES ($1, $2, $3)`, [user.id, resetCode, expiresAt]);
        const { bot } = require('../bot_telegram');
        if (bot && user.telegram_chat_id) {
            await sendSafeMessage(user.telegram_chat_id, `🔐 Código recuperación: *${resetCode}* (válido 15 min)`, { parse_mode: 'Markdown' });
        }
        await client.query('COMMIT');
        res.json({ success: true, message: 'Código enviado' });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, error: 'Error interno' });
    } finally { client.release(); }
});

// ========== RESETEAR CONTRASEÑA ==========
router.post('/reset-password', trackActivity, async (req, res) => {
    const client = await pool.connect();
    try {
        const { username, code, newPassword } = req.body;
        if (!username || !code || !newPassword) return res.status(400).json({ success: false, error: 'Datos incompletos' });
        const cleanUsername = username.replace(/^@/, '');
        const result = await client.query(
            `SELECT u.id, prc.expires_at FROM users u JOIN password_reset_codes prc ON u.id = prc.user_id 
             WHERE u.username = $1 AND prc.code = $2 AND prc.used = FALSE ORDER BY prc.created_at DESC LIMIT 1`,
            [cleanUsername, code]
        );
        if (result.rows.length === 0) return res.status(400).json({ success: false, error: 'Código incorrecto' });
        const { id, expires_at } = result.rows[0];
        if (new Date(expires_at) < new Date()) return res.status(400).json({ success: false, error: 'Código expirado' });
        const salt = await bcrypt.genSalt(10);
        const newHash = await bcrypt.hash(newPassword, salt);
        await client.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [newHash, id]);
        await client.query(`UPDATE password_reset_codes SET used = TRUE WHERE user_id = $1 AND code = $2`, [id, code]);
        await client.query('COMMIT');
        res.json({ success: true, message: 'Contraseña actualizada' });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, error: 'Error interno' });
    } finally { client.release(); }
});

module.exports = router;