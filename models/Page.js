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

    // Crear página (solo admin)
    static async create(name, category, createdBy) {
        const result = await pool.query(
            `INSERT INTO pages (name, category, created_by)
             VALUES ($1, $2, $3) RETURNING *`,
            [name, category, createdBy]
        );
        return result.rows[0];
    }

    // Actualizar página (solo admin)
    static async update(id, { name, category, is_active }) {
        const result = await pool.query(
            `UPDATE pages 
             SET name = COALESCE($1, name),
                 category = COALESCE($2, category),
                 is_active = COALESCE($3, is_active),
                 updated_at = NOW()
             WHERE id = $4
             RETURNING *`,
            [name, category, is_active, id]
        );
        return result.rows[0];
    }
}

module.exports = Page;const { pool } = require('../database');

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

    // Crear página (solo admin)
    static async create(name, category, createdBy) {
        const result = await pool.query(
            `INSERT INTO pages (name, category, created_by)
             VALUES ($1, $2, $3) RETURNING *`,
            [name, category, createdBy]
        );
        return result.rows[0];
    }

    // Actualizar página (solo admin)
    static async update(id, { name, category, is_active }) {
        const result = await pool.query(
            `UPDATE pages 
             SET name = COALESCE($1, name),
                 category = COALESCE($2, category),
                 is_active = COALESCE($3, is_active),
                 updated_at = NOW()
             WHERE id = $4
             RETURNING *`,
            [name, category, is_active, id]
        );
        return result.rows[0];
    }
}

module.exports = Page;