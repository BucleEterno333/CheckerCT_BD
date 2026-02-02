// create-telegram-bot.js
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
    console.error('❌ TELEGRAM_BOT_TOKEN no configurado en .env');
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

console.log('🤖 Bot iniciado...');

// Comando /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    
    bot.sendMessage(
        chatId,
        `👋 *¡Hola ${username}!*\n\n` +
        `Soy el bot de verificación de *CiberTerroristasCHK*.\n\n` +
        `*Comandos disponibles:*\n` +
        `▫️ /start - Muestra este mensaje\n` +
        `▫️ /help - Ayuda y soporte\n` +
        `▫️ /code - Solicitar código de verificación\n\n` +
        `⚠️ *Importante:*\n` +
        `Este bot solo envía códigos de verificación para la plataforma.`,
        { parse_mode: 'Markdown' }
    );
});

// Comando /help
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    
    bot.sendMessage(
        chatId,
        `🆘 *Ayuda - CiberTerroristasCHK*\n\n` +
        `*Problemas comunes:*\n` +
        `▫️ *No recibí el código* - Asegúrate de usar el mismo usuario de Telegram\n` +
        `▫️ *Código expirado* - Solicita uno nuevo en la web\n` +
        `▫️ *Código incorrecto* - Verifica que sea exactamente el mismo\n\n` +
        `*Contacto de soporte:*\n` +
        `Para problemas técnicos, contacta al administrador.`,
        { parse_mode: 'Markdown' }
    );
});

// Comando /code (solo para debug)
bot.onText(/\/code/, (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    
    // En producción, esto debería verificar en la base de datos
    bot.sendMessage(
        chatId,
        `🔐 *Solicitud de código*\n\n` +
        `Usuario: @${username}\n\n` +
        `Para obtener un código de verificación, debes:\n` +
        `1. Registrarte en la web\n` +
        `2. Usar exactamente este usuario (@${username})\n` +
        `3. El código se enviará automáticamente\n\n` +
        `Si ya te registraste y no recibiste el código, intenta registrarte nuevamente.`,
        { parse_mode: 'Markdown' }
    );
});

// Manejar mensajes privados
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    
    // Si no es un comando, ignorar
    if (!msg.text.startsWith('/')) {
        bot.sendMessage(
            chatId,
            `⚠️ Solo respondo a comandos.\n` +
            `Usa /help para ver los comandos disponibles.`
        );
    }
});

// Manejar errores
bot.on('polling_error', (error) => {
    console.error('❌ Error en polling:', error);
});

console.log('✅ Bot listo para recibir mensajes...');