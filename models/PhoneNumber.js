const { pool } = require('../database');

class PhoneNumber {
    static async getAll(userId) {
        const result = await pool.query(
            `SELECT id, company, phone_number, has_data, verified, verified_name, 
                    registered_pages, notes, created_at, updated_at
             FROM phone_numbers WHERE user_id = $1 
             ORDER BY phone_number`,
            [userId]
        );
        return result.rows;
    }

    static async create(userId, data) {
        const { company, phone_number, has_data, verified, verified_name, registered_pages, notes } = data;
        // Asegurar que registered_pages sea un array (si viene undefined, usar [])
        const pagesJson = registered_pages || [];
        const result = await pool.query(
            `INSERT INTO phone_numbers 
             (user_id, company, phone_number, has_data, verified, verified_name, registered_pages, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
             RETURNING *`,
            [userId, company, phone_number, has_data || false, verified || false, verified_name, JSON.stringify(pagesJson), notes]
        );
        return result.rows[0];
    }

    static async update(id, userId, data) {
        const { company, phone_number, has_data, verified, verified_name, registered_pages, notes } = data;
        const pagesJson = registered_pages || [];
        const result = await pool.query(
            `UPDATE phone_numbers 
             SET company = COALESCE($1, company),
                 phone_number = COALESCE($2, phone_number),
                 has_data = COALESCE($3, has_data),
                 verified = COALESCE($4, verified),
                 verified_name = COALESCE($5, verified_name),
                 registered_pages = COALESCE($6::jsonb, registered_pages),
                 notes = COALESCE($7, notes),
                 updated_at = NOW()
             WHERE id = $8 AND user_id = $9
             RETURNING *`,
            [company, phone_number, has_data, verified, verified_name, JSON.stringify(pagesJson), notes, id, userId]
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