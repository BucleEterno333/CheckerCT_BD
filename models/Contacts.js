const { pool } = require('../database');

class Contact {
    static async getUserContacts(userId) {
        const result = await pool.query(
            'SELECT * FROM contacts WHERE user_id = $1 ORDER BY name',
            [userId]
        );
        return result.rows;
    }

    static async create(userId, name, telegramId = null, telegramUsername = null, isSystemUser = false, systemUserId = null) {
        const result = await pool.query(
            `INSERT INTO contacts (user_id, name, telegram_id, telegram_username, is_system_user, system_user_id)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [userId, name, telegramId, telegramUsername, isSystemUser, systemUserId]
        );
        return result.rows[0];
    }

    static async update(id, userId, data) {
        const { name, telegram_id, telegram_username, is_system_user, system_user_id } = data;
        const result = await pool.query(
            `UPDATE contacts 
             SET name = COALESCE($1, name),
                 telegram_id = COALESCE($2, telegram_id),
                 telegram_username = COALESCE($3, telegram_username),
                 is_system_user = COALESCE($4, is_system_user),
                 system_user_id = COALESCE($5, system_user_id),
                 updated_at = NOW()
             WHERE id = $6 AND user_id = $7
             RETURNING *`,
            [name, telegram_id, telegram_username, is_system_user, system_user_id, id, userId]
        );
        return result.rows[0];
    }

    static async delete(id, userId) {
        await pool.query('DELETE FROM contacts WHERE id = $1 AND user_id = $2', [id, userId]);
        return true;
    }
}

module.exports = Contact;