// routes/lives.js
const express = require('express');
const router = express.Router();
const { authenticate, requireRole, trackActivity } = require('../middleware/auth');
const Live = require('../models/Live');
const Account = require('../models/Account');

// Todas las rutas requieren autenticación
router.use(authenticate);

// ========== RUTAS DE LIVES ==========

// Obtener todas las lives del usuario
router.get('/', async (req, res) => {
    try {
        const { status, gate, bin, page = 1, limit = 50 } = req.query;
        
        const lives = await Live.getUserLives(req.user.id, {
            status, gate, bin, page: parseInt(page), limit: parseInt(limit)
        });
        
        // Obtener estadísticas para filtros
        const gatesResult = await pool.query(
            'SELECT DISTINCT gate_used FROM user_lives WHERE user_id = $1 ORDER BY gate_used',
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
                gates: gatesResult.rows.map(r => r.gate_used),
                bins: binsResult.rows.map(r => r.card_bin)
            },
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });
        
    } catch (error) {
        console.error('Error obteniendo lives:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Crear nueva live
router.post('/', trackActivity, async (req, res) => {
    try {
        const { card_full, gate_used, check_date, notes } = req.body;
        
        if (!card_full || !gate_used) {
            return res.status(400).json({
                success: false,
                error: 'card_full y gate_used son requeridos'
            });
        }
        
        const live = await Live.create(req.user.id, {
            card_full, gate_used, check_date, notes
        });
        
        // Crear acción automática de "live obtenida"
        await Live.addAction({
            live_id: live.id,
            user_id: req.user.id,
            action_type: 'live_obtained',
            page_name: gate_used,
            action_date: check_date || new Date().toISOString().split('T')[0],
            notes: `Live obtenida de ${gate_used}`
        });
        
        res.json({
            success: true,
            live,
            message: 'Live creada exitosamente'
        });
        
    } catch (error) {
        console.error('Error creando live:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Obtener una live específica con sus acciones
router.get('/:liveId', async (req, res) => {
    try {
        const { liveId } = req.params;
        
        const live = await Live.getLiveWithActions(liveId, req.user.id);
        
        if (!live) {
            return res.status(404).json({
                success: false,
                error: 'Live no encontrada'
            });
        }
        
        // Obtener cuentas del usuario para asociar
        const accounts = await Account.getUserAccounts(req.user.id);
        
        // Obtener páginas disponibles
        const pages = await Live.getPages();
        
        res.json({
            success: true,
            live,
            accounts,
            pages
        });
        
    } catch (error) {
        console.error('Error obteniendo live:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== ACCIONES DE LIVES ==========

// Añadir acción a una live
router.post('/:liveId/actions', trackActivity, async (req, res) => {
    try {
        const { liveId } = req.params;
        const {
            action_type,
            page_name,
            page_id,
            account_id,
            amount,
            product_name,
            is_direct_payment,
            rest_days,
            response_text,
            transferred_to,
            transfer_result,
            action_date,
            device_used,
            notes
        } = req.body;
        
        // Validar tipo de acción
        const validActions = [
            'live_obtained', 'payment_declined', 'payment_approved',
            'transferred_to_other', 'associated_account', 'manual_note'
        ];
        
        if (!validActions.includes(action_type)) {
            return res.status(400).json({
                success: false,
                error: 'Tipo de acción inválido'
            });
        }
        
        // Buscar página si solo se proporciona nombre
        let finalPageId = page_id;
        if (page_name && !page_id) {
            const page = await Live.findPageByName(page_name);
            if (page) {
                finalPageId = page.id;
            }
        }
        
        // Preparar datos de la acción
        const actionData = {
            live_id: parseInt(liveId),
            user_id: req.user.id,
            action_type,
            page_id: finalPageId,
            page_name: page_name || null,
            account_id: account_id || null,
            amount: amount ? parseFloat(amount) : null,
            product_name: product_name || null,
            is_direct_payment: is_direct_payment !== undefined ? is_direct_payment : true,
            rest_days: rest_days ? parseInt(rest_days) : null,
            response_text: response_text || null,
            transferred_to: transferred_to || null,
            transfer_result: transfer_result || null,
            action_date: action_date || new Date().toISOString().split('T')[0],
            device_used: device_used || null,
            notes: notes || ''
        };
        
        const action = await Live.addAction(actionData);
        
        res.json({
            success: true,
            action,
            message: 'Acción añadida exitosamente'
        });
        
    } catch (error) {
        console.error('Error añadiendo acción:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Obtener acciones de una live
router.get('/:liveId/actions', async (req, res) => {
    try {
        const { liveId } = req.params;
        
        // Verificar que la live pertenece al usuario
        const liveCheck = await pool.query(
            'SELECT id FROM user_lives WHERE id = $1 AND user_id = $2',
            [liveId, req.user.id]
        );
        
        if (liveCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Live no encontrada'
            });
        }
        
        const actions = await pool.query(
            `SELECT la.*, p.name as page_name, ua.account_name
             FROM live_actions la
             LEFT JOIN pages p ON la.page_id = p.id
             LEFT JOIN user_accounts ua ON la.account_id = ua.id
             WHERE la.live_id = $1
             ORDER BY la.action_date DESC, la.action_time DESC`,
            [liveId]
        );
        
        res.json({
            success: true,
            actions: actions.rows
        });
        
    } catch (error) {
        console.error('Error obteniendo acciones:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== PÁGINAS Y RESPUESTAS ==========

// Obtener páginas disponibles
router.get('/pages/available', async (req, res) => {
    try {
        const { search } = req.query;
        const pages = await Live.getPages(search);
        
        res.json({
            success: true,
            pages
        });
        
    } catch (error) {
        console.error('Error obteniendo páginas:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Obtener respuestas para una página
router.get('/pages/:pageId/responses', async (req, res) => {
    try {
        const { pageId } = req.params;
        const responses = await Live.getPageResponses(pageId);
        
        res.json({
            success: true,
            responses
        });
        
    } catch (error) {
        console.error('Error obteniendo respuestas:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== ADMIN: GESTIÓN DE PÁGINAS ==========

// Crear nueva página (admin only)
router.post('/pages', requireRole('admin'), async (req, res) => {
    try {
        const { name, category } = req.body;
        
        if (!name) {
            return res.status(400).json({
                success: false,
                error: 'Nombre de página es requerido'
            });
        }
        
        const page = await Live.createPage(name, category, req.user.id);
        
        res.json({
            success: true,
            page,
            message: 'Página creada exitosamente'
        });
        
    } catch (error) {
        console.error('Error creando página:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Añadir respuesta a página (admin only)
router.post('/pages/:pageId/responses', requireRole('admin'), async (req, res) => {
    try {
        const { pageId } = req.params;
        const { response_text, response_type } = req.body;
        
        if (!response_text) {
            return res.status(400).json({
                success: false,
                error: 'Texto de respuesta es requerido'
            });
        }
        
        const response = await Live.addPageResponse(
            pageId, response_text, response_type, req.user.id
        );
        
        res.json({
            success: true,
            response,
            message: 'Respuesta añadida exitosamente'
        });
        
    } catch (error) {
        console.error('Error añadiendo respuesta:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== RUTAS PARA LAS LIVES DE EJEMPLO ==========

// Endpoint especial para crear lives de ejemplo
router.post('/examples/create', trackActivity, async (req, res) => {
    try {
        const examples = [
            {
                card_full: '5499490562982165|05|2030|895',
                actions: [
                    { type: 'live_obtained', page_name: 'Amazon MX', notes: 'live de amazon mx' },
                    { type: 'live_obtained', page_name: 'Shadow Dragon', notes: 'live de shadow dragon' },
                    { type: 'associated_account', page_name: 'AliExpress', notes: 'asociaste en aliexpress en poco f7 y sí está jalando compras', device_used: 'Poco F7' },
                    { type: 'payment_declined', page_name: 'Miatt', amount: 50, notes: 'no pasó $50 en miatt xd' }
                ]
            },
            {
                card_full: '5499490562980557|05|2030|351',
                actions: [
                    { type: 'live_obtained', page_name: 'Amazon MX', notes: 'live de amazon mx' },
                    { type: 'live_obtained', page_name: 'Shadow Dragon', notes: 'live de shadow dragon' },
                    { type: 'transferred_to_other', page_name: 'AliExpress', transferred_to: 'Yakoo', notes: 'pasaste a Yakoo para aliexpress pero nunca caló' }
                ]
            },
            {
                card_full: '5546259010306068|03|2026|919',
                actions: [
                    { type: 'live_obtained', page_name: 'Shadow Dragon', notes: 'live de shadow dragon' },
                    { type: 'associated_account', page_name: 'AliExpress', notes: 'está asociada en aliexpress de creo celular amarillo de draco', device_used: 'Celular amarillo de Draco' }
                ]
            }
        ];
        
        const createdLives = [];
        
        for (const example of examples) {
            // Crear la live
            const live = await Live.create(req.user.id, {
                card_full: example.card_full,
                gate_used: 'Ejemplo',
                check_date: new Date().toISOString().split('T')[0],
                notes: 'Live de ejemplo creada automáticamente'
            });
            
            // Añadir acciones
            for (const actionData of example.actions) {
                await Live.addAction({
                    live_id: live.id,
                    user_id: req.user.id,
                    action_type: actionData.type,
                    page_name: actionData.page_name,
                    amount: actionData.amount,
                    transferred_to: actionData.transferred_to,
                    device_used: actionData.device_used,
                    action_date: new Date().toISOString().split('T')[0],
                    notes: actionData.notes
                });
            }
            
            createdLives.push(live.id);
        }
        
        res.json({
            success: true,
            message: 'Lives de ejemplo creadas exitosamente',
            live_ids: createdLives
        });
        
    } catch (error) {
        console.error('Error creando ejemplos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;