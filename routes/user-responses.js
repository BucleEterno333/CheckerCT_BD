const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const UserPageResponse = require('../models/UserPageResponse');

router.use(authenticate);

router.get('/', async (req, res) => {
    try {
        const { pageId } = req.query;
        const responses = await UserPageResponse.getUserResponses(req.user.id, pageId);
        res.json({ success: true, responses });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/', async (req, res) => {
    try {
        const { page_id, response_text } = req.body;
        if (!page_id || !response_text) {
            return res.status(400).json({ success: false, error: 'page_id y response_text requeridos' });
        }
        const response = await UserPageResponse.create(req.user.id, page_id, response_text);
        res.json({ success: true, response });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await UserPageResponse.delete(req.params.id, req.user.id);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;