// models/Live.js
const { pool } = require('../database');

class Live {
    // Crear una nueva live
    static async create(userId, cardData) {
        const { card_full, gate_used, check_date, notes = '' } = cardData;
        
        // Extraer información de la tarjeta
        const cardNumber = card_full.split('|')[0];
        const card_last_four = cardNumber.slice(-4);
        const card_bin = cardNumber.slice(0, 6);
        
        const result = await pool.query(
            `INSERT INTO user_lives 
             (user_id, card_full, card_last_four, card_bin, gate_used, check_date, notes, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
             RETURNING id, card_last_four, card_bin, gate_used, check_date`,
            [
                userId,
                card_full,
                card_last_four,
                card_bin,
                gate_used,
                check_date || new Date().toISOString().split('T')[0],
                notes
            ]
        );
        
        return result.rows[0];
    }

    // Obtener lives de un usuario
    static async getUserLives(userId, filters = {}) {
        const { status, gate, bin, page = 1, limit = 50 } = filters;
        const offset = (page - 1) * limit;
        
        let query = `
            SELECT ul.*, 
                   COUNT(la.id) as action_count,
                   MAX(la.action_date) as last_action_date
            FROM user_lives ul
            LEFT JOIN live_actions la ON ul.id = la.live_id
            WHERE ul.user_id = $1
        `;
        
        const params = [userId];
        let paramIndex = 2;
        
        if (status) {
            query += ` AND ul.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }
        
        if (gate) {
            query += ` AND ul.gate_used = $${paramIndex}`;
            params.push(gate);
            paramIndex++;
        }
        
        if (bin) {
            query += ` AND ul.card_bin = $${paramIndex}`;
            params.push(bin);
            paramIndex++;
        }
        
        query += ` GROUP BY ul.id ORDER BY ul.check_date DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);
        
        const result = await pool.query(query, params);
        return result.rows;
    }

    // Obtener una live específica con sus acciones
    static async getLiveWithActions(liveId, userId = null) {
        let query = `
            SELECT ul.*, 
                   u.username as user_username
            FROM user_lives ul
            JOIN users u ON ul.user_id = u.id
            WHERE ul.id = $1
        `;
        
        const params = [liveId];
        
        if (userId) {
            query += ` AND ul.user_id = $2`;
            params.push(userId);
        }
        
        const liveResult = await pool.query(query, params);
        
        if (liveResult.rows.length === 0) {
            return null;
        }
        
        const actions = await pool.query(
            `SELECT la.*, 
                    p.name as page_name,
                    pr.response_text as predefined_response,
                    ua.account_name, ua.account_email, ua.device_name,
                    u2.username as action_user_username
             FROM live_actions la
             LEFT JOIN pages p ON la.page_id = p.id
             LEFT JOIN page_responses pr ON la.response_id = pr.id
             LEFT JOIN user_accounts ua ON la.account_id = ua.id
             LEFT JOIN users u2 ON la.user_id = u2.id
             WHERE la.live_id = $1
             ORDER BY la.action_date DESC, la.action_time DESC`,
            [liveId]
        );
        
        const live = liveResult.rows[0];
        live.actions = actions.rows;
        
        return live;
    }

