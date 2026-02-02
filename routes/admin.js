// routes/admin.js
const express = require('express');
const router = express.Router();
const { authenticate, requireRole, trackActivity } = require('../middleware/auth');
const User = require('../models/User');

// Todas las rutas requieren autenticación
router.use(authenticate);

// ========== RUTAS DE ADMINISTRADOR ==========

// Cambiar rol de usuario (solo admin)
router.put('/users/:userId/role', requireRole('admin'), trackActivity, async (req, res) => {
    try {
        const { userId } = req.params;
        const { new_role } = req.body;
        
        if (!['user', 'seller', 'admin'].includes(new_role)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Rol inválido' 
            });
        }
        
        const result = await User.changeRole(userId, new_role, req.user.id);
        
        res.json({ 
            success: true,
            message: `Rol cambiado a ${new_role} exitosamente`,
            data: result
        });
        
    } catch (error) {
        console.error('Error cambiando rol:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Listar todos los usuarios (admin puede ver todos)
router.get('/users', requireRole('admin', 'seller'), async (req, res) => {
    try {
        const { role, page = 1, limit = 50 } = req.query;
        
        // Sellers solo ven usuarios normales, admin ve todos
        const allowedRoles = req.user.role === 'admin' ? role : 'user';
        
        const users = await User.listUsers(allowedRoles, parseInt(page), parseInt(limit));
        
        res.json({ 
            success: true,
            users,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });
        
    } catch (error) {
        console.error('Error listando usuarios:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Obtener transacciones de sellers (admin only)
router.get('/transactions/sellers', requireRole('admin'), async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        
        const result = await pool.query(
            `SELECT ct.*, 
                    u.username as seller_username,
                    u2.username as user_username,
                    u.role as seller_role
             FROM credit_transactions ct
             JOIN users u ON ct.from_user_id = u.id AND u.role = 'seller'
             JOIN users u2 ON ct.to_user_id = u2.id
             ORDER BY ct.created_at DESC
             LIMIT $1 OFFSET $2`,
            [parseInt(limit), (parseInt(page) - 1) * parseInt(limit)]
        );
        
        res.json({ 
            success: true,
            transactions: result.rows,
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

// Estadísticas de plataforma (admin only)
router.get('/stats/platform', requireRole('admin'), async (req, res) => {
    try {
        const stats = await pool.query(`
            SELECT 
                COUNT(*) as total_users,
                COUNT(CASE WHEN role = 'admin' THEN 1 END) as admin_count,
                COUNT(CASE WHEN role = 'seller' THEN 1 END) as seller_count,
                COUNT(CASE WHEN role = 'user' THEN 1 END) as user_count,
                SUM(credits) as total_credits,
                SUM(days_remaining) as total_days,
                COUNT(CASE WHEN is_active = FALSE THEN 1 END) as inactive_users,
                COUNT(CASE WHEN last_login >= NOW() - INTERVAL '7 days' THEN 1 END) as active_7d,
                COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as new_users_30d
            FROM users
        `);
        
        const transactions = await pool.query(`
            SELECT 
                COUNT(*) as total_transactions,
                SUM(CASE WHEN transaction_type = 'credits' THEN amount ELSE 0 END) as total_credits_given,
                SUM(CASE WHEN transaction_type = 'days' THEN amount ELSE 0 END) as total_days_given,
                COUNT(DISTINCT from_user_id) as total_sellers_active,
                COUNT(DISTINCT to_user_id) as total_users_credited
            FROM credit_transactions
            WHERE transaction_type IN ('credits', 'days')
        `);
        
        res.json({ 
            success: true,
            stats: {
                ...stats.rows[0],
                ...transactions.rows[0]
            }
        });
        
    } catch (error) {
        console.error('Error obteniendo estadísticas:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Desactivar/Activar usuario (admin only)
router.put('/users/:userId/status', requireRole('admin'), async (req, res) => {
    try {
        const { userId } = req.params;
        const { is_active } = req.body;
        
        if (typeof is_active !== 'boolean') {
            return res.status(400).json({ 
                success: false, 
                error: 'is_active debe ser true o false' 
            });
        }
        
        await pool.query(
            'UPDATE users SET is_active = $1 WHERE id = $2',
            [is_active, userId]
        );
        
        res.json({ 
            success: true,
            message: `Usuario ${is_active ? 'activado' : 'desactivado'} exitosamente`
        });
        
    } catch (error) {
        console.error('Error cambiando estado:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;