// routes/accounts.js
const express = require('express');
const router = express.Router();
const { authenticate, trackActivity } = require('../middleware/auth');
const Account = require('../models/Account');

// Todas las rutas requieren autenticación
router.use(authenticate);

// ========== RUTAS DE CUENTAS ==========

// Obtener todas las cuentas del usuario
router.get('/', async (req, res) => {
    try {
        const { platform } = req.query;
        const accounts = await Account.getUserAccounts(req.user.id, platform);
        
        res.json({
            success: true,
            accounts
        });
        
    } catch (error) {
        console.error('Error obteniendo cuentas:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Crear nueva cuenta
router.post('/', trackActivity, async (req, res) => {
    try {
        const {
            platform,
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
        
        const account = await Account.create(req.user.id, {
            platform,
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

// Actualizar cuenta
router.put('/:accountId', trackActivity, async (req, res) => {
    try {
        const { accountId } = req.params;
        const updateData = req.body;
        
        const account = await Account.update(accountId, req.user.id, updateData);
        
        res.json({
            success: true,
            account,
            message: 'Cuenta actualizada exitosamente'
        });
        
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