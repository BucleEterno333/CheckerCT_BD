// middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'checkerct-secret-key';

// Middleware de autenticación
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
        const user = await User.findById(decoded.id);
        
        if (!user || !user.is_active) {
            return res.status(401).json({ 
                success: false, 
                error: 'Usuario no encontrado o inactivo' 
            });
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

// Middleware para registrar IP y user agent
const trackActivity = async (req, res, next) => {
    req.clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    req.userAgent = req.headers['user-agent'];
    next();
};

module.exports = { 
    authenticate, 
    requireRole, 
    trackActivity,
    JWT_SECRET 
};