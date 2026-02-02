// telegram-bot.js - VERSIÓN COMPLETA
const TelegramBot = require('node-telegram-bot-api');
const { pool } = require('./database');

// ========== CONFIGURACIÓN DEL BOT ==========
const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
    console.error('❌ ERROR: TELEGRAM_BOT_TOKEN no está configurado');
    console.error('❌ Obtén el token de @BotFather en Telegram');
    process.exit(1);
}

// CONFIGURAR EL BOT (¡ESTO TE FALTA!)
const bot = new TelegramBot(token, {
    polling: {
        interval: 300,
        autoStart: true,
        params: {
            timeout: 10,
            limit: 100
        }
    }
});

console.log('🤖 Bot de Telegram inicializado');
console.log('🤖 Token:', token.substring(0, 10) + '...'); // Solo muestra primeros 10 chars

// ========== MANEJAR ERRORES ==========
bot.on('polling_error', (error) => {
    console.error('❌ Error en polling de Telegram:', error.code, error.message);
    
    if (error.code === 'EFATAL') {
        console.error('❌ Error fatal, reiniciando en 5 segundos...');
        setTimeout(() => {
            console.log('🔄 Reiniciando bot...');
            bot.startPolling();
        }, 5000);
    }
});

bot.on('webhook_error', (error) => {
    console.error('❌ Error en webhook:', error);
});

// ========== DEBUG: VER TODOS LOS MENSAJES ==========
bot.on('message', (msg) => {
    console.log('📥 Mensaje recibido:', {
        from: msg.from?.username,
        text: msg.text?.substring(0, 50),
        chatId: msg.chat.id
    });
});

// ========== MANEJADOR DE /start (TU CÓDIGO) ==========
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username; // "BucleEterno8" (sin @)
    const firstName = msg.from.first_name || '';
    
    console.log(`🔔 /start recibido de: @${username} (Chat ID: ${chatId})`);
    
    try {
        // Verificar si ya existe en BD
        const userResult = await pool.query(
            'SELECT id, is_active FROM users WHERE username = $1',
            [username]
        );
        
        if (userResult.rows.length === 0) {
            // Usuario NO existe, crear registro INCOMPLETO (solo chat_id)
            await pool.query(
                `INSERT INTO users 
                 (username, telegram_username, telegram_chat_id, created_at)
                 VALUES ($1, $2, $3, NOW())
                 ON CONFLICT (username) 
                 DO UPDATE SET telegram_chat_id = $3, updated_at = NOW()`,
                [username, `@${username}`, chatId]
            );
            
            console.log(`✅ Chat ID guardado para @${username}: ${chatId}`);
            
        } else {
            // Usuario YA existe, actualizar chat_id
            await pool.query(
                `UPDATE users 
                 SET telegram_chat_id = $1, updated_at = NOW()
                 WHERE username = $2`,
                [chatId, username]
            );
            
            console.log(`✅ Chat ID actualizado para @${username}: ${chatId}`);
        }
        
        // Enviar mensaje de bienvenida
        await bot.sendMessage(
            chatId,
            `👋 ¡Hola ${firstName}! 👋 \n\n` +
            `He guardado tu Chat ID: <code>${chatId}</code>\n\n` +
            `Ahora puedes registrarte en la web siguiendo estos pasos:\n\n` +
            `1. Ve a la página:\n\n` +
            `                 ꧁⎝ 𓆩༺✧༻𓆪 ⎠꧂\n` +
            `https://ciber7erroristaschk.com/login.html\n` +
            `                 ꧁⎝ 𓆩༺✧༻𓆪 ⎠꧂ \n\n` +
            `2. Usa tu usuario: @${username}\n\n` +
            `3. Recibirás un código de verificación aquí. \n\n` +
            `4. Escríbelo en la página web, y comienza a livear y shippear ahora. \n\n` +
            `                 👾 ¡Te esperamos! 👾`,
            { parse_mode: 'HTML' }
        );
        
    } catch (error) {
        console.error('❌ Error en /start:', error);
        console.error('Detalles:', error.message);
        console.error('Stack:', error.stack);
        
        try {
            await bot.sendMessage(
                chatId,
                '❌ Hubo un error procesando tu solicitud. Intenta más tarde.\n\n' +
                'Error técnico: ' + error.message
            );
        } catch (sendError) {
            console.error('❌ No se pudo enviar mensaje de error:', sendError);
        }
    }
});

// ========== MANEJADOR DE /help ==========
bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    
    await bot.sendMessage(
        chatId,
        `🆘 *Ayuda - CiberTerroristasCHK*\n\n` +
        `*Comandos disponibles:*\n` +
        `/start - Vincular tu cuenta\n` +
        `/help - Ver este mensaje\n` +
        `/id - Ver tu Chat ID\n\n` +
        `*Problemas comunes:*\n` +
        `• Si no recibes códigos: Asegúrate de usar tu usuario correcto\n` +
        `• Error en registro: Verifica haber dado /start primero\n` +
        `• Soporte: Contacta al administrador\n\n` +
        `*Tu Chat ID:* ${chatId}`,
        { parse_mode: 'Markdown' }
    );
});

// ========== MANEJADOR DE /id ==========
bot.onText(/\/id/, async (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    
    await bot.sendMessage(
        chatId,
        `📋 *Tu información de Telegram*\n\n` +
        `👤 Usuario: @${username}\n` +
        `🔑 Chat ID: \`${chatId}\`\n\n` +
        `*Este Chat ID es único para ti.*\n` +
        `Se usa para enviarte códigos de verificación.`,
        { parse_mode: 'Markdown' }
    );
});

// ========== FUNCIÓN PARA ENVIAR CÓDIGOS ==========
async function sendVerificationCodeToUser(username, code) {
    try {
        // Buscar usuario en BD
        const userResult = await pool.query(
            `SELECT id, telegram_chat_id, telegram_username 
             FROM users 
             WHERE username = $1`,
            [username.replace('@', '')] // Quitar @ si existe
        );
        
        if (userResult.rows.length === 0) {
            console.error(`❌ Usuario ${username} no encontrado`);
            return { success: false, error: 'Usuario no encontrado' };
        }
        
        const user = userResult.rows[0];
        
        if (!user.telegram_chat_id) {
            console.error(`❌ Usuario ${username} no tiene chat_id (no ha dado /start)`);
            return { 
                success: false, 
                error: 'Usuario no ha iniciado chat con el bot. Debe escribir /start a @C1ber7errorist4sBot' 
            };
        }
        
        // Enviar código usando chat_id
        await bot.sendMessage(
            user.telegram_chat_id,
            `🔐 *Código de verificación - CiberTerroristasCHK*\n\n` +
            `Tu código es: *${code}*\n` +
            `⏰ Válido por 10 minutos.\n\n` +
            `⚠️ *No compartas este código con nadie.*`,
            { parse_mode: 'Markdown' }
        );
        
        console.log(`✅ Código ${code} enviado a @${username} (Chat ID: ${user.telegram_chat_id})`);
        
        return { success: true };
        
    } catch (error) {
        console.error('❌ Error enviando código:', error);
        return { success: false, error: error.message };
    }
}

// ========== EXPORTAR ==========
module.exports = { bot, sendVerificationCodeToUser };

console.log('✅ Bot configurado correctamente');