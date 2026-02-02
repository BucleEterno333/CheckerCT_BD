// models/User.js
const { pool } = require('../database');
const bcrypt = require('bcryptjs');

class User {
    // Buscar por username
    static async findByUsername(username) {
        const result = await pool.query(
            'SELECT * FROM users WHERE username = $1',
            [username]
        );
        return result.rows[0];
    }

    // Buscar por ID
    static async findById(id) {
        const result = await pool.query(
            `SELECT id, username, display_name, credits, days_remaining, 
                    role, total_checks, total_lives, created_at, last_login,
                    is_active, created_by, seller_since
             FROM users WHERE id = $1`,
            [id]
        );
        return result.rows[0];
    }

    // Crear nuevo usuario
    static async create(username, password, displayName = null, createdBy = null) {
        const passwordHash = await bcrypt.hash(password, 10);
        
        const result = await pool.query(
            `INSERT INTO users 
             (username, password_hash, display_name, credits, days_remaining, created_by)
             VALUES ($1, $2, $3, 20, 7, $4)
             RETURNING id, username, display_name, credits, days_remaining, role, created_at`,
            [username, passwordHash, displayName || username, createdBy]
        );
        
        return result.rows[0];
    }

    // Verificar contraseña
    static async verifyPassword(user, password) {
        return await bcrypt.compare(password, user.password_hash);
    }

    // Actualizar último login
    static async updateLastLogin(userId) {
        await pool.query(
            'UPDATE users SET last_login = NOW() WHERE id = $1',
            [userId]
        );
    }

