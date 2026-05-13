const { pool } = require('../database');

class Page {
    // Obtener todas las páginas (administrador puede ver todas, usuario solo las activas)
    static async getAll(userId, isAdmin = false) {
        let query = 'SELECT * FROM pages';
        const params = [];
        if (!isAdmin) {
            query += ' WHERE is_active = TRUE';
        }
        query += ' ORDER BY name';
        const result = await pool.query(query, params);
        return result.rows;
    }

    // Dentro de models/Page.js, modifica los métodos:

    static async create(name, login_type = 'email', verification = 'none', allow_card_association = true, has_3d = false, is_bineable = true, createdBy) {
        const result = await pool.query(
            `INSERT INTO pages (name, login_type, verification, allow_card_association, has_3d, is_bineable, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [name, login_type, verification, allow_card_association, has_3d, is_bineable, createdBy]
        );
        return result.rows[0];
    }

    static async update(id, { name, login_type, verification, allow_card_association, has_3d, is_bineable, is_active }) {
        const result = await pool.query(
            `UPDATE pages 
            SET name = COALESCE($1, name),
                login_type = COALESCE($2, login_type),
                verification = COALESCE($3, verification),
                allow_card_association = COALESCE($4, allow_card_association),
                has_3d = COALESCE($5, has_3d),
                is_bineable = COALESCE($6, is_bineable),
                is_active = COALESCE($7, is_active),
                updated_at = NOW()
            WHERE id = $8
            RETURNING *`,
            [name, login_type, verification, allow_card_association, has_3d, is_bineable, is_active, id]
        );
        return result.rows[0];
    }

    // Nuevo: Obtener página global con sus respuestas
    static async getPageWithResponses(pageId) {
        const pageRes = await pool.query('SELECT * FROM pages WHERE id = $1', [pageId]);
        if (pageRes.rows.length === 0) return null;
        const responsesRes = await pool.query('SELECT * FROM page_responses WHERE page_id = $1', [pageId]);
        const page = pageRes.rows[0];
        page.responses = responsesRes.rows;
        return page;
    }
}

module.exports = Page;