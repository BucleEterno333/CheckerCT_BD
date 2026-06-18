const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { logUserAccess } = require('../utils/deviceUtils');
const { pool } = require('../database');
const JWT_SECRET = process.env.JWT_SECRET || 'checkerct-secret-key';

// Middleware de autenticación (ahora también guarda log de acceso)
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                error: 'Token de autenticación requerido' 
            });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        const userResult = await pool.query(
            'SELECT id, username, role, credits, days_remaining, is_active, device_fingerprint FROM users WHERE id = $1',
            [decoded.id]
        );
        const user = userResult.rows[0];
        
        if (!user || !user.is_active) {
            return res.status(401).json({ 
                success: false, 
                error: 'Usuario no encontrado o inactivo' 
            });
        }
        
        if (user.credits <= 0) {
            return res.status(401).json({
                success: false,
                error: 'No tienes créditos disponibles. Tu sesión ha sido cerrada.',
                credits_zero: true
            });
        }

        // ✅ GUARDAR LOG DE ACCESO (solo si el usuario está autenticado)
        try {
            const ip = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || req.ip || '0.0.0.0';
            const userAgent = req.headers['user-agent'] || '';
            // Usar el fingerprint que ya tiene el usuario (si lo tiene)
            const deviceFingerprint = user.device_fingerprint || null;
            await logUserAccess(user.id, deviceFingerprint, ip, userAgent, req);
        } catch (logError) {
            console.error('❌ Error guardando log de acceso en authenticate:', logError.message);
        }

        req.user = user;
        next();
        
    } catch (error) {
        return res.status(403).json({ 
            success: false, 
            error: 'Token inválido o expirado' 
        });
    }
};

// Middleware para verificar roles específicos
const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ 
                success: false, 
                error: 'Autenticación requerida' 
            });
        }
        
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ 
                success: false, 
                error: 'No tienes permisos para esta acción' 
            });
        }
        
        next();
    };
};

// Middleware para registrar IP y user agent (opcional, lo usamos para trackActivity)
const trackActivity = async (req, res, next) => {
    req.clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    req.userAgent = req.headers['user-agent'];
    next();
};

// Autenticación opcional (no bloquea si no hay token)
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        if (!token) return next();

        const decoded = jwt.verify(token, JWT_SECRET);
        const userResult = await pool.query(
            'SELECT id, username, role, credits, days_remaining, is_active, device_fingerprint FROM users WHERE id = $1',
            [decoded.id]
        );
        const user = userResult.rows[0];
        if (user && user.is_active && user.credits > 0) {
            req.user = user;
            // Guardar log de acceso para usuarios autenticados (opcional)
            try {
                const ip = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || req.ip || '0.0.0.0';
                const userAgent = req.headers['user-agent'] || '';
                const deviceFingerprint = user.device_fingerprint || null;
                await logUserAccess(user.id, deviceFingerprint, ip, userAgent, req);
            } catch (logError) {
                console.error('Error en optionalAuth log:', logError.message);
            }
        }
    } catch (error) {
        // Token inválido -> ignorar (no bloquea)
    }
    next();
};

module.exports = { 
    authenticate, 
    requireRole, 
    trackActivity,
    optionalAuth, 
    JWT_SECRET 
};