const express = require('express');
const router = express.Router();
const { authenticate, requireRole, trackActivity } = require('../middleware/auth');
const User = require('../models/User');
const { pool } = require('../database');

// Todas las rutas requieren autenticación
router.use(authenticate);

// ========== LISTAR USUARIOS CON PAGINACIÓN CORRECTA ==========
router.get('/users', requireRole('admin', 'seller'), async (req, res) => {
    try {
        const { role, page = 1, limit = 20, search = '' } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        
        let query = `
            SELECT id, username, display_name, credits, days_remaining, 
                   role, total_checks, total_lives, created_at, last_login, is_active
            FROM users WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;
        
        // Filtro por rol (si se especifica y el usuario es admin puede filtrar cualquier rol, si es seller solo ve 'user')
        if (req.user.role === 'admin' && role) {
            query += ` AND role = $${paramIndex}`;
            params.push(role);
            paramIndex++;
        } else if (req.user.role === 'seller') {
            query += ` AND role = 'user'`;
        }
        
        // Búsqueda por username
        if (search) {
            query += ` AND username ILIKE $${paramIndex}`;
            params.push(`%${search}%`);
            paramIndex++;
        }
        
        query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), offset);
        
        const result = await pool.query(query, params);
        
        // Obtener total de usuarios (sin paginación)
        let countQuery = `SELECT COUNT(*) as total FROM users WHERE 1=1`;
        const countParams = [];
        let countIndex = 1;
        if (req.user.role === 'admin' && role) {
            countQuery += ` AND role = $${countIndex}`;
            countParams.push(role);
            countIndex++;
        } else if (req.user.role === 'seller') {
            countQuery += ` AND role = 'user'`;
        }
        if (search) {
            countQuery += ` AND username ILIKE $${countIndex}`;
            countParams.push(`%${search}%`);
        }
        const totalResult = await pool.query(countQuery, countParams);
        const total = parseInt(totalResult.rows[0].total);
        
        res.json({ 
            success: true,
            users: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total,
                totalPages: Math.ceil(total / parseInt(limit))
            }
        });
        
    } catch (error) {
        console.error('Error listando usuarios:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== OBTENER UN USUARIO POR ID ==========
router.get('/users/:userId', requireRole('admin'), async (req, res) => {
    try {
        const { userId } = req.params;
        const result = await pool.query(
            `SELECT id, username, display_name, credits, days_remaining, role, 
                    is_active, created_at, last_login, telegram_username, telegram_verified
             FROM users WHERE id = $1`,
            [userId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        }
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
        if (isNaN(newCredits) || newCredits < 0) {
            return res.status(400).json({ success: false, error: 'Créditos inválidos' });
        }

        const userIdInt = parseInt(userId, 10);
        const adminId = req.user.id;

        const userResult = await client.query(
            'SELECT id, username, credits FROM users WHERE id = $1 FOR UPDATE',
            [userIdInt]
        );
        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        }

        const user = userResult.rows[0];
        const oldCredits = parseInt(user.credits, 10);
        const amount = newCredits - oldCredits;

        await client.query(
            'UPDATE users SET credits = $1, updated_at = NOW() WHERE id = $2',
            [newCredits, userIdInt]
        );

        if (amount !== 0) {
            await client.query(
                `INSERT INTO credit_transactions 
                 (from_user_id, to_user_id, transaction_type, amount, previous_amount, new_amount, reason, created_at)
                 VALUES ($1, $2, 'credits', $3, $4, $5, $6, NOW())`,
                [adminId, userIdInt, amount, oldCredits, newCredits, reason || 'Ajuste por administrador']
            );
        }

        await client.query('COMMIT');
        res.json({ success: true, message: 'Créditos actualizados', old: oldCredits, new: newCredits });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error actualizando créditos:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
});

// ========== ACTUALIZAR DÍAS ==========
router.put('/users/:userId/days', requireRole('admin'), trackActivity, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { userId } = req.params;
        let { days, reason = '' } = req.body;

        const newDays = parseInt(days, 10);
        if (isNaN(newDays) || newDays < 0) {
            return res.status(400).json({ success: false, error: 'Días inválidos' });
        }

        const userIdInt = parseInt(userId, 10);
        const adminId = req.user.id;

        const userResult = await client.query(
            'SELECT id, username, days_remaining FROM users WHERE id = $1 FOR UPDATE',
            [userIdInt]
        );
        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        }

        const user = userResult.rows[0];
        const oldDays = parseInt(user.days_remaining, 10);
        const amount = newDays - oldDays;

        await client.query(
            'UPDATE users SET days_remaining = $1, updated_at = NOW() WHERE id = $2',
            [newDays, userIdInt]
        );

        if (amount !== 0) {
            await client.query(
                `INSERT INTO credit_transactions 
                 (from_user_id, to_user_id, transaction_type, amount, previous_amount, new_amount, reason, created_at)
                 VALUES ($1, $2, 'days', $3, $4, $5, $6, NOW())`,
                [adminId, userIdInt, amount, oldDays, newDays, reason || 'Ajuste por administrador']
            );
        }

        await client.query('COMMIT');
        res.json({ success: true, message: 'Días actualizados', old: oldDays, new: newDays });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error actualizando días:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        client.release();
    }
});

// ========== CAMBIAR ROL ==========
router.put('/users/:userId/role', requireRole('admin'), trackActivity, async (req, res) => {
    try {
        const { userId } = req.params;
        const { new_role } = req.body;
        
        if (!['user', 'seller', 'admin'].includes(new_role)) {
            return res.status(400).json({ success: false, error: 'Rol inválido' });
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

// ========== CAMBIAR ESTADO (ACTIVAR/DESACTIVAR) ==========
router.put('/users/:userId/status', requireRole('admin'), async (req, res) => {
    try {
        const { userId } = req.params;
        const { is_active } = req.body;
        
        if (typeof is_active !== 'boolean') {
            return res.status(400).json({ success: false, error: 'is_active debe ser true o false' });
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

// ========== ESTADÍSTICAS DE PLATAFORMA ==========
router.get('/stats/platform', requireRole('admin'), async (req, res) => {
    try {
        const stats = await pool.query(`
            SELECT 
                COUNT(*) as total_users,
                COUNT(CASE WHEN role = 'admin' THEN 1 END) as admin_count,
                COUNT(CASE WHEN role = 'seller' THEN 1 END) as seller_count,
                COUNT(CASE WHEN role = 'user' THEN 1 END) as user_count,
                COALESCE(SUM(credits), 0) as total_credits,
                COALESCE(SUM(days_remaining), 0) as total_days,
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

// ========== OBTENER TRANSACCIONES DE SELLERS ==========
router.get('/transactions/sellers', requireRole('admin'), async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        
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
            [parseInt(limit), offset]
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

module.exports = router;