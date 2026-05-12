const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const Page = require('../models/Page');

router.use(authenticate);

// Obtener todas las páginas visibles para el usuario
router.get('/', async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin';
        const pages = await Page.getAll(req.user.id, isAdmin);
        res.json({ success: true, pages });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Solo admin puede crear/editar
router.post('/', requireRole('admin'), async (req, res) => {
    try {
        const { name, category } = req.body;
        if (!name) return res.status(400).json({ success: false, error: 'Nombre requerido' });
        const page = await Page.create(name, category, req.user.id);
        res.json({ success: true, page });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/:id', requireRole('admin'), async (req, res) => {
    try {
        const page = await Page.update(req.params.id, req.body);
        if (!page) return res.status(404).json({ success: false, error: 'Página no encontrada' });
        res.json({ success: true, page });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;