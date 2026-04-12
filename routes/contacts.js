const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const Contact = require('../models/Contact');

router.use(authenticate);

router.get('/', async (req, res) => {
    try {
        const contacts = await Contact.getUserContacts(req.user.id);
        res.json({ success: true, contacts });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/', async (req, res) => {
    try {
        const { name, telegram_id, telegram_username, is_system_user, system_user_id } = req.body;
        if (!name) return res.status(400).json({ success: false, error: 'Nombre requerido' });
        const contact = await Contact.create(req.user.id, name, telegram_id, telegram_username, is_system_user, system_user_id);
        res.json({ success: true, contact });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const contact = await Contact.update(req.params.id, req.user.id, req.body);
        if (!contact) return res.status(404).json({ success: false, error: 'Contacto no encontrado' });
        res.json({ success: true, contact });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await Contact.delete(req.params.id, req.user.id);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;