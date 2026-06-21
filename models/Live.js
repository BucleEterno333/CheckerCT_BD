// models/Live.js
const { pool } = require('../database');

class Live {
    // Crear una nueva live
    static async create(userId, cardData) {
        const { card_full, gate_name, check_date, notes = '' } = cardData;
        
        // Extraer información de la tarjeta
        const cardNumber = card_full.split('|')[0];
        const firstDigit = cardNumber.charAt(0);
        let network = '';
        if (firstDigit === '4') network = 'Visa';
        else if (firstDigit === '5') network = 'Mastercard';
        else if (firstDigit === '3') network = 'American Express';
        else if (firstDigit === '6') network = 'Discover';
        else network = 'Otro';
        const card_last_four = cardNumber.slice(-4);
        const card_bin = cardNumber.slice(0, 6);
        
        const result = await pool.query(
            `INSERT INTO user_lives 
            (user_id, card_full, card_last_four, card_bin, gate_name, check_date, notes, network, card_class, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
            RETURNING id`,
            [userId, card_full, card_last_four, card_bin, gate_name, check_date || new Date().toISOString().split('T')[0], notes, network, null]
        );
        
        return result.rows[0];
    }


    // models/UserLive.js

    static async upsertLive(userId, cardData, gateName, checkerId = null, bankName = null, country = null, network = null, cardClass = null) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // 1. Buscar si ya existe
            const existing = await client.query(
                `SELECT id, status FROM user_lives 
                WHERE user_id = $1 AND card_full = $2`,
                [userId, cardData.card_full]
            );

            let liveId;
            let wasUpdated = false;

            if (existing.rows.length > 0) {
                // Existe -> actualizar
                const live = existing.rows[0];
                liveId = live.id;
                const oldStatus = live.status;

                // Solo actualizar si no estaba LIVE
                if (oldStatus !== 'live') {
                    await client.query(
                        `UPDATE user_lives 
                        SET status = 'live', 
                            updated_at = NOW(), 
                            check_date = CURRENT_DATE,
                            check_time = NOW(),
                            gate_name = COALESCE($1, gate_name),
                            bank_name = COALESCE($2, bank_name),
                            country = COALESCE($3, country),
                            network = COALESCE($4, network),
                            card_class = COALESCE($5, card_class)
                        WHERE id = $6`,
                        [gateName, bankName, country, network, cardClass, liveId]
                    );
                    wasUpdated = true;
                } else {
                    // Ya estaba LIVE, solo actualizar timestamp para subir al tope
                    await client.query(
                        `UPDATE user_lives 
                        SET updated_at = NOW(), check_time = NOW()
                        WHERE id = $1`,
                        [liveId]
                    );
                    wasUpdated = false; // no necesita acción de rechequeo
                }
            } else {
                // No existe -> insertar
                const result = await client.query(
                    `INSERT INTO user_lives 
                    (user_id, card_full, card_last_four, card_bin, card_type, 
                    bank_name, country, gate_name, check_date, check_time, status, phase,
                    network, card_class, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_DATE, NOW(), 'live', 'pending', $9, $10, NOW(), NOW())
                    RETURNING id`,
                    [
                        userId,
                        cardData.card_full,
                        cardData.card_full.slice(-4),
                        cardData.card_full.slice(0, 6),
                        cardData.card_type || 'CCS',
                        bankName,
                        country,
                        gateName,
                        network,
                        cardClass
                    ]
                );
                liveId = result.rows[0].id;
                wasUpdated = true; // para insertar acción
            }

            // 2. Insertar acción si fue actualizado o insertado
            if (wasUpdated) {
                await client.query(
                    `INSERT INTO live_actions (live_id, action_type, notes, created_at)
                    VALUES ($1, 'rechecked', 'Rechequeo automático - Live detectada', NOW())`,
                    [liveId]
                );
            }

