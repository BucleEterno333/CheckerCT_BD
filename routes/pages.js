const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const Page = require('../models/Page');
const { pool } = require('../database'); // ← importar pool


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

router.post('/', requireRole('admin'), async (req, res) => {
    try {
        const { name, login_type, verification, allow_card_association, has_3d, is_bineable, responses } = req.body;
        if (!name) return res.status(400).json({ success: false, error: 'Nombre de página requerido' });
        
        // Normalizar: primera letra mayúscula, resto minúscula
        const normalizedName = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
        
        // Verificar si ya existe (case-insensitive)
        const existing = await pool.query('SELECT id FROM pages WHERE LOWER(name) = LOWER($1)', [normalizedName]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ success: false, error: 'Ya existe una página con ese nombre (sin distinción de mayúsculas)' });
        }
        
        const page = await Page.create(normalizedName, login_type, verification, allow_card_association, has_3d, is_bineable, req.user.id);
        
        // Insertar respuestas (si las hay) - asumiendo que tienes una función en Page o un modelo aparte
        if (responses && responses.length) {
            for (const resp of responses) {
                if (resp.text) {
                    await pool.query(
                        `INSERT INTO page_responses (page_id, response_text, code, reason, solution, cloudinary_url)
                         VALUES ($1, $2, $3, $4, $5, $6)`,
                        [page.id, resp.text, resp.code || '', resp.reason || '', resp.solution || '', resp.cloudinary_url || '']
                    );
                }
            }
        }
        
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