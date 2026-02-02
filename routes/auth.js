// routes/auth.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { pool } = require('../database');
const { trackActivity } = require('../middleware/auth');
const TelegramBot = require('node-telegram-bot-api');

const JWT_SECRET = process.env.JWT_SECRET || 'checkerct-secret-key';

// Inicializar bot de Telegram
let bot;
if (process.env.TELEGRAM_BOT_TOKEN) {
    bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { 
        polling: false,
        onlyFirstMatch: true
    });
    console.log('✅ Bot de Telegram inicializado');
} else {
    console.warn('⚠️  TELEGRAM_BOT_TOKEN no configurado. Verificación por Telegram desactivada.');
}

// ========== REGISTRO ==========
router.post('/register', trackActivity, async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const { username, password, display_name } = req.body;
        
        // Validaciones básicas
        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'Usuario y contraseña son requeridos' 
            });
        }
        
        // Validar formato de username (Telegram)
        if (!/^[a-zA-Z0-9_]{5,32}$/.test(username)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Usuario debe tener 5-32 caracteres (solo letras, números y guiones bajos)' 
            });
        }
        
        // Validar contraseña
        if (!/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{6,}$/.test(password)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Contraseña debe tener mínimo 6 caracteres con 1 letra y 1 número' 
            });
        }
        
        // Verificar si usuario existe
        const existingUser = await client.query(
            'SELECT id FROM users WHERE username = $1',
            [username]
        );
        
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Nombre de usuario ya está en uso' 
            });
        }
        
        // Hash de contraseña
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        
        // Crear usuario (NO activado hasta verificación)
        const userResult = await client.query(
            `INSERT INTO users 
             (username, password_hash, display_name, credits, days_remaining, 
              telegram_username, is_active, created_at)
             VALUES ($1, $2, $3, 20, 7, $4, FALSE, NOW())
             RETURNING id, username, display_name, credits, days_remaining`,
            [
                username,
                passwordHash,
                display_name || username,
                username // telegram_username
            ]
        );
        
        const user = userResult.rows[0];
        
        // Generar código de verificación
        const verificationCode = crypto.randomInt(100000, 999999).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos
        
        await client.query(
            `INSERT INTO verification_codes 
             (user_id, code, expires_at, created_at)
             VALUES ($1, $2, $3, NOW())`,
            [user.id, verificationCode, expiresAt]
        );
        
        // Enviar código por Telegram (si el bot está configurado)
        if (bot && process.env.NODE_ENV === 'production') {
            try {
                await bot.sendMessage(
                    username.startsWith('@') ? username.substring(1) : username,
                    `🔐 *Código de verificación - CiberTerroristasCHK*\n\n` +
                    `Tu código es: *${verificationCode}*\n` +
                    `Válido por 10 minutos.\n\n` +
                    `⚠️ *No compartas este código con nadie.*\n` +
                    `Si no solicitaste esto, ignora este mensaje.`,
                    { parse_mode: 'Markdown' }
                );
                
                console.log(`✅ Código enviado a @${username}: ${verificationCode}`);
                
            } catch (telegramError) {
                console.error('❌ Error enviando código por Telegram:', telegramError);
                
                // Si no se puede enviar por Telegram, guardar en logs
                await client.query(
                    `INSERT INTO verification_logs 
                     (user_id, code, sent_via, status, error_message, created_at)
                     VALUES ($1, $2, 'telegram', 'failed', $3, NOW())`,
                    [user.id, verificationCode, telegramError.message]
                );
                
                // No fallar el registro, pero informar al usuario
                user.telegram_error = true;
            }
        }
        
        // En desarrollo, mostrar código en consola
        if (process.env.NODE_ENV !== 'production') {
            console.log(`🔐 [DEV] Código para ${username}: ${verificationCode}`);
        }
        
        await client.query('COMMIT');
        
        res.json({ 
            success: true,
            user: {
                id: user.id,
                username: user.username,
                display_name: user.display_name,
                credits: user.credits,
                days_remaining: user.days_remaining
            },
            requires_verification: true,
            telegram_sent: !user.telegram_error,
            message: 'Registro exitoso. Verifica tu cuenta con el código enviado por Telegram.'
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en registro:', error);
        res.status(500).json({ success: false, error: 'Error interno del servidor' });
    } finally {
        client.release();
    }
});

