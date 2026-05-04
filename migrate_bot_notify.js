// migrate_bot_notify.js
require('dotenv').config();
const { pool } = require('./database');
const TelegramBot = require('node-telegram-bot-api');

// Usa el token del bot ANTIGUO (el que quieres reemplazar)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN; // lo pones en .env temporalmente
if (!TELEGRAM_BOT_TOKEN) {
    console.error('❌ Falta TELEGRAM_BOT_TOKEN en .env');
    process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false }); // sin polling para solo enviar

const MENSAJE = `
⚠️ *AVISO IMPORTANTE*

Hemos actualizado nuestro bot. 
A partir de ahora, debes usar el nuevo bot: **@AstralCHK_Bot**

✅ Todos tus créditos y días se conservan.
✅ Solo necesitas enviar /start al nuevo bot para seguir operando.

Haz clic aquí para abrir el nuevo bot:  
👉 [@AstralCHK_Bot](https://t.me/AstralCHK_Bot)

Disculpa las molestias. ¡Gracias por entender!
`;

async function sendNotificationToAllUsers() {
    const client = await pool.connect();
    try {
        // Obtener todos los usuarios que tienen telegram_chat_id (han iniciado el bot)
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
                await bot.sendMessage(user.telegram_chat_id, MENSAJE, { parse_mode: 'Markdown', disable_web_page_preview: true });
                console.log(`✅ Mensaje enviado a ${user.username} (${user.telegram_chat_id})`);
                success++;
                // Pequeña pausa para no saturar la API (0.1 segundos)
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