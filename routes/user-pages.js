const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const UserPage = require('../models/UserPages');
const { sendSafeMessage } = require('../bot_telegram');
const { pool } = require('../database');


// Todas las rutas requieren autenticación
router.use(authenticate);

// Obtener todas las páginas personales del usuario
router.get('/', async (req, res) => {
    try {
        const pages = await UserPage.getUserPages(req.user.id);
        res.json({ success: true, pages });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Crear una nueva página personal (cualquier usuario)
router.post('/', async (req, res) => {
    try {
        const { name, login_type, verification, allow_card_association, has_3d, is_bineable, responses } = req.body;
        if (!name) return res.status(400).json({ success: false, error: 'Nombre de página requerido' });
        
        // Normalizar nombre
        const normalizedName = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
        
        // Verificar que no exista una página global con el mismo nombre (case-insensitive)
        const globalExists = await pool.query('SELECT id FROM pages WHERE LOWER(name) = LOWER($1)', [normalizedName]);
        if (globalExists.rows.length > 0) {
            return res.status(400).json({ success: false, error: 'Ya existe una página global con ese nombre. No puedes crear una personal duplicada.' });
        }
        
        // Verificar que el usuario no tenga ya una página personal con el mismo nombre (case-insensitive)
        const userExists = await pool.query(
            'SELECT id FROM user_pages WHERE user_id = $1 AND LOWER(name) = LOWER($2)',
            [req.user.id, normalizedName]
        );
        if (userExists.rows.length > 0) {
            return res.status(400).json({ success: false, error: 'Ya tienes una página personal con ese nombre.' });
        }
        
        const page = await UserPage.create(req.user.id, {
            name: normalizedName,
            login_type,
            verification,
            allow_card_association,
            has_3d,
            is_bineable,
            responses
        });
        
        // Insertar respuestas
        if (responses && responses.length) {
            for (const resp of responses) {
                if (resp.text) {
                    await pool.query(
                        `INSERT INTO page_responses (user_page_id, response_text, code, reason, solution, cloudinary_url)
                         VALUES ($1, $2, $3, $4, $5, $6)`,
                        [page.id, resp.text, resp.code || '', resp.reason || '', resp.solution || '', resp.cloudinary_url || '']
                    );
                }
            }
        }
        
        // Notificar a admin (opcional)
        // ... código de notificación telegram ...
        
        res.json({ success: true, page, message: 'Página personal creada exitosamente' });
    } catch (error) {
        console.error('Error creando página personal:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});
// Actualizar página personal
router.put('/:id', async (req, res) => {
    try {
        const pageId = parseInt(req.params.id);
        const { name, login_type, verification, allow_card_association, has_3d, is_bineable, responses } = req.body;
        const updated = await UserPage.update(pageId, req.user.id, {
            name, login_type, verification, allow_card_association, has_3d, is_bineable, responses
        });
        res.json({ success: true, page: updated });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Eliminar página personal
router.delete('/:id', async (req, res) => {
    try {
        const pageId = parseInt(req.params.id);
        const deleted = await UserPage.delete(pageId, req.user.id);
        if (!deleted) return res.status(404).json({ success: false, error: 'Página no encontrada' });
        res.json({ success: true, message: 'Página eliminada' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;