// ========== SOLICITAR CÓDIGO DE VERIFICACIÓN ==========
router.post('/request-verification', trackActivity, async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const { username } = req.body;
        
        if (!username) {
            return res.status(400).json({ 
                success: false, 
                error: 'Username es requerido' 
            });
        }
        
        // Buscar usuario
        const userResult = await client.query(
            `SELECT id, username, is_active 
             FROM users 
             WHERE username = $1 OR telegram_username = $1`,
            [username]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Usuario no encontrado' 
            });
        }
        
        const user = userResult.rows[0];
        
        // Si ya está activo, no necesita verificación
        if (user.is_active) {
            return res.status(400).json({ 
                success: false, 
                error: 'La cuenta ya está verificada' 
            });
        }
        
        // Eliminar códigos anteriores del usuario
        await client.query(
            'DELETE FROM verification_codes WHERE user_id = $1',
            [user.id]
        );
        
        // Generar nuevo código
        const verificationCode = crypto.randomInt(100000, 999999).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos
        
        await client.query(
            `INSERT INTO verification_codes 
             (user_id, code, expires_at, created_at)
             VALUES ($1, $2, $3, NOW())`,
            [user.id, verificationCode, expiresAt]
        );
        
        // Enviar por Telegram
        let telegramSent = false;
        let telegramError = null;
        
        if (bot) {
            try {
                const telegramUsername = user.telegram_username || user.username;
                const chatId = telegramUsername.startsWith('@') ? 
                    telegramUsername.substring(1) : telegramUsername;
                
                await bot.sendMessage(
                    chatId,
                    `🔐 *Código de verificación - CiberTerroristasCHK*\n\n` +
                    `Solicitaste un nuevo código.\n` +
                    `Tu código es: *${verificationCode}*\n` +
                    `Válido por 10 minutos.\n\n` +
                    `⚠️ *No compartas este código con nadie.*`,
                    { parse_mode: 'Markdown' }
                );
                
                telegramSent = true;
                console.log(`✅ Código reenviado a @${chatId}`);
                
                await client.query(
                    `INSERT INTO verification_logs 
                     (user_id, code, sent_via, status, created_at)
                     VALUES ($1, $2, 'telegram', 'sent', NOW())`,
                    [user.id, verificationCode]
                );
                
            } catch (error) {
                telegramError = error.message;
                console.error('❌ Error enviando código:', error);
                
                await client.query(
                    `INSERT INTO verification_logs 
                     (user_id, code, sent_via, status, error_message, created_at)
                     VALUES ($1, $2, 'telegram', 'failed', $3, NOW())`,
                    [user.id, verificationCode, error.message]
                );
            }
        }
        
        await client.query('COMMIT');
        
        res.json({ 
            success: true,
            telegram_sent: telegramSent,
            telegram_error: telegramError,
            message: telegramSent ? 
                'Código enviado por Telegram' : 
                'Error enviando código por Telegram'
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error solicitando verificación:', error);
        res.status(500).json({ success: false, error: 'Error interno del servidor' });
    } finally {
        client.release();
    }
});

// ========== VERIFICAR CÓDIGO ==========
router.post('/verify-code', trackActivity, async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const { username, code } = req.body;
        
        if (!username || !code) {
            return res.status(400).json({ 
                success: false, 
                error: 'Usuario y código son requeridos' 
            });
        }
        
        // Buscar usuario
        const userResult = await client.query(
            `SELECT u.id, u.username, u.is_active, vc.code, vc.expires_at
             FROM users u
             LEFT JOIN verification_codes vc ON u.id = vc.user_id
             WHERE (u.username = $1 OR u.telegram_username = $1) 
               AND vc.code = $2
             ORDER BY vc.created_at DESC
             LIMIT 1`,
            [username, code]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Código incorrecto o usuario no encontrado' 
            });
        }
        
        const data = userResult.rows[0];
        
        // Verificar expiración
        if (new Date(data.expires_at) < new Date()) {
            return res.status(400).json({ 
                success: false, 
                error: 'Código expirado. Solicita uno nuevo.' 
            });
        }
        
        // Si ya está activo
        if (data.is_active) {
            return res.status(400).json({ 
                success: false, 
                error: 'La cuenta ya está verificada' 
            });
        }
        
        // Activar usuario
        await client.query(
            `UPDATE users 
             SET is_active = TRUE, 
                 telegram_verified = TRUE,
                 verified_at = NOW()
             WHERE id = $1`,
            [data.id]
        );
        
        // Eliminar código usado
        await client.query(
            'DELETE FROM verification_codes WHERE user_id = $1',
            [data.id]
        );
        
        // Registrar verificación exitosa
        await client.query(
            `INSERT INTO verification_logs 
             (user_id, code, sent_via, status, created_at)
             VALUES ($1, $2, 'telegram', 'verified', NOW())`,
            [data.id, code]
        );
        
        await client.query('COMMIT');
        
        res.json({ 
            success: true,
            message: '✅ Cuenta verificada exitosamente. Ahora puedes iniciar sesión.'
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error verificando código:', error);
        res.status(500).json({ success: false, error: 'Error interno del servidor' });
    } finally {
        client.release();
    }
});

