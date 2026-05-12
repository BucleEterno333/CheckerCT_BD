const { pool } = require('../database');

class Email {
    static async getAll(userId) {
        const result = await pool.query(
            'SELECT * FROM emails WHERE user_id = $1 ORDER BY email',
            [userId]
        );
        return result.rows;
    }

    static async create(userId, { email, label, notes }) {
        const result = await pool.query(
            `INSERT INTO emails (user_id, email, label, notes)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [userId, email, label, notes]
        );
        return result.rows[0];
    }

    static async update(id, userId, data) {
        const { email, label, notes } = data;
        const result = await pool.query(
            `UPDATE emails 
             SET email = COALESCE($1, email),
                 label = COALESCE($2, label),
                 notes = COALESCE($3, notes),
                 updated_at = NOW()
             WHERE id = $4 AND user_id = $5
             RETURNING *`,
            [email, label, notes, id, userId]
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