    // Añadir acción a una live
    static async addAction(actionData) {
        const {
            live_id,
            user_id,
            action_type,
            page_id,
            page_name,
            account_id,
            amount,
            currency = 'USD',
            product_name,
            is_direct_payment = true,
            rest_days,
            response_id,
            response_text,
            transferred_to,
            transfer_result,
            action_date,
            device_used,
            notes = '',
            additional_info = {}
        } = actionData;
        
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Verificar que la live existe y pertenece al usuario
            const liveCheck = await client.query(
                'SELECT id FROM user_lives WHERE id = $1 AND user_id = $2',
                [live_id, user_id]
            );
            
            if (liveCheck.rows.length === 0) {
                throw new Error('Live no encontrada o no pertenece al usuario');
            }
            
            // Insertar la acción
            const result = await client.query(
                `INSERT INTO live_actions 
                 (live_id, user_id, action_type, page_id, page_name, account_id,
                  amount, currency, product_name, is_direct_payment, rest_days,
                  response_id, response_text, transferred_to, transfer_result,
                  action_date, device_used, notes, additional_info, action_time)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 
                         $14, $15, $16, $17, $18, $19, NOW())
                 RETURNING id, action_type, action_date`,
                [
                    live_id, user_id, action_type, page_id, page_name, account_id,
                    amount, currency, product_name, is_direct_payment, rest_days,
                    response_id, response_text, transferred_to, transfer_result,
                    action_date || new Date().toISOString().split('T')[0],
                    device_used, notes, additional_info
                ]
            );
            
            // Actualizar estadísticas de la live si es necesario
            if (action_type === 'payment_approved') {
                await client.query(
                    'UPDATE user_lives SET status = $1, phase = $2 WHERE id = $3',
                    ['used', 'completed', live_id]
                );
            } else if (action_type === 'payment_declined') {
                await client.query(
                    'UPDATE user_lives SET phase = $1 WHERE id = $2',
                    ['failed_attempt', live_id]
                );
            } else if (action_type === 'associated_account') {
                await client.query(
                    'UPDATE user_lives SET phase = $1 WHERE id = $2',
                    ['associated', live_id]
                );
            }
            
            // Actualizar estadísticas de cuenta si se especificó
            if (account_id) {
                if (action_type === 'payment_approved') {
                    await client.query(
                        `UPDATE user_accounts 
                         SET successful_attempts = successful_attempts + 1,
                             total_amount = total_amount + COALESCE($1, 0),
                             last_used = NOW()
                         WHERE id = $2`,
                        [amount || 0, account_id]
                    );
                } else if (action_type === 'payment_declined') {
                    await client.query(
                        `UPDATE user_accounts 
                         SET failed_attempts = failed_attempts + 1,
                             last_used = NOW()
                         WHERE id = $1`,
                        [account_id]
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

    // Obtener páginas disponibles
    static async getPages(search = '') {
        let query = 'SELECT * FROM pages WHERE is_active = TRUE';
        const params = [];
        
        if (search) {
            query += ' AND name ILIKE $1';
            params.push(`%${search}%`);
        }
        
        query += ' ORDER BY name';
        
        const result = await pool.query(query, params);
        return result.rows;
    }

    // Obtener respuestas para una página
    static async getPageResponses(pageId) {
        const result = await pool.query(
            `SELECT * FROM page_responses 
             WHERE page_id = $1 
             ORDER BY is_common DESC, response_text`,
            [pageId]
        );
        return result.rows;
    }

    // Buscar página por nombre
    static async findPageByName(name) {
        const result = await pool.query(
            'SELECT * FROM pages WHERE name ILIKE $1',
            [name]
        );
        return result.rows[0];
    }

    // Crear nueva página (para admin)
    static async createPage(name, category = null, createdBy) {
        const result = await pool.query(
            `INSERT INTO pages (name, category) 
             VALUES ($1, $2) 
             RETURNING id, name, category`,
            [name, category]
        );
        
        // Registrar actividad
        await pool.query(
            `INSERT INTO live_actions 
             (user_id, action_type, page_name, notes, action_date)
             VALUES ($1, 'manual_note', $2, 'Página creada', NOW())`,
            [createdBy, name]
        );
        
        return result.rows[0];
    }

    // Añadir respuesta a página (para admin)
    static async addPageResponse(pageId, responseText, responseType = null, createdBy) {
        const result = await pool.query(
            `INSERT INTO page_responses (page_id, response_text, response_type, created_by)
             VALUES ($1, $2, $3, $4)
             RETURNING id, response_text, response_type`,
            [pageId, responseText, responseType, createdBy]
        );
        
        return result.rows[0];
    }
}