// ========== LOGIN ==========
router.post('/login', trackActivity, async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'Usuario y contraseña son requeridos' 
            });
        }
        
        // Buscar usuario
        const userResult = await pool.query(
            `SELECT u.* 
             FROM users u
             WHERE u.username = $1 OR u.telegram_username = $1`,
            [username]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(401).json({ 
                success: false, 
                error: 'Usuario o contraseña incorrectos' 
            });
        }
        
        const user = userResult.rows[0];
        
        // Verificar si la cuenta está activa
        if (!user.is_active) {
            return res.status(403).json({ 
                success: false, 
                error: 'Cuenta no verificada. Revisa tu Telegram para el código de verificación.',
                requires_verification: true,
                username: user.username
            });
        }
        
        // Verificar contraseña
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ 
                success: false, 
                error: 'Usuario o contraseña incorrectos' 
            });
        }
        
        // Actualizar último login
        await pool.query(
            'UPDATE users SET last_login = NOW() WHERE id = $1',
            [user.id]
        );
        
        // Generar token
        const token = jwt.sign(
            { 
                id: user.id, 
                username: user.username,
                role: user.role 
            },
            JWT_SECRET,
            { expiresIn: '30d' }
        );
        
        // Ocultar datos sensibles
        const safeUser = {
            id: user.id,
            username: user.username,
            display_name: user.display_name,
            credits: user.credits,
            days_remaining: user.days_remaining,
            role: user.role,
            total_checks: user.total_checks,
            total_lives: user.total_lives,
            created_at: user.created_at,
            telegram_verified: user.telegram_verified,
            telegram_username: user.telegram_username
        };
        
        res.json({ 
            success: true,
            token,
            user: safeUser,
            message: 'Login exitoso'
        });
        
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ success: false, error: 'Error interno del servidor' });
    }
});

// ========== VERIFICAR TOKEN ==========
router.post('/verify', trackActivity, async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                error: 'Token requerido' 
            });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        
        const userResult = await pool.query(
            `SELECT id, username, display_name, credits, days_remaining, 
                    role, total_checks, total_lives, is_active,
                    telegram_verified, telegram_username
             FROM users WHERE id = $1`,
            [decoded.id]
        );
        
        if (userResult.rows.length === 0 || !userResult.rows[0].is_active) {
            return res.status(401).json({ 
                success: false, 
                error: 'Usuario no válido' 
            });
        }
        
        const user = userResult.rows[0];
        
        res.json({ 
            success: true,
            user: {
                id: user.id,
                username: user.username,
                display_name: user.display_name,
                credits: user.credits,
                days_remaining: user.days_remaining,
                role: user.role,
                total_checks: user.total_checks,
                total_lives: user.total_lives,
                telegram_verified: user.telegram_verified,
                telegram_username: user.telegram_username
            }
        });
        
    } catch (error) {
        console.error('Error verificando token:', error);
        
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(403).json({ 
                success: false, 
                error: 'Token inválido o expirado' 
            });
        }
        
        res.status(500).json({ 
            success: false, 
            error: 'Error interno del servidor' 
        });
    }
});

// ========== VERIFICAR DISPONIBILIDAD DE USUARIO ==========
router.get('/check-username/:username', async (req, res) => {
    try {
        const { username } = req.params;
        
        const result = await pool.query(
            'SELECT id FROM users WHERE username = $1 OR telegram_username = $1',
            [username]
        );
        
        res.json({ 
            success: true,
            available: result.rows.length === 0,
            message: result.rows.length > 0 ? 
                'Usuario ya registrado' : 
                'Usuario disponible'
        });
        
    } catch (error) {
        console.error('Error verificando usuario:', error);
        res.status(500).json({ success: false, error: 'Error interno del servidor' });
    }
});

