const { pool } = require('../database');

class AccountAction {
    // Obtener todas las acciones de una cuenta (orden ascendente para historial)
    static async getByAccountId(accountId, userId) {
        const result = await pool.query(
            `SELECT * FROM account_actions 
             WHERE account_id = $1 AND user_id = $2 
             ORDER BY action_date ASC, created_at ASC`,
            [accountId, userId]
        );
        return result.rows;
    }

    // Crear una nueva acción
    static async create(accountId, userId, data) {
        const {
            action_type,
            action_date,
            amount,
            product,
            response_text,
            card_last4,
            field_updated,
            method,
            reason,
            result,
            notes
        } = data;

        const query = `
            INSERT INTO account_actions 
            (account_id, user_id, action_type, action_date, amount, product, 
             response_text, card_last4, field_updated, method, reason, result, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *
        `;
        const values = [
            accountId, userId, action_type, action_date || new Date().toISOString(),
            amount, product, response_text, card_last4, field_updated, method, reason, result, notes
        ];
        const result = await pool.query(query, values);
        return result.rows[0];
    }

    // Actualizar una acción existente
    static async update(actionId, userId, data) {
        const {
            action_date,
            amount,
            product,
            response_text,
            card_last4,
            field_updated,
            method,
            reason,
            result,
            notes
        } = data;

        const query = `
            UPDATE account_actions 
            SET action_date = COALESCE($1, action_date),
                amount = COALESCE($2, amount),
                product = COALESCE($3, product),
                response_text = COALESCE($4, response_text),
                card_last4 = COALESCE($5, card_last4),
                field_updated = COALESCE($6, field_updated),
                method = COALESCE($7, method),
                reason = COALESCE($8, reason),
                result = COALESCE($9, result),
                notes = COALESCE($10, notes)
            WHERE id = $11 AND user_id = $12
            RETURNING *
        `;
        const values = [action_date, amount, product, response_text, card_last4, field_updated, method, reason, result, notes, actionId, userId];
        const result = await pool.query(query, values);
        return result.rows[0];
    }

    // Eliminar una acción
    static async delete(actionId, userId) {
        const result = await pool.query(
            'DELETE FROM account_actions WHERE id = $1 AND user_id = $2 RETURNING id',
            [actionId, userId]
        );
        return result.rows.length > 0;
    }
}

module.exports = AccountAction;