const { pool } = require('../database');

class UserPageResponse {
    static async getUserResponses(userId, pageId = null) {
        let query = `SELECT * FROM user_page_responses WHERE user_id = $1`;
        const params = [userId];
        if (pageId) {
            query += ` AND page_id = $2`;
            params.push(pageId);
        }
        query += ` ORDER BY created_at DESC`;
        const result = await pool.query(query, params);
        return result.rows;
    }

    static async create(userId, pageId, responseText) {
        const result = await pool.query(
            `INSERT INTO user_page_responses (user_id, page_id, response_text)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [userId, pageId, responseText]
        );
        return result.rows[0];
    }

    static async delete(id, userId) {
        await pool.query('DELETE FROM user_page_responses WHERE id = $1 AND user_id = $2', [id, userId]);
        return true;
    }
}

module.exports = UserPageResponse;