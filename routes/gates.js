const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const Gate = require('../models/Gate');

router.use(authenticate);

// Obtener todos los gates (globales + los del usuario)
router.get('/', async (req, res) => {
    try {
        const gates = await Gate.getAll(req.user.id);
        res.json({ success: true, gates });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Crear un gate personalizado
router.post('/', async (req, res) => {
    try {
        const { name, checker_string, mount_charged, is_charged, is_auth, is_cvv, payment_gateway } = req.body;
        if (!name) return res.status(400).json({ success: false, error: 'Nombre requerido' });
        const gate = await Gate.create(name, req.user.id, { checker_string, mount_charged, is_charged, is_auth, is_cvv, payment_gateway });
        res.json({ success: true, gate });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Actualizar gate personalizado
router.put('/:id', async (req, res) => {
    try {
        const gate = await Gate.update(req.params.id, req.user.id, req.body);
        if (!gate) return res.status(404).json({ success: false, error: 'Gate no encontrado o no editable' });
        res.json({ success: true, gate });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;