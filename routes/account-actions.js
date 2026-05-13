const express = require('express');
const router = express.Router();
const { authenticate, trackActivity } = require('../middleware/auth');
const AccountAction = require('../models/AccountAction');

router.use(authenticate);

// Obtener historial de acciones de una cuenta específica
router.get('/:accountId', async (req, res) => {
    try {
        const { accountId } = req.params;
        const actions = await AccountAction.getByAccountId(accountId, req.user.id);
        res.json({ success: true, actions });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Crear nueva acción para una cuenta
router.post('/:accountId', trackActivity, async (req, res) => {
    try {
        const { accountId } = req.params;
        const actionData = req.body;
        const newAction = await AccountAction.create(accountId, req.user.id, actionData);
        res.json({ success: true, action: newAction });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Actualizar una acción existente
router.put('/:accountId/:actionId', trackActivity, async (req, res) => {
    try {
        const { actionId } = req.params;
        const updated = await AccountAction.update(actionId, req.user.id, req.body);
        if (!updated) return res.status(404).json({ success: false, error: 'Acción no encontrada' });
        res.json({ success: true, action: updated });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Eliminar una acción
router.delete('/:accountId/:actionId', async (req, res) => {
    try {
        const { actionId } = req.params;
        const deleted = await AccountAction.delete(actionId, req.user.id);
        if (!deleted) return res.status(404).json({ success: false, error: 'Acción no encontrada' });
        res.json({ success: true, message: 'Acción eliminada' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;