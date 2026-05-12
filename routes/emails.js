const express = require('express');
const router = express.Router();
const { authenticate, trackActivity } = require('../middleware/auth');
const Email = require('../models/Email');

router.use(authenticate);

router.get('/', async (req, res) => {
    try {
        const emails = await Email.getAll(req.user.id);
        res.json({ success: true, emails });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/', trackActivity, async (req, res) => {
    try {
        const { email, label, notes } = req.body;
        if (!email) return res.status(400).json({ success: false, error: 'Email requerido' });
        const emailObj = await Email.create(req.user.id, { email, label, notes });
        res.json({ success: true, email: emailObj });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/:id', trackActivity, async (req, res) => {
    try {
        const email = await Email.update(req.params.id, req.user.id, req.body);
        if (!email) return res.status(404).json({ success: false, error: 'Email no encontrado' });
        res.json({ success: true, email });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const deleted = await Email.delete(req.params.id, req.user.id);
        if (!deleted) return res.status(404).json({ success: false, error: 'Email no encontrado' });
        res.json({ success: true, message: 'Email eliminado' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;