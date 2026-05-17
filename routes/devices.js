const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// Obtener todos los dispositivos del usuario
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM devices WHERE user_id = $1 ORDER BY created_at DESC',
            [req.user.id]
        );
        res.json({ success: true, devices: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Crear un nuevo dispositivo
router.post('/', async (req, res) => {
    const { custom_name, brand, model, color, has_mobile_data, os, notes } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO devices (user_id, custom_name, brand, model, color, has_mobile_data, os, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [req.user.id, custom_name, brand, model, color, has_mobile_data, os, notes]
        );
        res.json({ success: true, device: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Actualizar dispositivo
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { custom_name, brand, model, color, has_mobile_data, os, notes } = req.body;
    try {
        const result = await pool.query(
            `UPDATE devices SET
                custom_name = COALESCE($1, custom_name),
                brand = COALESCE($2, brand),
                model = COALESCE($3, model),
                color = COALESCE($4, color),
                has_mobile_data = COALESCE($5, has_mobile_data),
                os = COALESCE($6, os),
                notes = COALESCE($7, notes),
                updated_at = NOW()
             WHERE id = $8 AND user_id = $9 RETURNING *`,
            [custom_name, brand, model, color, has_mobile_data, os, notes, id, req.user.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Dispositivo no encontrado' });
        res.json({ success: true, device: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Eliminar dispositivo
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            'DELETE FROM devices WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, req.user.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Dispositivo no encontrado' });
        res.json({ success: true, message: 'Dispositivo eliminado' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;