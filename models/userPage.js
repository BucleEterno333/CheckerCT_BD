const { pool } = require('../database');

class UserPage {
    // Obtener todas las páginas personales de un usuario
    static async getUserPages(userId) {
        const result = await pool.query(
            `SELECT up.*, 
                (SELECT json_agg(json_build_object('id', pr.id, 'text', pr.response_text, 'code', pr.code, 'reason', pr.reason, 'solution', pr.solution, 'cloudinary_url', pr.cloudinary_url))
                FROM page_responses pr WHERE pr.user_page_id = up.id) as responses
            FROM user_pages up
            WHERE up.user_id = $1
            ORDER BY up.name`,
            [userId]
        );
        return result.rows;
    }

    // Crear página personal
    static async create(userId, data) {
        const { name, login_type, verification, allow_card_association, has_3d, is_bineable, responses = [] } = data;
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await client.query(
                `INSERT INTO user_pages 
                (user_id, name, login_type, verification, allow_card_association, has_3d, is_bineable)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *`,
                [userId, name, login_type, verification, allow_card_association, has_3d, is_bineable]
            );
            const newPage = result.rows[0];
            // Insertar respuestas
            for (const resp of responses) {
                if (resp.text) {
                    await client.query(
                        `INSERT INTO page_responses 
                        (user_page_id, response_text, code, reason, solution, cloudinary_url)
                        VALUES ($1, $2, $3, $4, $5, $6)`,
                        [newPage.id, resp.text, resp.code || '', resp.reason || '', resp.solution || '', resp.cloudinary_url || '']
                    );
                }
            }
            await client.query('COMMIT');
            return newPage;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Actualizar página personal
    static async update(pageId, userId, data) {
        const { name, login_type, verification, allow_card_association, has_3d, is_bineable, responses } = data;
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await client.query(
                `UPDATE user_pages 
                SET name = COALESCE($1, name),
                    login_type = COALESCE($2, login_type),
                    verification = COALESCE($3, verification),
                    allow_card_association = COALESCE($4, allow_card_association),
                    has_3d = COALESCE($5, has_3d),
                    is_bineable = COALESCE($6, is_bineable),
                    updated_at = NOW()
                WHERE id = $7 AND user_id = $8
                RETURNING *`,
                [name, login_type, verification, allow_card_association, has_3d, is_bineable, pageId, userId]
            );
            if (result.rows.length === 0) throw new Error('Página no encontrada');
            // Eliminar respuestas anteriores y volver a insertar (simplificado)
            await client.query('DELETE FROM page_responses WHERE user_page_id = $1', [pageId]);
            for (const resp of responses) {
                if (resp.text) {
                    await client.query(
                        `INSERT INTO page_responses 
                        (user_page_id, response_text, code, reason, solution, cloudinary_url)
                        VALUES ($1, $2, $3, $4, $5, $6)`,
                        [pageId, resp.text, resp.code || '', resp.reason || '', resp.solution || '', resp.cloudinary_url || '']
                    );
                }
            }
            await client.query('COMMIT');
            return result.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Eliminar página personal
    static async delete(pageId, userId) {
        const result = await pool.query(
            'DELETE FROM user_pages WHERE id = $1 AND user_id = $2 RETURNING id',
            [pageId, userId]
        );
        return result.rows.length > 0;
    }
}

module.exports = UserPage;