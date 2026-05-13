const { pool } = require('../database');

class Email {
    static async getAll(userId) {
        const result = await pool.query(
            `SELECT id, name, email_address, phone, backup_phone, registered_pages, notes, created_at, updated_at
             FROM emails WHERE user_id = $1 
             ORDER BY email_address`,
            [userId]
        );
        return result.rows;
    }

    static async create(userId, data) {
        const { name, email_address, phone, backup_phone, registered_pages, notes } = data;
        const result = await pool.query(
            `INSERT INTO emails 
             (user_id, name, email_address, phone, backup_phone, registered_pages, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [userId, name, email_address, phone, backup_phone, registered_pages || [], notes]
        );
        return result.rows[0];
    }

    static async update(id, userId, data) {
        const { name, email_address, phone, backup_phone, registered_pages, notes } = data;
        const result = await pool.query(
            `UPDATE emails 
             SET name = COALESCE($1, name),
                 email_address = COALESCE($2, email_address),
                 phone = COALESCE($3, phone),
                 backup_phone = COALESCE($4, backup_phone),
                 registered_pages = COALESCE($5, registered_pages),
                 notes = COALESCE($6, notes),
                 updated_at = NOW()
             WHERE id = $7 AND user_id = $8
             RETURNING *`,
            [name, email_address, phone, backup_phone, registered_pages, notes, id, userId]
        );
        return result.rows[0];
    }

    static async delete(id, userId) {
        const result = await pool.query(
            'DELETE FROM emails WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, userId]
        );
        return result.rows.length > 0;
    }
}

module.exports = Email;