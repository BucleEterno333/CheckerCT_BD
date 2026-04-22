// middleware/serviceGuard.js
const { getSetting } = require('../database');

async function serviceGuard(req, res, next) {
    try {
        // Asumimos que ya tienes el usuario en req.user (por authMiddleware)
        const user = req.user;
        if (!user) {
            return res.status(401).json({ success: false, error: 'No autorizado' });
        }

        const isEnabled = await getSetting('cookie_generator_enabled', true);
        const isAdmin = (user.role === 'admin');

        if (!isEnabled && !isAdmin) {
            return res.status(503).json({
                success: false,
                error: 'El generador de cookies está deshabilitado temporalmente. Contacta al administrador.'
            });
        }
        next();
    } catch (error) {
        console.error('Error en serviceGuard:', error);
        res.status(500).json({ success: false, error: 'Error interno' });
    }
}

module.exports = serviceGuard;