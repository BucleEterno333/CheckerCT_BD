const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const UserAccount = require('../models/UserAccount');

router.use(authenticate);

router.get('/', async (req, res) => {
    try {
        const accounts = await UserAccount.getUserAccounts(req.user.id);
        res.json({ success: true, accounts });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/', async (req, res) => {
    try {
        const account = await UserAccount.create(req.user.id, req.body);
        res.json({ success: true, account });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

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