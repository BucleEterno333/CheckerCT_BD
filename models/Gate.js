const { pool } = require('../database');

class Gate {
    static async getAll(userId = null) {
        let query = `
            SELECT * FROM gates 
            WHERE is_active = TRUE AND (is_global = TRUE OR created_by = $1)
            ORDER BY name
        `;
        const result = await pool.query(query, [userId]);
        return result.rows;
    }

    static async create(name, userId, data = {}) {
        const { checker_string, mount_charged, is_charged, is_auth, is_cvv, payment_gateway } = data;
        const result = await pool.query(
            `INSERT INTO gates (name, checker_string, mount_charged, is_charged, is_auth, is_cvv, payment_gateway, is_global, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, $8)
             RETURNING *`,
            [name, checker_string, mount_charged, is_charged, is_auth, is_cvv, payment_gateway, userId]
        );
        return result.rows[0];
    }

    static async update(id, userId, data) {
        const { name, checker_string, mount_charged, is_charged, is_auth, is_cvv, payment_gateway, is_active } = data;
        const result = await pool.query(
            `UPDATE gates 
             SET name = COALESCE($1, name),
                 checker_string = COALESCE($2, checker_string),
                 mount_charged = COALESCE($3, mount_charged),
                 is_charged = COALESCE($4, is_charged),
                 is_auth = COALESCE($5, is_auth),
                 is_cvv = COALESCE($6, is_cvv),
                 payment_gateway = COALESCE($7, payment_gateway),
                 is_active = COALESCE($8, is_active),
                 updated_at = NOW()
             WHERE id = $9 AND (is_global = FALSE AND created_by = $10)
             RETURNING *`,
            [name, checker_string, mount_charged, is_charged, is_auth, is_cvv, payment_gateway, is_active, id, userId]
        );
        return result.rows[0];
    }
}

module.exports = Gate;