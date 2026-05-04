// migrate_bot_notify.js - VERSIÓN CORREGIDA (sin Markdown)
require('dotenv').config();
const { pool } = require('./database');
const TelegramBot = require('node-telegram-bot-api');

const OLD_BOT_TOKEN = process.env.OLD_BOT_TOKEN;
if (!OLD_BOT_TOKEN) {
    console.error('❌ Falta OLD_BOT_TOKEN en .env');
    process.exit(1);
}

const bot = new TelegramBot(OLD_BOT_TOKEN, { polling: false });

const MENSAJE = `⚠️ AVISO IMPORTANTE

Hemos actualizado nuestro bot.
A partir de ahora, debes usar el nuevo bot: @AstralCHK_Bot

✅ Sino te has registrado en la web, hazlo para obtener una cookie gratis.
✅ Si ya te habías registrado, solo necesitas enviar /start al nuevo bot para seguirlo usando, y seguir recibiendo las lives y cookies obtenidas en web.

Abre el nuevo bot: https://t.me/AstralCHK_Bot

Disculpa las molestias. ¡Gracias por entender!`;

async function sendNotificationToAllUsers() {
    const client = await pool.connect();
    try {
        const res = await client.query(`
            SELECT id, username, telegram_chat_id 
            FROM users 
            WHERE telegram_chat_id IS NOT NULL
        `);
        
        console.log(`📋 Enviando mensaje a ${res.rows.length} usuarios...`);
        
        let success = 0;
        let fail = 0;
        
        for (const user of res.rows) {
            try {
                // Enviar SIN parse_mode (texto plano)
                await bot.sendMessage(user.telegram_chat_id, MENSAJE, { disable_web_page_preview: true });
                console.log(`✅ Mensaje enviado a ${user.username} (${user.telegram_chat_id})`);
                success++;
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (err) {
                console.error(`❌ Error al enviar a ${user.username} (${user.telegram_chat_id}): ${err.message}`);
                fail++;
            }
        }
        
        console.log(`\n📊 Resumen: Enviados: ${success}, Fallidos: ${fail}`);
    } catch (error) {
        console.error('Error en la consulta:', error);
    } finally {
        client.release();
        process.exit(0);
    }
}

sendNotificationToAllUsers();