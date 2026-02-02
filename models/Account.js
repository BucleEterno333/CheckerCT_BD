// models/Account.js
const { pool } = require('../database');

class Account {
    // Crear nueva cuenta
    static async create(userId, accountData) {
        const {
            platform,
            account_name,
            account_email,
            account_phone,
            device_name,
            status = 'active',
            notes = ''
        } = accountData;
        
        const result = await pool.query(
            `INSERT INTO user_accounts 
             (user_id, platform, account_name, account_email, account_phone, 
              device_name, status, notes, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
             RETURNING id, platform, account_name, device_name, status, created_at`,
            [
                userId, platform, account_name, account_email, 
                account_phone, device_name, status, notes
            ]
        );
        
        return result.rows[0];
    }

    // Obtener cuentas de un usuario
    static async getUserAccounts(userId, platform = null) {
        let query = `
            SELECT * FROM user_accounts 
            WHERE user_id = $1 AND status != 'deleted'
        `;
        const params = [userId];
        
        if (platform) {
            query += ' AND platform = $2';
            params.push(platform);
        }
        
        query += ' ORDER BY last_used DESC NULLS LAST, created_at DESC';
        
        const result = await pool.query(query, params);
        return result.rows;
    }

    // Buscar cuenta por ID y usuario
    static async findById(accountId, userId = null) {
        let query = 'SELECT * FROM user_accounts WHERE id = $1';
        const params = [accountId];
        
        if (userId) {
            query += ' AND user_id = $2';
            params.push(userId);
        }
        
        const result = await pool.query(query, params);
        return result.rows[0];
    }

    // Actualizar cuenta
    static async update(accountId, userId, updateData) {
        const updates = [];
        const params = [];
        let paramIndex = 1;
        
        // Campos que se pueden actualizar
        const allowedFields = [
            'account_name', 'account_email', 'account_phone', 
            'device_name', 'status', 'notes'
        ];
        
        for (const [field, value] of Object.entries(updateData)) {
            if (allowedFields.includes(field) && value !== undefined) {
                updates.push(`${field} = $${paramIndex}`);
                params.push(value);
                paramIndex++;
            }
        }
        
        if (updates.length === 0) {
            throw new Error('No hay campos válidos para actualizar');
        }
        
        updates.push('last_used = NOW()');
        params.push(accountId, userId);
        
        const query = `
            UPDATE user_accounts 
            SET ${updates.join(', ')} 
            WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
            RETURNING id, platform, account_name, device_name, status
        `;
        
        const result = await pool.query(query, params);
        
        if (result.rows.length === 0) {
            throw new Error('Cuenta no encontrada o no autorizada');
        }
        
        return result.rows[0];
    }

    // Obtener estadísticas de cuenta
    static async getAccountStats(accountId) {
        const result = await pool.query(
            `SELECT 
                COUNT(CASE WHEN la.action_type = 'payment_approved' THEN 1 END) as total_approved,
                COUNT(CASE WHEN la.action_type = 'payment_declined' THEN 1 END) as total_declined,
                SUM(CASE WHEN la.action_type = 'payment_approved' THEN la.amount ELSE 0 END) as total_amount,
                MAX(la.action_date) as last_action_date
             FROM live_actions la
             WHERE la.account_id = $1`,
            [accountId]
        );
        
        return result.rows[0];
    }

    // Obtener acciones de una cuenta
    static async getAccountActions(accountId, limit = 50) {
        const result = await pool.query(
            `SELECT la.*, ul.card_last_four, ul.card_bin, p.name as page_name
             FROM live_actions la
             JOIN user_lives ul ON la.live_id = ul.id
             LEFT JOIN pages p ON la.page_id = p.id
             WHERE la.account_id = $1
             ORDER BY la.action_date DESC, la.action_time DESC
             LIMIT $2`,
            [accountId, limit]
        );
        
        return result.rows;
    }

    // Buscar cuentas por plataforma y nombre/email
    static async searchAccounts(userId, platform, searchTerm) {
        const result = await pool.query(
            `SELECT * FROM user_accounts 
             WHERE user_id = $1 
               AND platform = $2
               AND (account_name ILIKE $3 OR account_email ILIKE $3)
             ORDER BY account_name`,
            [userId, platform, `%${searchTerm}%`]
        );
        
        return result.rows;
    }
}

module.exports = Account;