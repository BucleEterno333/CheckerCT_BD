const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const UserAccount = require('../models/UserAccount');
const { pool } = require('../database');

router.use(authenticate);

// Obtener todas las cuentas del usuario
router.get('/', async (req, res) => {
    try {
        const accounts = await UserAccount.getUserAccounts(req.user.id);
        res.json({ success: true, accounts });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Crear una nueva cuenta
router.post('/', async (req, res) => {
    try {
        const account = await UserAccount.create(req.user.id, req.body);
        // Si se enviaron tarjetas asociadas, guardarlas
        if (req.body.cards && Array.isArray(req.body.cards)) {
            for (const card of req.body.cards) {
                if (card.number && card.expiry && card.cvv) {
                    await pool.query(
                        `INSERT INTO account_cards (account_id, card_number, expiry_month, expiry_year, cvv, description)
                         VALUES ($1, $2, $3, $4, $5, $6)`,
                        [account.id, card.number, card.expiry_month, card.expiry_year, card.cvv, card.description || '']
                    );
                }
            }
        }
        res.json({ success: true, account });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Actualizar cuenta
router.put('/:id', async (req, res) => {
    try {
        const accountId = parseInt(req.params.id);
        const updated = await UserAccount.update(accountId, req.user.id, req.body);
        // Actualizar tarjetas: eliminar las existentes y agregar las nuevas
        if (req.body.cards) {
            await pool.query('DELETE FROM account_cards WHERE account_id = $1', [accountId]);
            for (const card of req.body.cards) {
                if (card.number && card.expiry && card.cvv) {
                    await pool.query(
                        `INSERT INTO account_cards (account_id, card_number, expiry_month, expiry_year, cvv, description)
                         VALUES ($1, $2, $3, $4, $5, $6)`,
                        [accountId, card.number, card.expiry_month, card.expiry_year, card.cvv, card.description || '']
                    );
                }
            }
        }
        res.json({ success: true, account: updated });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Eliminar cuenta
router.delete('/:id', async (req, res) => {
    try {
        const accountId = parseInt(req.params.id);
        // Eliminar tarjetas asociadas primero
        await pool.query('DELETE FROM account_cards WHERE account_id = $1', [accountId]);
        const deleted = await UserAccount.delete(accountId, req.user.id);
        if (!deleted) return res.status(404).json({ success: false, error: 'Cuenta no encontrada' });
        res.json({ success: true, message: 'Cuenta eliminada' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Obtener cuentas por número de teléfono
router.get('/by-number/:numberId', async (req, res) => {
    try {
        const numberId = parseInt(req.params.numberId);
        const result = await pool.query(
            `SELECT a.* FROM accounts a
             JOIN account_numbers an ON a.id = an.account_id
             WHERE an.number_id = $1 AND a.user_id = $2`,
            [numberId, req.user.id]
        );
        res.json({ success: true, accounts: result.rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Obtener cuentas por correo electrónico
router.get('/by-email/:emailId', async (req, res) => {
    try {
        const emailId = parseInt(req.params.emailId);
        const result = await pool.query(
            `SELECT a.* FROM accounts a
             JOIN account_emails ae ON a.id = ae.account_id
             WHERE ae.email_id = $1 AND a.user_id = $2`,
            [emailId, req.user.id]
        );
        res.json({ success: true, accounts: result.rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Asociar tarjeta a cuenta (para acciones)
router.post('/:accountId/associate/:liveId', async (req, res) => {
    try {
        await UserAccount.associateCard(req.params.accountId, req.params.liveId);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/:accountId/disassociate/:liveId', async (req, res) => {
    try {
        await UserAccount.removeCard(req.params.accountId, req.params.liveId);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;