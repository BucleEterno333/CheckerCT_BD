const { pool } = require('../database');

class PhoneNumber {
    static async getAll(userId) {
        const result = await pool.query(
            'SELECT * FROM phone_numbers WHERE user_id = $1 ORDER BY number',
            [userId]
        );
        return result.rows;
    }

    static async create(userId, { number, label, country_code, notes }) {
        const result = await pool.query(
            `INSERT INTO phone_numbers (user_id, number, label, country_code, notes)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [userId, number, label, country_code, notes]
        );
        return result.rows[0];
    }

    static async update(id, userId, data) {
        const { number, label, country_code, notes } = data;
        const result = await pool.query(
            `UPDATE phone_numbers 
             SET number = COALESCE($1, number),
                 label = COALESCE($2, label),
                 country_code = COALESCE($3, country_code),
                 notes = COALESCE($4, notes),
                 updated_at = NOW()
             WHERE id = $5 AND user_id = $6
             RETURNING *`,
            [number, label, country_code, notes, id, userId]
        );
        return result.rows[0];
    }

    static async delete(id, userId) {
        const result = await pool.query(
            'DELETE FROM phone_numbers WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, userId]
        );
        return result.rows.length > 0;
    }
}

module.exports = PhoneNumber;