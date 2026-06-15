const { pool } = require('../database');
const { bot } = require('../bot_telegram');
const GROUP_CHAT_ID = process.env.GROUP_CHAT_ID;

async function notifyAdminsAndGroups(message, parseMode = 'Markdown') {
    const adminsRes = await pool.query('SELECT telegram_id FROM users WHERE role = $1 AND telegram_id IS NOT NULL', ['admin']);
    for (const admin of adminsRes.rows) {
        if (admin.telegram_id) {
            try {
                await bot.sendMessage(admin.telegram_id, message, { parse_mode: parseMode });
            } catch (err) { console.error('Error notificando admin:', err.message); }
        }
    }
    if (GROUP_CHAT_ID) {
        try {
            await bot.sendMessage(GROUP_CHAT_ID, message, { parse_mode: parseMode });
        } catch (err) {
            console.error('Error notificando al grupo:', err.message);
        }
    }
}

module.exports = { notifyAdminsAndGroups };