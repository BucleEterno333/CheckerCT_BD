const { pool } = require('../database');

class UserAccount {
    static async getUserAccounts(userId) {
        const result = await pool.query(
            `SELECT ua.*, p.name as page_name 
             FROM user_accounts ua
             LEFT JOIN pages p ON ua.page_id = p.id
             WHERE ua.user_id = $1
             ORDER BY p.name, ua.account_name`,
            [userId]
        );
        return result.rows;
    }

    static async create(userId, data) {
        const { page_id, account_name, account_email, account_phone, account_password, device_id, phone_number_id, notes, platform_name } = data;
        const result = await pool.query(
            `INSERT INTO user_accounts 
            (user_id, page_id, account_name, account_email, account_phone, account_password, device_id, phone_number_id, notes, platform_name)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *`,
            [userId, page_id, account_name, account_email, account_phone, account_password, device_id, phone_number_id, notes, platform_name]
        );
        return result.rows[0];
    }

    static async associateCard(accountId, liveId) {
        await pool.query(
            `INSERT INTO account_cards (account_id, live_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [accountId, liveId]
        );
        // Actualizar contador en user_accounts
        await pool.query(
            `UPDATE user_accounts 
             SET total_associated_cards = total_associated_cards + 1
             WHERE id = $1`,
            [accountId]
        );
    }

    static async removeCard(accountId, liveId) {
        await pool.query(
            `DELETE FROM account_cards WHERE account_id = $1 AND live_id = $2`,
            [accountId, liveId]
        );
        await pool.query(
            `UPDATE user_accounts 
             SET total_associated_cards = total_associated_cards - 1
             WHERE id = $1`,
            [accountId]
        );
    }

    static async getCardsByAccount(accountId) {
        const result = await pool.query(
            `SELECT ul.* FROM user_lives ul
             JOIN account_cards ac ON ul.id = ac.live_id
             WHERE ac.account_id = $1`,
            [accountId]
        );
        return result.rows;
    }

    // Dentro de models/UserAccount.js, agrega:
    static async getByPage(userId, pageId) {
        const result = await pool.query(
            `SELECT * FROM user_accounts 
            WHERE user_id = $1 AND page_id = $2 
            ORDER BY account_name`,
            [userId, pageId]
        );
        return result.rows;
    }

    static async update(accountId, userId, data) {
        const { account_name, account_email, account_phone, platform_name, verified, notes } = data;
        const result = await pool.query(
            `UPDATE user_accounts 
            SET account_name = COALESCE($1, account_name),
                account_email = COALESCE($2, account_email),
                account_phone = COALESCE($3, account_phone),
                platform_name = COALESCE($4, platform_name),
                verified = COALESCE($5, verified),
                notes = COALESCE($6, notes),
                updated_at = NOW()
            WHERE id = $7 AND user_id = $8
            RETURNING *`,
            [account_name, account_email, account_phone, platform_name, verified, notes, accountId, userId]
        );
        return result.rows[0];
    }

    static async delete(accountId, userId) {
        const result = await pool.query(
            'DELETE FROM user_accounts WHERE id = $1 AND user_id = $2 RETURNING id',
            [accountId, userId]
        );
        return result.rows.length > 0;
    }
}



module.exports = UserAccount;