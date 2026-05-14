// routes/accounts.js
const express = require('express');
const router = express.Router();
const { authenticate, trackActivity } = require('../middleware/auth');
const Account = require('../models/UserAccount');
const { pool } = require('../database');

// Todas las rutas requieren autenticación
router.use(authenticate);



// Obtener todas las cuentas asociadas a un email
router.get('/by-email/:emailId', async (req, res) => {
    const { emailId } = req.params;
    const userId = req.user.id;
    
    const result = await pool.query(
        `SELECT a.*, p.name as page_name 
         FROM accounts a
         LEFT JOIN pages p ON a.page_id = p.id
         WHERE a.email_id = $1 AND a.user_id = $2
         ORDER BY a.created_at DESC`,
        [emailId, userId]
    );
    res.json({ success: true, accounts: result.rows });
});

// Obtener todas las cuentas asociadas a un número
router.get('/by-number/:numberId', async (req, res) => {
    const { numberId } = req.params;
    const userId = req.user.id;
    
    const result = await pool.query(
        `SELECT a.*, p.name as page_name 
         FROM accounts a
         LEFT JOIN pages p ON a.page_id = p.id
         WHERE a.number_id = $1 AND a.user_id = $2
         ORDER BY a.created_at DESC`,
        [numberId, userId]
    );
    res.json({ success: true, accounts: result.rows });
});

// Crear cuenta desde email/número (con menos campos)
router.post('/from-contact', async (req, res) => {
    const { email_id, number_id, page_name, password, notes } = req.body;
    const userId = req.user.id;
    
    // Buscar o crear la página
    let pageId = null;
    if (page_name) {
        const pageRes = await pool.query(
            `SELECT id FROM pages WHERE name ILIKE $1`,
            [page_name]
        );
        if (pageRes.rows.length > 0) {
            pageId = pageRes.rows[0].id;
        } else {
            // Crear página personal
            const newPage = await pool.query(
                `INSERT INTO user_pages (user_id, name) VALUES ($1, $2) RETURNING id`,
                [userId, page_name]
            );
            pageId = newPage.rows[0].id;
        }
    }
    
    const result = await pool.query(
        `INSERT INTO accounts 
         (user_id, email_id, number_id, page_id, password, platform_name, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [userId, email_id, number_id, pageId, password, page_name, notes]
    );
    
    res.json({ success: true, account: result.rows[0] });
});

// ========== RUTAS DE CUENTAS ==========
router.get('/', async (req, res) => {
    try {
        const { page_id, platform } = req.query;
        let query = 'SELECT * FROM user_accounts WHERE user_id = $1';
        const params = [req.user.id];
        if (page_id) {
            query += ' AND page_id = $2';
            params.push(page_id);
        } else if (platform) {
            query += ' AND platform = $2';
            params.push(platform);
        }
        query += ' ORDER BY account_name';
        const result = await pool.query(query, params);
        res.json({ success: true, accounts: result.rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});
// Crear nueva cuenta
// routes/accounts.js - Modifica el POST /accounts
router.post('/', trackActivity, async (req, res) => {
    try {
        // Permitir tanto 'platform' como 'platform_name'
        const platform = req.body.platform_name || req.body.platform;
        
        const {
            account_name,
            account_email,
            account_phone,
            device_name,
            status,
            notes
        } = req.body;
        
        if (!platform) {
            return res.status(400).json({
                success: false,
                error: 'Plataforma es requerida'
            });
        }
        
        // Pasar 'platform' (que ahora tiene el valor correcto) al modelo
        const account = await Account.create(req.user.id, {
            platform_name: platform,   // ← clave corregida
            page_id: req.body.page_id,
            account_name,
            account_email,
            account_phone,
            device_name,
            status,
            notes
        });
        
        res.json({
            success: true,
            account,
            message: 'Cuenta creada exitosamente'
        });
        
    } catch (error) {
        console.error('Error creando cuenta:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Obtener cuenta específica con estadísticas
router.get('/:accountId', async (req, res) => {
    try {
        const { accountId } = req.params;
        
        const account = await Account.findById(accountId, req.user.id);
        
        if (!account) {
            return res.status(404).json({
                success: false,
                error: 'Cuenta no encontrada'
            });
        }
        
        const stats = await Account.getAccountStats(accountId);
        const actions = await Account.getAccountActions(accountId, 20);
        
        res.json({
            success: true,
            account: {
                ...account,
                stats,
                recent_actions: actions
            }
        });
        
    } catch (error) {
        console.error('Error obteniendo cuenta:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/:accountId', trackActivity, async (req, res) => {
    try {
        const { accountId } = req.params;
        const updateData = req.body;
        const account = await Account.update(accountId, req.user.id, updateData);
        if (!account) {
            return res.status(404).json({ success: false, error: 'Cuenta no encontrada' });
        }
        res.json({ success: true, account, message: 'Cuenta actualizada exitosamente' });
    } catch (error) {
        console.error('Error actualizando cuenta:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Buscar cuentas por plataforma y término
router.get('/search/:platform', async (req, res) => {
    try {
        const { platform } = req.params;
        const { q } = req.query;
        
        if (!q) {
            return res.status(400).json({
                success: false,
                error: 'Término de búsqueda es requerido'
            });
        }
        
        const accounts = await Account.searchAccounts(req.user.id, platform, q);
        
        res.json({
            success: true,
            accounts
        });
        
    } catch (error) {
        console.error('Error buscando cuentas:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Asociar cuenta a una live (desde la ruta de lives)
router.post('/:accountId/associate-with-live', trackActivity, async (req, res) => {
    try {
        const { accountId } = req.params;
        const { live_id, page_name, notes, action_date } = req.body;
        
        if (!live_id) {
            return res.status(400).json({
                success: false,
                error: 'live_id es requerido'
            });
        }
        
        // Verificar que la cuenta existe y pertenece al usuario
        const account = await Account.findById(accountId, req.user.id);
        if (!account) {
            return res.status(404).json({
                success: false,
                error: 'Cuenta no encontrada'
            });
        }
        
        // Añadir acción de asociación
        const Live = require('../models/Live');
        const action = await Live.addAction({
            live_id,
            user_id: req.user.id,
            action_type: 'associated_account',
            page_name: page_name || account.platform,
            account_id: accountId,
            action_date: action_date || new Date().toISOString().split('T')[0],
            device_used: account.device_name,
            notes: notes || `Asociada a cuenta ${account.account_name || account.account_email}`
        });
        
        res.json({
            success: true,
            action,
            message: 'Cuenta asociada exitosamente a la live'
        });
        
    } catch (error) {
        console.error('Error asociando cuenta:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;