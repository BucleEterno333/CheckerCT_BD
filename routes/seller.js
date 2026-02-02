// routes/seller.js
const express = require('express');
const router = express.Router();
const { authenticate, requireRole, trackActivity } = require('../middleware/auth');
const User = require('../models/User');

// Todas las rutas requieren autenticación
router.use(authenticate);

// ========== RUTAS DE SELLER ==========

// Añadir créditos a usuario
router.post('/add-credits', requireRole('seller', 'admin'), trackActivity, async (req, res) => {
    try {
        const { user_id, amount, reason = '' } = req.body;
        
        if (!user_id || !amount) {
            return res.status(400).json({ 
                success: false, 
                error: 'user_id y amount son requeridos' 
            });
        }
        
        if (amount <= 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'La cantidad debe ser mayor a 0' 
            });
        }
        
        // Verificar que no sea el mismo usuario
        if (parseInt(user_id) === req.user.id) {
            return res.status(400).json({ 
                success: false, 
                error: 'No puedes añadirte créditos a ti mismo' 
            });
        }
        
        // Verificar que el usuario receptor existe y es user (no seller/admin)
        const targetUser = await User.findById(user_id);
        if (!targetUser || targetUser.role !== 'user') {
            return res.status(400).json({ 
                success: false, 
                error: 'Solo puedes añadir créditos a usuarios normales' 
            });
        }
        
        const result = await User.addCreditsOrDays(
            req.user.id, 
            user_id, 
            'credits', 
            parseInt(amount), 
            reason
        );
        
        res.json({ 
            success: true,
            message: `Se añadieron ${amount} créditos a ${result.username}`,
            data: result
        });
        
    } catch (error) {
        console.error('Error añadiendo créditos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Añadir días a usuario
router.post('/add-days', requireRole('seller', 'admin'), trackActivity, async (req, res) => {
    try {
        const { user_id, amount, reason = '' } = req.body;
        
        if (!user_id || !amount) {
            return res.status(400).json({ 
                success: false, 
                error: 'user_id y amount son requeridos' 
            });
        }
        
        if (amount <= 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'La cantidad debe ser mayor a 0' 
            });
        }
        
        // Verificar que no sea el mismo usuario
        if (parseInt(user_id) === req.user.id) {
            return res.status(400).json({ 
                success: false, 
                error: 'No puedes añadirte días a ti mismo' 
            });
        }
        
        // Verificar que el usuario receptor existe y es user
        const targetUser = await User.findById(user_id);
        if (!targetUser || targetUser.role !== 'user') {
            return res.status(400).json({ 
                success: false, 
                error: 'Solo puedes añadir días a usuarios normales' 
            });
        }
        
        const result = await User.addCreditsOrDays(
            req.user.id, 
            user_id, 
            'days', 
            parseInt(amount), 
            reason
        );
        
        res.json({ 
            success: true,
            message: `Se añadieron ${amount} días a ${result.username}`,
            data: result
        });
        
    } catch (error) {
        console.error('Error añadiendo días:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Estadísticas del seller
router.get('/stats', requireRole('seller', 'admin'), async (req, res) => {
    try {
        const stats = await User.getSellerStats(req.user.id);
        
        res.json({ 
            success: true,
            stats
        });
        
    } catch (error) {
        console.error('Error obteniendo stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Historial de transacciones del seller
router.get('/transactions', requireRole('seller', 'admin'), async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        
        const transactions = await User.getSellerTransactions(
            req.user.id, 
            parseInt(page), 
            parseInt(limit)
        );
        
        res.json({ 
            success: true,
            transactions,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });
        
    } catch (error) {
        console.error('Error obteniendo transacciones:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Buscar usuario por username (para sellers)
router.get('/search-user', requireRole('seller', 'admin'), async (req, res) => {
    try {
        const { username } = req.query;
        
        if (!username) {
            return res.status(400).json({ 
                success: false, 
                error: 'username es requerido' 
            });
        }
        
        const result = await pool.query(
            `SELECT id, username, display_name, credits, days_remaining, 
                    role, created_at, is_active
             FROM users 
             WHERE username ILIKE $1 AND role = 'user'
             LIMIT 10`,
            [`%${username}%`]
        );
        
        res.json({ 
            success: true,
            users: result.rows
        });
        
    } catch (error) {
        console.error('Error buscando usuario:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;