// ========== RECUPERAR CONTRASEÑA ==========
router.post('/forgot-password', trackActivity, async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const { username } = req.body;
        
        if (!username) {
            return res.status(400).json({ 
                success: false, 
                error: 'Usuario es requerido' 
            });
        }
        
        // Buscar usuario
        const userResult = await client.query(
            `SELECT id, username, telegram_username, is_active
             FROM users 
             WHERE username = $1 OR telegram_username = $1`,
            [username]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Usuario no encontrado' 
            });
        }
        
        const user = userResult.rows[0];
        
        if (!user.is_active) {
            return res.status(400).json({ 
                success: false, 
                error: 'La cuenta no está verificada' 
            });
        }
        
        // Generar código de recuperación
        const resetCode = crypto.randomInt(100000, 999999).toString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos
        
        await client.query(
            `INSERT INTO password_reset_codes 
             (user_id, code, expires_at, created_at)
             VALUES ($1, $2, $3, NOW())`,
            [user.id, resetCode, expiresAt]
        );
        
        // Enviar por Telegram
        if (bot && user.telegram_username) {
            try {
                await bot.sendMessage(
                    user.telegram_username.startsWith('@') ? 
                        user.telegram_username.substring(1) : user.telegram_username,
                    `🔐 *Recuperación de contraseña - CiberTerroristasCHK*\n\n` +
                    `Tu código de recuperación es: *${resetCode}*\n` +
                    `Válido por 15 minutos.\n\n` +
                    `⚠️ *No compartas este código con nadie.*\n` +
                    `Si no solicitaste esto, ignora este mensaje.`,
                    { parse_mode: 'Markdown' }
                );
                
                console.log(`✅ Código de recuperación enviado a @${user.telegram_username}`);
                
            } catch (error) {
                console.error('❌ Error enviando código de recuperación:', error);
            }
        }
        
        await client.query('COMMIT');
        
        res.json({ 
            success: true,
            message: 'Código de recuperación enviado por Telegram',
            telegram_sent: !!user.telegram_username
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en recuperación:', error);
        res.status(500).json({ success: false, error: 'Error interno del servidor' });
    } finally {
        client.release();
    }
});

// ========== RESETEAR CONTRASEÑA ==========
router.post('/reset-password', trackActivity, async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const { username, code, newPassword } = req.body;
        
        if (!username || !code || !newPassword) {
            return res.status(400).json({ 
                success: false, 
                error: 'Todos los campos son requeridos' 
            });
        }
        
        // Validar nueva contraseña
        if (!/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{6,}$/.test(newPassword)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Contraseña debe tener mínimo 6 caracteres con 1 letra y 1 número' 
            });
        }
        
        // Verificar código
        const result = await client.query(
            `SELECT u.id, prc.expires_at
             FROM users u
             JOIN password_reset_codes prc ON u.id = prc.user_id
             WHERE (u.username = $1 OR u.telegram_username = $1) 
               AND prc.code = $2
               AND prc.used = FALSE
             ORDER BY prc.created_at DESC
             LIMIT 1`,
            [username, code]
        );
        
        if (result.rows.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Código incorrecto o expirado' 
            });
        }
        
        const { id, expires_at } = result.rows[0];
        
        // Verificar expiración
        if (new Date(expires_at) < new Date()) {
            return res.status(400).json({ 
                success: false, 
                error: 'Código expirado' 
            });
        }
        
        // Hashear nueva contraseña
        const salt = await bcrypt.genSalt(10);
        const newPasswordHash = await bcrypt.hash(newPassword, salt);
        
        // Actualizar contraseña
        await client.query(
            'UPDATE users SET password_hash = $1 WHERE id = $2',
            [newPasswordHash, id]
        );
        
        // Marcar código como usado
        await client.query(
            'UPDATE password_reset_codes SET used = TRUE WHERE user_id = $1 AND code = $2',
            [id, code]
        );
        
        await client.query('COMMIT');
        
        res.json({ 
            success: true,
            message: '✅ Contraseña actualizada exitosamente. Ahora puedes iniciar sesión.'
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error reseteando contraseña:', error);
        res.status(500).json({ success: false, error: 'Error interno del servidor' });
    } finally {
        client.release();
    }
});

module.exports = router;