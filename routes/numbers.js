const express = require('express');
const router = express.Router();
const { authenticate, trackActivity } = require('../middleware/auth');
const PhoneNumber = require('../models/PhoneNumber');

router.use(authenticate);

router.get('/', async (req, res) => {
    try {
        const numbers = await PhoneNumber.getAll(req.user.id);
        res.json({ success: true, numbers });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/', trackActivity, async (req, res) => {
    try {
        const { company, phone_number, has_data, verified, verified_name, registered_pages, notes } = req.body;
        if (!company || !phone_number) {
            return res.status(400).json({ success: false, error: 'Compañía y número son requeridos' });
        }
        const phoneNumber = await PhoneNumber.create(req.user.id, {
            company, phone_number, has_data, verified, verified_name, registered_pages, notes
        });
        res.json({ success: true, phoneNumber });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/:id', trackActivity, async (req, res) => {
    try {
        const phoneNumber = await PhoneNumber.update(req.params.id, req.user.id, req.body);
        if (!phoneNumber) return res.status(404).json({ success: false, error: 'Número no encontrado' });
        res.json({ success: true, phoneNumber });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const deleted = await PhoneNumber.delete(req.params.id, req.user.id);
        if (!deleted) return res.status(404).json({ success: false, error: 'Número no encontrado' });
        res.json({ success: true, message: 'Número eliminado' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;