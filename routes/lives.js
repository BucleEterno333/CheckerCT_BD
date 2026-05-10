// routes/lives.js
const express = require('express');
const router = express.Router();
const { authenticate, requireRole, trackActivity } = require('../middleware/auth');
const Live = require('../models/Live');
const Account = require('../models/UserAccount');
const Contact = require('../models/Contact');
const { bot } = require('../bot_telegram'); // si quieres notificar
const { pool } = require('../database');
const { sendSafeMessage } = require('../bot_telegram');

router.use(authenticate);

// ========== OBTENER LIVES ==========
router.get('/', async (req, res) => {
    try {
        const { status, gate, bin, page = 1, limit = 50 } = req.query;
        const lives = await Live.getUserLives(req.user.id, { status, gate, bin, page: parseInt(page), limit: parseInt(limit) });

        const gatesResult = await pool.query(
            'SELECT DISTINCT gate_name FROM user_lives WHERE user_id = $1 ORDER BY gate_name',
            [req.user.id]
        );
        const binsResult = await pool.query(
            'SELECT DISTINCT card_bin FROM user_lives WHERE user_id = $1 ORDER BY card_bin',
            [req.user.id]
        );

        res.json({
            success: true,
            lives,
            filters: {
                gates: gatesResult.rows.map(r => r.gate_name),
                bins: binsResult.rows.map(r => r.card_bin)
            },
            pagination: { page: parseInt(page), limit: parseInt(limit) }
        });
    } catch (error) {
        console.error('Error obteniendo lives:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== CREAR LIVE ==========
router.post('/', trackActivity, async (req, res) => {
    try {
        const { card_full, gate_name, check_date, notes } = req.body;
        if (!card_full || !gate_name) {
            return res.status(400).json({ success: false, error: 'card_full y gate_name son requeridos' });
        }

        const live = await Live.create(req.user.id, { card_full, gate_name, check_date, notes });
        await Live.addAction({
            live_id: live.id,
            user_id: req.user.id,
            action_type: 'live_obtained',
            page_name: gate_name,
            action_date: check_date || new Date().toISOString().split('T')[0],
            notes: `Live obtenida de ${gate_name}`
        });

        res.json({ success: true, live, message: 'Live creada exitosamente' });
    } catch (error) {
        console.error('Error creando live:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


// POST /api/lives/:liveId/enrich
router.post('/:liveId/enrich', async (req, res) => {
    try {
        const { liveId } = req.params;
        const live = await pool.query('SELECT card_full FROM user_lives WHERE id = $1 AND user_id = $2', [liveId, req.user.id]);
        if (live.rows.length === 0) return res.status(404).json({ success: false, error: 'Live no encontrada' });
        
        const cardNumber = live.rows[0].card_full.split('|')[0];
        const bin = cardNumber.slice(0, 6);
        
        // Llamar a binlist.net
        const response = await fetch(`https://lookup.binlist.net/${bin}`);
        if (!response.ok) throw new Error('Error consultando BIN');
        const data = await response.json();
        
        const updates = {};
        if (data.bank && data.bank.name) updates.bank_name = data.bank.name;
        if (data.country && data.country.name) updates.country = data.country.name;
        if (data.scheme) updates.network = data.scheme.charAt(0).toUpperCase() + data.scheme.slice(1); // visa, mastercard
        if (data.type) updates.card_class = data.type === 'credit' ? 'Crédito' : (data.type === 'debit' ? 'Débito' : 'Otro');
        
        if (Object.keys(updates).length > 0) {
            const setClause = Object.keys(updates).map((k, i) => `${k} = $${i+1}`).join(', ');
            const values = Object.values(updates);
            values.push(liveId);
            await pool.query(`UPDATE user_lives SET ${setClause} WHERE id = $${values.length}`, values);
        }
        
        res.json({ success: true, message: 'Tarjeta enriquecida', data: updates });
    } catch (error) {
        console.error('Error enriqueciendo tarjeta:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== OBTENER LIVE ESPECÍFICA ==========
router.get('/:liveId', async (req, res) => {
    try {
        const live = await Live.getLiveWithActions(req.params.liveId, req.user.id);
        if (!live) return res.status(404).json({ success: false, error: 'Live no encontrada' });
        const accounts = await Account.getUserAccounts(req.user.id);
        const pages = await Live.getPages();
        res.json({ success: true, live, accounts, pages });
    } catch (error) {
        console.error('Error obteniendo live:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== ACCIONES ==========
router.post('/:liveId/actions', trackActivity, async (req, res) => {
    try {
        const { liveId } = req.params;
        const { action_type, page_name, page_id, account_id, amount, product_name, is_direct_payment, rest_days, response_text, transferred_to, transfer_result, action_date, device_used, notes } = req.body;

        const validActions = ['live_obtained', 'payment_declined', 'payment_approved', 'transferred_to_other', 'associated_account', 'manual_note'];
        if (!validActions.includes(action_type)) return res.status(400).json({ success: false, error: 'Tipo de acción inválido' });

        let finalPageId = page_id;
        if (page_name && !page_id) {
            const page = await Live.findPageByName(page_name);
            if (page) finalPageId = page.id;
        }

        const actionData = {
            live_id: parseInt(liveId), user_id: req.user.id, action_type,
            page_id: finalPageId, page_name: page_name || null,
            account_id: account_id || null, amount: amount ? parseFloat(amount) : null,
            product_name: product_name || null, is_direct_payment: is_direct_payment !== undefined ? is_direct_payment : true,
            rest_days: rest_days ? parseInt(rest_days) : null, response_text: response_text || null,
            transferred_to: transferred_to || null, transfer_result: transfer_result || null,
            action_date: action_date || new Date().toISOString().split('T')[0],
            device_used: device_used || null, notes: notes || ''
        };

        const action = await Live.addAction(actionData);
        res.json({ success: true, action, message: 'Acción añadida exitosamente' });
    } catch (error) {
        console.error('Error añadiendo acción:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/:liveId/actions', async (req, res) => {
    try {
        const { liveId } = req.params;
        const liveCheck = await pool.query('SELECT id FROM user_lives WHERE id = $1 AND user_id = $2', [liveId, req.user.id]);
        if (liveCheck.rows.length === 0) return res.status(404).json({ success: false, error: 'Live no encontrada' });

        const actions = await pool.query(
            `SELECT la.*, p.name as page_name, ua.account_name
             FROM live_actions la
             LEFT JOIN pages p ON la.page_id = p.id
             LEFT JOIN user_accounts ua ON la.account_id = ua.id
             WHERE la.live_id = $1
             ORDER BY la.action_date DESC, la.action_time DESC`,
            [liveId]
        );
        res.json({ success: true, actions: actions.rows });
    } catch (error) {
        console.error('Error obteniendo acciones:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== PÁGINAS Y RESPUESTAS ==========
router.get('/pages/available', async (req, res) => {
    try {
        const pages = await Live.getPages(req.query.search);
        res.json({ success: true, pages });
    } catch (error) {
        console.error('Error obteniendo páginas:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/pages/:pageId/responses', async (req, res) => {
    try {
        const responses = await Live.getPageResponses(req.params.pageId);
        res.json({ success: true, responses });
    } catch (error) {
        console.error('Error obteniendo respuestas:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== ADMIN ==========
router.post('/pages', requireRole('admin'), async (req, res) => {
    try {
        const { name, category } = req.body;
        if (!name) return res.status(400).json({ success: false, error: 'Nombre de página es requerido' });
        const page = await Live.createPage(name, category, req.user.id);
        res.json({ success: true, page, message: 'Página creada exitosamente' });
    } catch (error) {
        console.error('Error creando página:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/pages/:pageId/responses', requireRole('admin'), async (req, res) => {
    try {
        const { pageId } = req.params;
        const { response_text, response_type } = req.body;
        if (!response_text) return res.status(400).json({ success: false, error: 'Texto de respuesta es requerido' });
        const response = await Live.addPageResponse(pageId, response_text, response_type, req.user.id);
        res.json({ success: true, response, message: 'Respuesta añadida exitosamente' });
    } catch (error) {
        console.error('Error añadiendo respuesta:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== ELIMINAR ==========
router.delete('/:liveId', async (req, res) => {
    try {
        const { liveId } = req.params;
        const result = await pool.query('DELETE FROM user_lives WHERE id = $1 AND user_id = $2 RETURNING id', [liveId, req.user.id]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Live no encontrada' });
        res.json({ success: true, message: 'Live eliminada' });
    } catch (error) {
        console.error('Error eliminando live:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== ACTUALIZAR ==========
router.put('/:liveId', async (req, res) => {
    try {
        const { liveId } = req.params;
        const { card_full, gate_name, bank_name, country, card_type, device_name, check_date, status, phase, notes, network, card_class } = req.body;
        const check = await pool.query('SELECT id FROM user_lives WHERE id = $1 AND user_id = $2', [liveId, req.user.id]);
        if (check.rows.length === 0) return res.status(404).json({ success: false, error: 'Live no encontrada' });

        const result = await pool.query(
            `UPDATE user_lives 
             SET card_full = COALESCE($1, card_full),
                 gate_name = COALESCE($2, gate_name),
                 bank_name = COALESCE($3, bank_name),
                 country = COALESCE($4, country),
                 card_type = COALESCE($5, card_type),
                 device_name = COALESCE($6, device_name),
                 check_date = COALESCE($7, check_date),
                 status = COALESCE($8, status),
                 phase = COALESCE($9, phase),
                 notes = COALESCE($10, notes),
                 network = COALESCE($11, network),
                 card_class = COALESCE($12, card_class),
                 updated_at = NOW()
             WHERE id = $13
             RETURNING *`,
            [card_full, gate_name, bank_name, country, card_type, device_name, check_date, status, phase, notes, network, card_class, liveId]
        );
        res.json({ success: true, live: result.rows[0] });
    } catch (error) {
        console.error('Error actualizando live:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


// Transferir tarjeta a otro usuario (contacto)
router.post('/:liveId/transfer', async (req, res) => {
    try {
        const { liveId } = req.params;
        const { contact_id, page_id, result, notes } = req.body;
        if (!contact_id || !page_id) {
            return res.status(400).json({ success: false, error: 'contact_id y page_id requeridos' });
        }

        // Obtener contacto
        const contact = await Contact.getUserContacts(req.user.id).then(contacts => contacts.find(c => c.id == contact_id));
        if (!contact) return res.status(404).json({ success: false, error: 'Contacto no encontrado' });
        if (!contact.is_system_user || !contact.system_user_id) {
            return res.status(400).json({ success: false, error: 'El contacto no tiene cuenta en el sistema' });
        }

        const transferResult = await Live.transferCard(liveId, req.user.id, contact.system_user_id, contact_id, page_id, result, notes);

        // Enviar notificación por Telegram si el receptor tiene chat_id
        const receiverUser = await pool.query('SELECT telegram_chat_id FROM users WHERE id = $1', [transferResult.toUserId]);
        if (receiverUser.rows[0]?.telegram_chat_id && bot) {
            const card = await pool.query('SELECT card_last_four, gate_name FROM user_lives WHERE id = $1', [liveId]);
            await sendSafeMessage(
                receiverUser.rows[0].telegram_chat_id,
                `🔔 *Te han transferido una tarjeta*\n\n` +
                `📌 Terminación: ${card.rows[0].card_last_four}\n` +
                `🛒 Gate: ${card.rows[0].gate_name}\n` +
                `👤 Transferido por: ${req.user.username}\n\n` +
                `Revisa "Mis tarjetas" para ver los detalles.`,
                { parse_mode: 'Markdown' }
            );
        }

        res.json({ success: true, message: 'Tarjeta transferida', newLiveId: transferResult.newLiveId });
    } catch (error) {
        console.error('Error transfiriendo tarjeta:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;