    // Cambiar rol de usuario (solo admin)
    static async changeRole(userId, newRole, changedBy) {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Obtener usuario actual
            const userResult = await client.query(
                'SELECT id, username, role FROM users WHERE id = $1 FOR UPDATE',
                [userId]
            );
            
            if (userResult.rows.length === 0) {
                throw new Error('Usuario no encontrado');
            }
            
            const user = userResult.rows[0];
            const oldRole = user.role;
            
            // Actualizar rol
            await client.query(
                `UPDATE users 
                 SET role = $1, 
                     seller_since = CASE WHEN $1 = 'seller' AND seller_since IS NULL THEN NOW() ELSE seller_since END
                 WHERE id = $2`,
                [newRole, userId]
            );
            
            // Registrar cambio de rol
            await client.query(
                `INSERT INTO credit_transactions 
                 (from_user_id, to_user_id, transaction_type, old_role, new_role, created_at)
                 VALUES ($1, $2, 'role_change', $3, $4, NOW())`,
                [changedBy, userId, oldRole, newRole]
            );
            
            // Registrar actividad
            await client.query(
                `INSERT INTO activity_logs 
                 (user_id, action_type, target_user_id, details, created_at)
                 VALUES ($1, 'role_change', $2, $3, NOW())`,
                [changedBy, userId, JSON.stringify({
                    username: user.username,
                    from: oldRole,
                    to: newRole
                })]
            );
            
            await client.query('COMMIT');
            
            return { success: true, oldRole, newRole };
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Añadir créditos/días (solo seller/admin)
    static async addCreditsOrDays(fromUserId, toUserId, type, amount, reason = '') {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Verificar que el que da tenga permisos
            const fromUser = await client.query(
                'SELECT id, role FROM users WHERE id = $1 AND role IN ($2, $3)',
                [fromUserId, 'seller', 'admin']
            );
            
            if (fromUser.rows.length === 0) {
                throw new Error('No tienes permisos para realizar esta acción');
            }
            
            // Obtener usuario receptor
            const toUser = await client.query(
                `SELECT id, username, ${type} as current_amount 
                 FROM users WHERE id = $1 FOR UPDATE`,
                [toUserId]
            );
            
            if (toUser.rows.length === 0) {
                throw new Error('Usuario receptor no encontrado');
            }
            
            const currentAmount = parseInt(toUser.rows[0].current_amount);
            const newAmount = currentAmount + amount;
            
            // Actualizar créditos/días
            await client.query(
                `UPDATE users 
                 SET ${type} = ${type} + $1,
                     last_credited_user_id = $2,
                     last_credited_date = NOW()
                 WHERE id = $3`,
                [amount, toUserId, toUserId]
            );
            
            // Actualizar estadísticas del seller
            if (fromUser.rows[0].role === 'seller') {
                await client.query(
                    `UPDATE users 
                     SET total_credited_users = total_credited_users + 1,
                         total_credits_given = total_credits_given + CASE WHEN $1 = 'credits' THEN $2 ELSE 0 END,
                         total_days_given = total_days_given + CASE WHEN $1 = 'days' THEN $2 ELSE 0 END
                     WHERE id = $3`,
                    [type, amount, fromUserId]
                );
            }
            
            // Registrar transacción
            await client.query(
                `INSERT INTO credit_transactions 
                 (from_user_id, to_user_id, transaction_type, amount, 
                  previous_amount, new_amount, reason, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
                [fromUserId, toUserId, type, amount, currentAmount, newAmount, reason]
            );
            
            // Registrar actividad
            await client.query(
                `INSERT INTO activity_logs 
                 (user_id, action_type, target_user_id, details, created_at)
                 VALUES ($1, 'add_${type}', $2, $3, NOW())`,
                [fromUserId, toUserId, JSON.stringify({
                    amount,
                    previous: currentAmount,
                    new: newAmount,
                    reason
                })]
            );
            
            await client.query('COMMIT');
            
            return { 
                success: true, 
                previous: currentAmount, 
                new: newAmount,
                username: toUser.rows[0].username
            };
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Obtener estadísticas de seller
    static async getSellerStats(sellerId) {
        const result = await pool.query(
            `SELECT 
                COUNT(DISTINCT to_user_id) as total_users_credited,
                SUM(CASE WHEN transaction_type = 'credits' THEN amount ELSE 0 END) as total_credits_given,
                SUM(CASE WHEN transaction_type = 'days' THEN amount ELSE 0 END) as total_days_given,
                COUNT(*) as total_transactions
             FROM credit_transactions 
             WHERE from_user_id = $1 AND transaction_type IN ('credits', 'days')`,
            [sellerId]
        );
        
        return result.rows[0];
    }

    // Listar usuarios (con filtros por rol)
    static async listUsers(role = null, page = 1, limit = 20) {
        const offset = (page - 1) * limit;
        let query = `SELECT id, username, display_name, credits, days_remaining, 
                            role, total_checks, total_lives, created_at, 
                            last_login, is_active
                     FROM users WHERE 1=1`;
        const params = [];
        let paramIndex = 1;
        
        if (role) {
            query += ` AND role = $${paramIndex}`;
            params.push(role);
            paramIndex++;
        }
        
        query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);
        
        const result = await pool.query(query, params);
        return result.rows;
    }

    static async needsVerification(username) {
    const result = await pool.query(
        `SELECT id, username, is_active 
         FROM users 
         WHERE username = $1 AND is_active = FALSE`,
        [username]
    );
    
    return result.rows.length > 0;
}

// Generar código de verificación
static async generateVerificationCode(userId) {
    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos
    
    await pool.query(
        `INSERT INTO verification_codes 
         (user_id, code, expires_at)
         VALUES ($1, $2, $3)`,
        [userId, code, expiresAt]
    );
    
    return code;
}

// Verificar código
static async verifyCode(username, code) {
    const result = await pool.query(
        `SELECT u.id, vc.expires_at
         FROM users u
         JOIN verification_codes vc ON u.id = vc.user_id
         WHERE u.username = $1 AND vc.code = $2 AND vc.used = FALSE
         ORDER BY vc.created_at DESC
         LIMIT 1`,
        [username, code]
    );
    
    if (result.rows.length === 0) {
        return { valid: false, error: 'Código incorrecto' };
    }
    
    const { id, expires_at } = result.rows[0];
    
    if (new Date(expires_at) < new Date()) {
        return { valid: false, error: 'Código expirado' };
    }
    
    // Activar usuario
    await pool.query(
        `UPDATE users 
         SET is_active = TRUE, 
             telegram_verified = TRUE,
             verified_at = NOW()
         WHERE id = $1`,
        [id]
    );
    
    // Marcar código como usado
    await pool.query(
        'UPDATE verification_codes SET used = TRUE WHERE user_id = $1 AND code = $2',
        [id, code]
    );
    
    return { valid: true, userId: id };
}

// Obtener estadísticas de verificación
static async getVerificationStats() {
    const result = await pool.query(`
        SELECT 
            COUNT(*) as total_users,
            COUNT(CASE WHEN is_active = TRUE THEN 1 END) as active_users,
            COUNT(CASE WHEN telegram_verified = TRUE THEN 1 END) as telegram_verified,
            COUNT(CASE WHEN is_active = FALSE THEN 1 END) as pending_verification,
            AVG(EXTRACT(EPOCH FROM (verified_at - created_at))) as avg_verification_time_seconds
        FROM users
    `);
    
    return result.rows[0];
}

    // Obtener transacciones de un seller
    static async getSellerTransactions(sellerId, page = 1, limit = 20) {
        const offset = (page - 1) * limit;
        
        const result = await pool.query(
            `SELECT ct.*, u.username as to_username, u2.username as from_username
             FROM credit_transactions ct
             LEFT JOIN users u ON ct.to_user_id = u.id
             LEFT JOIN users u2 ON ct.from_user_id = u2.id
             WHERE ct.from_user_id = $1 AND ct.transaction_type IN ('credits', 'days')
             ORDER BY ct.created_at DESC
             LIMIT $2 OFFSET $3`,
            [sellerId, limit, offset]
        );
        
        return result.rows;
    }
}

module.exports = User;