            await client.query('COMMIT');
            return { success: true, liveId, wasUpdated };
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('❌ Error en upsertLive:', error);
            throw error;
        } finally {
            client.release();
        }
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
            query += ` AND ul.gate_name = $${paramIndex}`;
            params.push(gate);
            paramIndex++;
        }
        
        if (bin) {
            query += ` AND ul.card_bin = $${paramIndex}`;
            params.push(bin);
            paramIndex++;
        }
        
        // ✅ CAMBIO AQUÍ: ordenar por updated_at (más reciente primero), luego check_date
        query += ` GROUP BY ul.id ORDER BY ul.updated_at DESC NULLS LAST, ul.check_date DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
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
    // Dentro de models/Live.js
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
                RETURNING id`,
                [
                    live_id, user_id, action_type, page_id, page_name, account_id,
                    amount, currency, product_name, is_direct_payment, rest_days,
                    response_id, response_text, transferred_to, transfer_result,
                    action_date || new Date().toISOString().split('T')[0],
                    device_used, notes, additional_info
                ]
            );

            // ========== RECALCULAR FASE Y ESTADO BASADO EN EL HISTORIAL COMPLETO ==========
            // Obtener todas las acciones de esta live (ordenadas cronológicamente)
            const actionsRes = await client.query(
                `SELECT action_type, response_text FROM live_actions 
                WHERE live_id = $1 ORDER BY action_date ASC, action_time ASC`,
                [live_id]
            );
            const actions = actionsRes.rows;

            let hasAssociated = false;
            let hasPayment = false;
            let hasPaymentApproved = false;
            let hasInsufficientDecline = false;
            let hasAnyDecline = false;

            for (const act of actions) {
                if (act.action_type === 'associated_account') hasAssociated = true;
                if (act.action_type === 'payment_approved') {
                    hasPayment = true;
                    hasPaymentApproved = true;
                }
                if (act.action_type === 'payment_declined') {
                    hasPayment = true;
                    hasAnyDecline = true;
                    const resp = (act.response_text || '').toLowerCase();
                    if (resp.includes('insufficient') || resp.includes('sin fondos') || resp.includes('insuficiente')) {
                        hasInsufficientDecline = true;
                    }
                }
            }

            let newPhase = 'pending';
            let newStatus = null; // null significa que no se actualiza (queda el actual)

            // Determinar fase
            if (hasAssociated) {
                newPhase = hasPayment ? 'associated_used' : 'associated';
            } else {
                newPhase = hasPayment ? 'used_without_assoc' : 'pending';
            }

            // Determinar estado
            if (hasPaymentApproved) {
                newStatus = 'live';
            } else if (hasInsufficientDecline) {
                newStatus = 'insufficient';
            } else if (hasAnyDecline) {
                newStatus = 'dead';
            }
            // Si no hay acciones de pago, no cambiamos el estado (se mantiene el que ya tenía)

            // Actualizar la live con la nueva fase y posiblemente el nuevo estado
            const updates = [];
            const values = [];
            let idx = 1;
            if (newPhase) {
                updates.push(`phase = $${idx++}`);
                values.push(newPhase);
            }
            if (newStatus) {
                updates.push(`status = $${idx++}`);
                values.push(newStatus);
            }
            if (updates.length > 0) {
                values.push(live_id);
                await client.query(
                    `UPDATE user_lives SET ${updates.join(', ')} WHERE id = $${idx}`,
                    values
                );
            }

            // Actualizar estadísticas de cuenta si se especificó (igual que antes)
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


    // Crear acción con action_data
    static async addActionWithData(actionData) {
        const {
            live_id, user_id, action_type, page_id, page_name, account_id,
            amount, currency, product_name, is_direct_payment, rest_days,
            response_id, response_text, transferred_to, transfer_result,
            action_date, device_used, notes, action_data = {}
        } = actionData;

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const result = await client.query(
                `INSERT INTO live_actions 
                (live_id, user_id, action_type, page_id, page_name, account_id,
                amount, currency, product_name, is_direct_payment, rest_days,
                response_id, response_text, transferred_to, transfer_result,
                action_date, device_used, notes, action_data, action_time)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 
                        $14, $15, $16, $17, $18, $19, NOW())
                RETURNING id`,
                [
                    live_id, user_id, action_type, page_id, page_name, account_id,
                    amount, currency, product_name, is_direct_payment, rest_days,
                    response_id, response_text, transferred_to, transfer_result,
                    action_date || new Date().toISOString().split('T')[0],
                    device_used, notes, action_data
                ]
            );

            await client.query('COMMIT');
            return result.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Transferir tarjeta a otro usuario
    static async transferCard(liveId, fromUserId, toUserId, contactId, pageId, resultText, notes = '') {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Obtener la tarjeta original
            const cardResult = await client.query(
                'SELECT * FROM user_lives WHERE id = $1 AND user_id = $2',
                [liveId, fromUserId]
            );
            if (cardResult.rows.length === 0) throw new Error('Tarjeta no encontrada');

            const originalCard = cardResult.rows[0];

            // Insertar copia para el receptor
            const newCardResult = await client.query(
                `INSERT INTO user_lives 
                (user_id, card_full, card_last_four, card_bin, card_type, gate_name,
                check_date, status, phase, notes, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'unknown', 'pending', $7, NOW())
                RETURNING id`,
                [
                    toUserId,
                    originalCard.card_full,
                    originalCard.card_last_four,
                    originalCard.card_bin,
                    originalCard.card_type,
                    originalCard.gate_name,
                    `Transferida por usuario ${fromUserId}`
                ]
            );
            const newLiveId = newCardResult.rows[0].id;

            // Crear acción de "live obtenida" para el receptor
            await client.query(
                `INSERT INTO live_actions 
                (live_id, user_id, action_type, page_name, action_data, action_date, notes, action_time)
                VALUES ($1, $2, 'live_obtained', $3, $4, NOW(), $5, NOW())`,
                [
                    newLiveId,
                    toUserId,
                    originalCard.gate_name,
                    JSON.stringify({ transferred_from: fromUserId, contact_id: contactId }),
                    `Tarjeta transferida por contacto ID ${contactId}`
                ]
            );

            // Crear acción de transferencia para el emisor
            await client.query(
                `INSERT INTO live_actions 
                (live_id, user_id, action_type, page_id, page_name, transferred_to, response_text, action_data, action_date, notes, action_time)
                VALUES ($1, $2, 'transferred', $3, $4, $5, $6, $7, NOW(), $8, NOW())`,
                [
                    liveId,
                    fromUserId,
                    pageId,
                    (await client.query('SELECT name FROM pages WHERE id = $1', [pageId])).rows[0]?.name,
                    `Usuario ${toUserId}`,
                    resultText,
                    JSON.stringify({ contact_id: contactId, to_user_id: toUserId }),
                    notes
                ]
            );

            await client.query('COMMIT');
            return { newLiveId, toUserId };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }


}


module.exports = Live;
