// ============================================
// BOT DE TELEGRAM - VERSIÓN CORREGIDA Y OPTIMIZADA
// ============================================

const TelegramBot = require('node-telegram-bot-api');
const { Pool } = require('pg');
const cron = require('node-cron');

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

bot.getMe().then(me => {
    bot.botInfo = me;
    console.log(`✅ Bot identificado como: @${me.username}`);
}).catch(err => console.error('❌ Error obteniendo info del bot:', err));

// ========== SEPARADORES BONITOS ==========
const SEPARATORS = [
    '﹌﹌﹌﹌﹌﹌﹌﹌﹌﹌﹌﹌',
    '𓆩༺✧༻‧༺✧༻‧༺✧༻‧༺✧༻‧',
    '₊‿︵‿︵‿︵‿︵‿︵‿︵',
    '⋆.ೃ࿔*:･⋆.ೃ࿔*:･⋆.ೃ࿔*:･⋆.',
];

// Diccionario local de bins por banco
const bankBins = {
    bbva: ['415231', '481515', '481514', '481516', '481283'],
    bancomer: ['415231', '481515', '481514', '481516', '481283'],
    bancoppel: ['426807', '416916'],
    santander: ['557910', '557907'],
    banamex: ['549949', '528843', '554625'],
    citibanamex: ['549949', '528843', '554625'],
    hsbc: ['491089', '421316'],
    azteca: ['402766'],
    banorte: ['418914', '493173', '493158', '491566']
};



// ========== FUNCIONES AUXILIARES ==========
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

async function notifyAdminsAndGroups(message, parseMode = 'Markdown') {
    // Notificar a administradores
    const adminsRes = await pool.query('SELECT telegram_id FROM users WHERE role = $1 AND telegram_id IS NOT NULL', ['admin']);
    for (const admin of adminsRes.rows) {
        if (admin.telegram_id) {
            try {
                await bot.sendMessage(admin.telegram_id, message, { parse_mode: parseMode });
            } catch (err) { console.error('Error notificando admin:', err.message); }
        }
    }
    // Notificar al grupo principal
    const GROUP_CHAT_ID = process.env.GROUP_CHAT_ID;
    if (GROUP_CHAT_ID) {
        try {
            await bot.sendMessage(GROUP_CHAT_ID, message, { parse_mode: parseMode });
        } catch (err) {
            console.error('Error notificando al grupo:', err.message);
            if (err.message && err.message.includes('upgraded to a supergroup')) {
                // Obtener el nuevo ID del grupo si es posible
                try {
                    const chat = await bot.getChat(GROUP_CHAT_ID);
                    const newId = chat.id;
                    const errorMsg = `⚠️ El grupo ha sido actualizado a supergrupo.\nAntiguo ID: ${GROUP_CHAT_ID}\nNuevo ID: ${newId}\nActualiza la variable GROUP_CHAT_ID en el entorno y reinicia el bot.`;
                    for (const admin of adminsRes.rows) {
                        if (admin.telegram_id) await bot.sendMessage(admin.telegram_id, errorMsg, { parse_mode: 'Markdown' }).catch(() => {});
                    }
                } catch (e) {
                    console.error('No se pudo obtener el nuevo ID del grupo:', e.message);
                }
            }
        }
    }
}
function limpiarTarjetas(textoSucio) {
    let texto = textoSucio.replace(/\r\n/g, '\n').replace(/\n+/g, '\n').trim();
    const lineas = texto.split('\n');
    const tarjetas = [];
    for (const linea of lineas) {
        let match = linea.match(/(\d{16})\s*[|│]\s*(\d{2})\s*[|│]\s*(\d{4})\s*[|│]\s*(\d{3})/);
        if (match) {
            tarjetas.push(`${match[1]}|${match[2]}|${match[3]}|${match[4]}`);
            continue;
        }
        match = linea.match(/(\d{16})\s+(\d{2})\s+(\d{4})\s+(\d{3})/);
        if (match) tarjetas.push(`${match[1]}|${match[2]}|${match[3]}|${match[4]}`);
    }
    return [...new Set(tarjetas)];
}

function normalizarExtra(texto) {
    let temp = texto.trim().replace(/\s*[\/-]\s*/g, '|').replace(/\s*\|\s*/g, '|');
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

async function getPatternsFromBin(chatId, bin) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000);
    const response = await fetch(`${API_EXTRAPOLADOR_URL}/api/search-bin`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bin }), signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data.success || !data.data || data.data.length === 0) throw new Error('No se encontraron tarjetas para ese BIN');
    const patrones = {};
    for (const tarjeta of data.data) {
        const partes = tarjeta.split('|');
        if (partes.length < 3) continue;
        const numero = partes[0];
        if (numero.length !== 16) continue;
        const prefix = numero.slice(0, 12);
        const mes = partes[1];
        const año = partes[2];
        const clave = `${prefix}xxxx|${mes}|${año}`;
        patrones[clave] = (patrones[clave] || 0) + 1;
    }
    if (Object.keys(patrones).length === 0) throw new Error('No se extrajeron patrones');
    const ordenados = Object.entries(patrones).map(([p, c]) => ({ patron: p, count: c })).sort((a, b) => b.count - a.count);
    return ordenados.map(p => {
        const [prefijo, mes, año] = p.patron.split('|');
        return `${prefijo}|${mes}|${año}|rnd`;
    });
}

async function getUserRoleFromDB(telegramId) {
    const res = await pool.query('SELECT role FROM users WHERE telegram_id = $1', [telegramId]);
    return res.rows[0]?.role || 'user';
}

async function findUserByUsernameOrId(identifier, requesterRole) {
    if (identifier.startsWith('@')) identifier = identifier.substring(1);
    const res = await pool.query(
        `SELECT id, username, display_name, credits, days_remaining, role, is_active, created_at, telegram_username, telegram_id
         FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(telegram_username) = LOWER($1)`,
        [identifier]
    );
    if (res.rows.length === 0) throw new Error(`Usuario "${identifier}" no encontrado`);
    const user = res.rows[0];
    if (requesterRole === 'seller' && user.role !== 'user') throw new Error('No tienes permiso para ver este usuario');
    return user;
}

async function deductCredits(telegramId, amount = 4) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        const response = await fetch(`${INTERNAL_API_URL}/user/bot/use-credits`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegram_id: telegramId, amount, bot_key: BOT_API_KEY }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        const data = await response.json();
        if (data.success) return { newCredits: data.newCredits, creditsZero: data.credits_zero || false, role: data.role };
        return null;
    } catch (error) {
        console.error('Error en deductCredits:', error);
        return null;
    }
}

async function kickUserFromGroup(telegramUserId) {
    if (!GROUP_CHAT_ID) return false;
    try {
        await bot.telegram.kickChatMember(GROUP_CHAT_ID, telegramUserId);
        console.log(`✅ Usuario ${telegramUserId} expulsado`);
        return true;
    } catch (error) {
        console.error(`❌ Error expulsando a ${telegramUserId}:`, error.message);
        return false;
    }
}

async function checkAndKickIfNoDaysOrCredits(telegramId, chatId, requiredCredits = 0) {
    const user = await pool.query('SELECT credits, days_remaining FROM users WHERE telegram_id = $1', [telegramId]);
    if (!user.rows.length) {
        await sendSafeMessage(chatId, '❌ Usa /start primero.');
        return false;
    }
    const { credits, days_remaining } = user.rows[0];
    if (days_remaining <= 0) {
        if (GROUP_CHAT_ID) await bot.telegram.kickChatMember(GROUP_CHAT_ID, telegramId).catch(() => {});
        await sendSafeMessage(chatId, '❌ Tus días han expirado.');
        return false;
    }
    if (requiredCredits > 0 && credits < requiredCredits) {
        await sendSafeMessage(chatId, `❌ Créditos insuficientes. Necesitas: ${requiredCredits}.`);
        return false;
    }
    return true;
}

async function updateUserCookie(telegramId, cookie) {
    await pool.query(`UPDATE users SET cookie = $1 WHERE telegram_id = $2`, [cookie, telegramId]);
}

async function checkAndUpdateTelegramProfile(telegramId, userId, currentUsername, currentFullName) {
    const res = await pool.query('SELECT telegram_username, display_name FROM users WHERE id = $1', [userId]);
    if (res.rows.length === 0) return null;
    const saved = res.rows[0];
    const changes = {};
    if (saved.telegram_username !== currentUsername) changes.username = { old: saved.telegram_username, new: currentUsername };
    if (saved.display_name !== currentFullName) changes.display_name = { old: saved.display_name, new: currentFullName };
    if (Object.keys(changes).length > 0) {
        await pool.query(`UPDATE users SET telegram_username = $1, display_name = $2, updated_at = NOW() WHERE id = $3`,
            [currentUsername, currentFullName, userId]);
        await pool.query(`INSERT INTO profile_change_logs (user_id, old_username, new_username, old_display_name, new_display_name, detected_at)
            VALUES ($1, $2, $3, $4, $5, NOW())`, [userId, saved.telegram_username, currentUsername, saved.display_name, currentFullName]);
        const userInfo = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
        const username = userInfo.rows[0]?.username || userId;
        const message = `⚠️ *CAMBIO DE PERFIL DETECTADO* ⚠️\n\n👤 Usuario: ${username}\n🆔 ID: ${userId}\n📱 Telegram ID: ${telegramId}\n\n📛 Nombre: \`${saved.display_name}\` → \`${currentFullName}\`\n👥 Username: @${saved.telegram_username || ''} → @${currentUsername || ''}\n\n🕒 Detectado automáticamente.`;
        await notifyAdminsAndGroups(message);
    }
    return changes;
}

// ========== GESTIÓN DE ESTADOS INTERACTIVOS ==========
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

// ========== FUNCIONES PARA COMANDOS ==========
async function handleGenCookieCommand(chatId, telegramId, country) {
    if (!await checkAndKickIfNoDaysOrCredits(telegramId, chatId, 4)) return;
    const paises = ['MX','US','CA','UK','DE','FR','IT','ES','JP','AU','IN'];
    if (!paises.includes(country)) { await sendSafeMessage(chatId, '❌ País inválido.'); return; }
    await sendSafeMessage(chatId, `🔄 Generando cookie para ${country}...`);
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1200000);
        const response = await fetch(`${API_GENCOOKIE_URL}/generate`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ country, add_address: true }), signal: controller.signal
        });
        clearTimeout(timeoutId);
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Error');
        const { phone, password, cookie_string, country: ctry } = data.data;
        await updateUserCookie(telegramId, cookie_string);
        const creditResult = await deductCredits(telegramId, 4);
        await pool.query('UPDATE users SET cookies_generated = cookies_generated + 1 WHERE telegram_id = $1', [telegramId]);
        let msgText = `🍪 *Cookie ${ctry}*\n📞 Tel: \`${phone}\`\n🔑 Pass: \`${password}\`\n🍪 *Cookie string:*\n\`\`\`\n${cookie_string}\n\`\`\``;
        if (creditResult) msgText += `\n💰 Créditos restantes: ${creditResult.newCredits}`;
        if (creditResult?.creditsZero) await kickUserFromGroup(telegramId);
        await sendSafeMessage(chatId, msgText, { parse_mode: 'Markdown' });
    } catch (error) {
        await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
    }
}

async function procesarExtraConCantidad(chatId, telegramId, extra, cantidad) {
    await sendSafeMessage(chatId, `🃏 Generando ${cantidad} tarjetas desde el extra...`);
    const todasLasTarjetas = generarTarjetasDesdePatron(extra, cantidad);
    const total = todasLasTarjetas.length;
    if (total === 0) throw new Error('No se generaron tarjetas');

    const generarCookieAsync = async () => {
        const response = await fetch(`${API_GENCOOKIE_URL}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ country: 'MX', add_address: true }) });
        const data = await response.json();
        if (!data.success) throw new Error('Error generando cookie');
        const creditResult = await deductCredits(telegramId, 4);
        if (creditResult?.creditsZero) await kickUserFromGroup(telegramId);
        await pool.query('UPDATE users SET cookies_generated = cookies_generated + 1 WHERE telegram_id = $1', [telegramId]);
        return data.data.cookie_string;
    };

    const verificarTarjetaConCookie = async (card, cookie) => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120000);
            const resp = await fetch(API_AMAZON_CHECK_URL, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ card, cookies: cookie }), signal: controller.signal
            });
            clearTimeout(timeoutId);
            const data = await resp.json();
            const isBanned = data.message && (
                data.message.toLowerCase().includes('cookie expirada') ||
                data.message.toLowerCase().includes('inicia sesión') ||
                data.message.toLowerCase().includes('cuenta baneada')
            );
            return { status: data.status, isBanned, message: data.message };
        } catch (err) {
            return { status: 'ERROR', isBanned: false, message: err.message };
        }
    };

    let stats = { lives: 0, deads: 0, errors: 0, cookiesUsadas: 0 };
    let currentCookie = await generarCookieAsync();
    let nextCookiePromise = generarCookieAsync().catch(err => { console.error(err); return null; });
    stats.cookiesUsadas++;
    let progressMsg = await sendSafeMessage(chatId, `🔄 Verificando 0/${total}... Cookies: 1`);
    for (let i = 0; i < total; i++) {
        const res = await verificarTarjetaConCookie(todasLasTarjetas[i], currentCookie);
        if (res.status === 'LIVE') stats.lives++;
        else if (res.status === 'DEAD') stats.deads++;
        else stats.errors++;
        if (res.isBanned) {
            if (nextCookiePromise) currentCookie = await nextCookiePromise;
            else currentCookie = await generarCookieAsync();
            nextCookiePromise = generarCookieAsync().catch(err => { console.error(err); return null; });
            stats.cookiesUsadas++;
        }
        if ((i+1) % 10 === 0 || res.isBanned) {
            try {
                await bot.editMessageText(`🔄 ${i+1}/${total}\n💚 ${stats.lives} ❌ ${stats.deads} ⚠️ ${stats.errors}\n🍪 ${stats.cookiesUsadas}`, { chat_id: chatId, message_id: progressMsg.message_id });
            } catch(e) {}
        }
        await new Promise(r => setTimeout(r, 800));
    }
    if (nextCookiePromise) nextCookiePromise.catch(() => {});
    const resumen = `📊 *RESULTADO FINAL*\n🔹 Extra: \`${extra}\`\n🔹 Tarjetas: ${total}\n🔹 Créditos: ${stats.cookiesUsadas * 4}\n💚 LIVE: ${stats.lives} | ❌ DEAD: ${stats.deads} | ⚠️ ERROR: ${stats.errors}\n🍪 Cookies: ${stats.cookiesUsadas}`;
    await sendSafeMessage(chatId, resumen, { parse_mode: 'Markdown' });
}

// ========== COMANDOS ==========

bot.onText(/^[\/\.]start/, async (msg) => {
    const chatId = msg.chat.id;
    const from = msg.from;
    const telegramId = from.id;
    const username = from.username || telegramId.toString();
    const fullName = (from.first_name || '') + (from.last_name ? ' ' + from.last_name : '');
    const chatType = msg.chat.type;
    try {
        const existing = await pool.query('SELECT credits, days_remaining FROM users WHERE telegram_id = $1', [telegramId]);
        const isNew = existing.rows.length === 0;
        // upsertUser
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(`UPDATE users SET telegram_chat_id = NULL WHERE telegram_chat_id = $1`, [chatId]);
            const userExists = await client.query('SELECT id FROM users WHERE telegram_id = $1', [telegramId]);
            if (userExists.rows.length > 0) {
                await client.query(`UPDATE users SET telegram_chat_id = $1, telegram_username = $2, display_name = $3, updated_at = NOW() WHERE telegram_id = $4`, [chatId, username, fullName, telegramId]);
            } else {
                const byUsername = await client.query('SELECT id FROM users WHERE username = $1', [username]);
                if (byUsername.rows.length > 0) {
                    await client.query(`UPDATE users SET telegram_id = $1, telegram_chat_id = $2, telegram_username = $3, display_name = $4, updated_at = NOW() WHERE username = $5`, [telegramId, chatId, username, fullName, username]);
                } else {
                    await client.query(`INSERT INTO users (telegram_id, telegram_username, telegram_chat_id, username, display_name, created_at) VALUES ($1, $2, $3, $4, $5, NOW())`, [telegramId, username, chatId, username, fullName]);
                }
            }
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error en upsertUser:', error);
        } finally {
            client.release();
        }
        if (isNew) {
            await sendSafeMessage(chatId, `👋 ¡Hola ${fullName}! 👋\n\nHe guardado tu Chat ID: <code>${telegramId}</code>\n\nRegístrate en la web: https://astralchk.com/login.html con usuario @${username}`, { parse_mode: 'HTML' });
        } else {
            await sendSafeMessage(chatId, `👋 ¡Hola ${fullName}!\n💰 Créditos: ${existing.rows[0].credits}\n📅 Días: ${existing.rows[0].days_remaining}\n\nUsa /menu para ver comandos.`, { parse_mode: 'Markdown' });
        }
    } catch (error) {
        console.error(error);
        await sendSafeMessage(chatId, '❌ Error interno.');
    }
});

// ========== COMANDOS DE ADMINISTRACIÓN ==========
const planConfig = {
    '20': { credits: 20, days: 3 },
    '60': { credits: 60, days: 7 },
    '120': { credits: 120, days: 15 },
    '200': { credits: 200, days: 30 }
};

bot.onText(/^[\/\.]setcredits(?:\s+([^\s]+)\s+(\d+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const requesterTelegramId = msg.from.id;
    let target = match[1];
    let amount = match[2];

    if (!target && msg.reply_to_message?.text) {
        const parts = msg.reply_to_message.text.trim().split(/\s+/);
        if (parts.length >= 2) { target = parts[0]; amount = parts[1]; }
        else { target = parts[0]; amount = null; }
    }
    if (target?.startsWith('@')) target = target.substring(1);
    if (target && /^\d+$/.test(target) && parseInt(target) < 10000) target = null;

    const adminData = await pool.query('SELECT id, role FROM users WHERE telegram_id = $1', [requesterTelegramId]);
    if (adminData.rows.length === 0) return sendSafeMessage(chatId, '❌ No estás registrado. Usa /start.');
    const adminId = adminData.rows[0].id;
    const role = adminData.rows[0].role;
    if (role !== 'admin') return sendSafeMessage(chatId, '❌ Solo administradores pueden usar este comando.');

    if (!target || !amount) {
        setUserState(requesterTelegramId, { step: 'awaiting_setcredits' });
        return sendSafeMessage(chatId, '💳 Envía @usuario|id y la cantidad de créditos (ej. @usuario 100):');
    }

    try {
        const user = await findUserByUsernameOrId(target, role);
        const newCredits = parseInt(amount);
        if (isNaN(newCredits) || newCredits < 0) throw new Error('Cantidad inválida');
        const oldCredits = user.credits;
        await pool.query('UPDATE users SET credits = $1, updated_at = NOW() WHERE id = $2', [newCredits, user.id]);
        await pool.query(
            `INSERT INTO credit_transactions (from_user_id, to_user_id, transaction_type, amount, previous_amount, new_amount, reason, created_at)
             VALUES ($1, $2, 'credits', $3, $4, $5, $6, NOW())`,
            [adminId, user.id, newCredits - oldCredits, oldCredits, newCredits, 'Ajuste por bot']
        );
        await sendSafeMessage(chatId, `✅ Se establecieron ${newCredits} créditos para ${user.username}.`);
    } catch (error) {
        await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
    }
    clearUserState(requesterTelegramId);
});

bot.onText(/^[\/\.]setdays(?:\s+([^\s]+)\s+(\d+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const requesterTelegramId = msg.from.id;
    let target = match[1];
    let days = match[2];

    if (!target && msg.reply_to_message?.text) {
        const parts = msg.reply_to_message.text.trim().split(/\s+/);
        if (parts.length >= 2) { target = parts[0]; days = parts[1]; }
        else { target = parts[0]; days = null; }
    }
    if (target?.startsWith('@')) target = target.substring(1);
    if (target && /^\d+$/.test(target) && parseInt(target) < 10000) target = null;

    const adminData = await pool.query('SELECT id, role FROM users WHERE telegram_id = $1', [requesterTelegramId]);
    if (adminData.rows.length === 0) return sendSafeMessage(chatId, '❌ No estás registrado. Usa /start.');
    const adminId = adminData.rows[0].id;
    const role = adminData.rows[0].role;
    if (role !== 'admin') return sendSafeMessage(chatId, '❌ Solo administradores pueden usar este comando.');

    if (!target || !days) {
        setUserState(requesterTelegramId, { step: 'awaiting_setdays' });
        return sendSafeMessage(chatId, '📅 Envía @usuario|id y la cantidad de días (ej. @usuario 15):');
    }

    try {
        const user = await findUserByUsernameOrId(target, role);
        const newDays = parseInt(days);
        if (isNaN(newDays) || newDays < 0) throw new Error('Cantidad inválida');
        const oldDays = user.days_remaining;
        await pool.query('UPDATE users SET days_remaining = $1, updated_at = NOW() WHERE id = $2', [newDays, user.id]);
        await pool.query(
            `INSERT INTO credit_transactions (from_user_id, to_user_id, transaction_type, amount, previous_amount, new_amount, reason, created_at)
             VALUES ($1, $2, 'days', $3, $4, $5, $6, NOW())`,
            [adminId, user.id, newDays - oldDays, oldDays, newDays, 'Ajuste por bot']
        );
        await sendSafeMessage(chatId, `✅ Se establecieron ${newDays} días para ${user.username}.`);
    } catch (error) {
        await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
    }
    clearUserState(requesterTelegramId);
});

bot.onText(/^[\/\.]setplan(20|60|120|200)(?:\s+([^\s]+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const requesterTelegramId = msg.from.id;
    const plan = match[1];
    let target = match[2];

    if (!target && msg.reply_to_message?.text) target = msg.reply_to_message.text.trim();
    if (target?.startsWith('@')) target = target.substring(1);

    const adminData = await pool.query('SELECT id, role FROM users WHERE telegram_id = $1', [requesterTelegramId]);
    if (adminData.rows.length === 0) return sendSafeMessage(chatId, '❌ No estás registrado. Usa /start.');
    const adminId = adminData.rows[0].id;
    const role = adminData.rows[0].role;
    if (role !== 'admin' && role !== 'seller') return sendSafeMessage(chatId, '❌ No tienes permiso.');

    if (!target) {
        setUserState(requesterTelegramId, { step: `awaiting_setplan_${plan}` });
        return sendSafeMessage(chatId, `💎 Envía @usuario|id para asignar el plan ${plan} (${planConfig[plan].credits} créditos / ${planConfig[plan].days} días):`);
    }

    try {
        const user = await findUserByUsernameOrId(target, role);
        const { credits, days } = planConfig[plan];
        const oldCredits = user.credits;
        const oldDays = user.days_remaining;
        await pool.query('UPDATE users SET credits = $1, days_remaining = $2, updated_at = NOW() WHERE id = $3', [credits, days, user.id]);
        await pool.query(
            `INSERT INTO credit_transactions (from_user_id, to_user_id, transaction_type, amount, previous_amount, new_amount, reason, created_at)
             VALUES ($1, $2, 'credits', $3, $4, $5, $6, NOW())`,
            [adminId, user.id, credits - oldCredits, oldCredits, credits, `Plan ${plan}`]
        );
        await pool.query(
            `INSERT INTO credit_transactions (from_user_id, to_user_id, transaction_type, amount, previous_amount, new_amount, reason, created_at)
             VALUES ($1, $2, 'days', $3, $4, $5, $6, NOW())`,
            [adminId, user.id, days - oldDays, oldDays, days, `Plan ${plan}`]
        );
        await sendSafeMessage(chatId, `✅ Plan ${plan} asignado a ${user.username}: ${credits} créditos y ${days} días.`);
    } catch (error) {
        await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
    }
    clearUserState(requesterTelegramId);
});

bot.onText(/^[\/\.]setadmin(?:\s+([^\s]+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const requesterTelegramId = msg.from.id;
    let target = match[1];
    if (!target && msg.reply_to_message?.text) target = msg.reply_to_message.text.trim();
    if (target?.startsWith('@')) target = target.substring(1);

    const adminData = await pool.query('SELECT id, role FROM users WHERE telegram_id = $1', [requesterTelegramId]);
    if (adminData.rows.length === 0) return sendSafeMessage(chatId, '❌ No estás registrado. Usa /start.');
    const adminId = adminData.rows[0].id;
    const role = adminData.rows[0].role;
    if (role !== 'admin') return sendSafeMessage(chatId, '❌ Solo administradores pueden hacer admins.');

    if (!target) {
        setUserState(requesterTelegramId, { step: 'awaiting_setadmin' });
        return sendSafeMessage(chatId, '👑 Envía @usuario o ID para hacerlo administrador:');
    }

    try {
        const user = await findUserByUsernameOrId(target, role);
        if (user.role === 'admin') return sendSafeMessage(chatId, `⚠️ ${user.username} ya es admin.`);
        await pool.query('UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2', ['admin', user.id]);
        await pool.query(`INSERT INTO credit_transactions (to_user_id, transaction_type, old_role, new_role, reason, created_at)
                          VALUES ($1, 'role_change', $2, 'admin', 'Ascendido por bot', NOW())`, [user.id, user.role]);
        await notifyAdminsAndGroups(`👑 *NUEVO ADMINISTRADOR*\n👤 ${user.username} ahora es ADMIN.\n👮‍♂️ Por: ${msg.from.username || msg.from.id}`);
        await sendSafeMessage(chatId, `✅ ${user.username} ahora es ADMINISTRADOR.`);
    } catch (error) {
        await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
    }
    clearUserState(requesterTelegramId);
});

bot.onText(/^[\/\.]setseller(?:\s+([^\s]+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const requesterTelegramId = msg.from.id;
    let target = match[1];
    if (!target && msg.reply_to_message?.text) target = msg.reply_to_message.text.trim();
    if (target?.startsWith('@')) target = target.substring(1);

    const adminData = await pool.query('SELECT id, role FROM users WHERE telegram_id = $1', [requesterTelegramId]);
    if (adminData.rows.length === 0) return sendSafeMessage(chatId, '❌ No estás registrado. Usa /start.');
    const adminId = adminData.rows[0].id;
    const role = adminData.rows[0].role;
    if (role !== 'admin') return sendSafeMessage(chatId, '❌ Solo administradores pueden hacer sellers.');

    if (!target) {
        setUserState(requesterTelegramId, { step: 'awaiting_setseller' });
        return sendSafeMessage(chatId, '🛒 Envía @usuario o ID para hacerlo vendedor:');
    }

    try {
        const user = await findUserByUsernameOrId(target, role);
        if (user.role === 'admin') return sendSafeMessage(chatId, '⚠️ No puedes degradar a un admin a seller. Usa /setuser primero.');
        if (user.role === 'seller') return sendSafeMessage(chatId, `⚠️ ${user.username} ya es seller.`);
        await pool.query('UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2', ['seller', user.id]);
        await pool.query(`INSERT INTO credit_transactions (to_user_id, transaction_type, old_role, new_role, reason, created_at)
                          VALUES ($1, 'role_change', $2, 'seller', 'Ascendido por bot', NOW())`, [user.id, user.role]);
        await notifyAdminsAndGroups(`🔄 *CAMBIO DE ROL*\n👤 Usuario: ${user.username}\n🎭 Nuevo rol: SELLER\n👮‍♂️ Por: ${msg.from.username || msg.from.id}`);
        await sendSafeMessage(chatId, `✅ ${user.username} ahora es SELLER.`);
    } catch (error) {
        await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
    }
    clearUserState(requesterTelegramId);
});

bot.onText(/^[\/\.]setuser(?:\s+([^\s]+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const requesterTelegramId = msg.from.id;
    let target = match[1];
    if (!target && msg.reply_to_message?.text) target = msg.reply_to_message.text.trim();
    if (target?.startsWith('@')) target = target.substring(1);

    const adminData = await pool.query('SELECT id, role FROM users WHERE telegram_id = $1', [requesterTelegramId]);
    if (adminData.rows.length === 0) return sendSafeMessage(chatId, '❌ No estás registrado. Usa /start.');
    const adminId = adminData.rows[0].id;
    const role = adminData.rows[0].role;
    if (role !== 'admin') return sendSafeMessage(chatId, '❌ Solo administradores pueden degradar.');

    if (!target) {
        setUserState(requesterTelegramId, { step: 'awaiting_setuser' });
        return sendSafeMessage(chatId, '👤 Envía @usuario o ID para dejarlo como usuario normal:');
    }

    try {
        const user = await findUserByUsernameOrId(target, role);
        if (user.role === 'user') return sendSafeMessage(chatId, `⚠️ ${user.username} ya es usuario normal.`);
        await pool.query('UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2', ['user', user.id]);
        await pool.query(`INSERT INTO credit_transactions (to_user_id, transaction_type, old_role, new_role, reason, created_at)
                          VALUES ($1, 'role_change', $2, 'user', 'Degradado por bot', NOW())`, [user.id, user.role]);
        await notifyAdminsAndGroups(`🔄 *CAMBIO DE ROL*\n👤 Usuario: ${user.username}\n🎭 Nuevo rol: USUARIO\n👮‍♂️ Por: ${msg.from.username || msg.from.id}`);
        await sendSafeMessage(chatId, `✅ ${user.username} ahora es USUARIO NORMAL.`);
    } catch (error) {
        await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
    }
    clearUserState(requesterTelegramId);
});

bot.onText(/^[\/\.]ban(?:\s+([^\s]+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const requesterTelegramId = msg.from.id;
    let target = match[1];
    if (!target && msg.reply_to_message?.text) target = msg.reply_to_message.text.trim();
    if (target?.startsWith('@')) target = target.substring(1);

    const adminData = await pool.query('SELECT id, role FROM users WHERE telegram_id = $1', [requesterTelegramId]);
    if (adminData.rows.length === 0) return sendSafeMessage(chatId, '❌ No estás registrado. Usa /start.');
    const role = adminData.rows[0].role;
    if (role !== 'admin') return sendSafeMessage(chatId, '❌ Solo administradores pueden banear usuarios.');

    if (!target) {
        setUserState(requesterTelegramId, { step: 'awaiting_ban' });
        return sendSafeMessage(chatId, '⛔ Envía @usuario o ID para banearlo:');
    }

    try {
        const user = await findUserByUsernameOrId(target, role);
        if (!user.is_active) return sendSafeMessage(chatId, `⚠️ ${user.username} ya está baneado.`);
        await pool.query('UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1', [user.id]);
        await pool.query(`INSERT INTO activity_logs (user_id, action_type, details, created_at) VALUES ($1, 'ban', $2, NOW())`, [user.id, JSON.stringify({ target_user: user.username, target_id: user.id })]);
        const notifMsg = `⚠️ *USUARIO BANEADO* ⚠️\n\n👮‍♂️ Administrador: ${msg.from.username || msg.from.id}\n👤 Usuario baneado: ${user.username} (ID: ${user.id})\n📅 Fecha: ${new Date().toLocaleString()}`;
        await notifyAdminsAndGroups(notifMsg);
        await sendSafeMessage(chatId, `✅ ${user.username} ha sido BANEADO. Se ha notificado a admins y grupos.`);
    } catch (error) {
        await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
    }
    clearUserState(requesterTelegramId);
});

bot.onText(/^[\/\.]unban(?:\s+([^\s]+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const requesterTelegramId = msg.from.id;
    let target = match[1];
    if (!target && msg.reply_to_message?.text) target = msg.reply_to_message.text.trim();
    if (target?.startsWith('@')) target = target.substring(1);

    const adminData = await pool.query('SELECT id, role FROM users WHERE telegram_id = $1', [requesterTelegramId]);
    if (adminData.rows.length === 0) return sendSafeMessage(chatId, '❌ No estás registrado. Usa /start.');
    const role = adminData.rows[0].role;
    if (role !== 'admin') return sendSafeMessage(chatId, '❌ Solo administradores pueden desbanear usuarios.');

    if (!target) {
        setUserState(requesterTelegramId, { step: 'awaiting_unban' });
        return sendSafeMessage(chatId, '✅ Envía @usuario o ID para desbanearlo:');
    }

    try {
        const user = await findUserByUsernameOrId(target, role);
        if (user.is_active) return sendSafeMessage(chatId, `⚠️ ${user.username} ya está activo.`);
        await pool.query('UPDATE users SET is_active = true, updated_at = NOW() WHERE id = $1', [user.id]);
        await pool.query(`INSERT INTO activity_logs (user_id, action_type, details, created_at) VALUES ($1, 'unban', $2, NOW())`, [user.id, JSON.stringify({ target_user: user.username, target_id: user.id })]);
        const notifMsg = `✅ *USUARIO DESBANEADO* ✅\n\n👮‍♂️ Administrador: ${msg.from.username || msg.from.id}\n👤 Usuario desbaneado: ${user.username} (ID: ${user.id})\n📅 Fecha: ${new Date().toLocaleString()}`;
        await notifyAdminsAndGroups(notifMsg);
        await sendSafeMessage(chatId, `✅ ${user.username} ha sido DESBANEADO. Se ha notificado a admins y grupos.`);
    } catch (error) {
        await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
    }
    clearUserState(requesterTelegramId);
});

// ========== COMANDOS DE EXTRAPOLACIÓN Y VERIFICACIÓN ==========
bot.onText(/^[\/\.](?:gencookie|gencuki|genck|gnck)(?:\s+(\w+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    let country = match[1] ? match[1].toUpperCase() : null;
    if (!country && msg.reply_to_message?.text) country = msg.reply_to_message.text.trim().toUpperCase();
    if (!country) {
        setUserState(telegramId, { step: 'awaiting_gencookie_country' });
        return sendSafeMessage(chatId, '🌎 ¿País? (MX, US, CA, UK, DE, FR, IT, ES, JP, AU, IN)');
    }
    await handleGenCookieCommand(chatId, telegramId, country);
    clearUserState(telegramId);
});

bot.onText(/^[\/\.](?:amazoncookieinfinita|amzckin|amazoninfinita)(?:\s+(.+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    let fullParam = match[1] ? match[1].trim() : '';

    // Verificar tarjeta con cookie (local)
    const verificarTarjetaConCookie = async (card, cookie) => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120000);
            const resp = await fetch(API_AMAZON_CHECK_URL, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ card, cookies: cookie }), signal: controller.signal
            });
            clearTimeout(timeoutId);
            const data = await resp.json();
            const isBanned = data.message && (data.message.toLowerCase().includes('cookie expirada') || data.message.toLowerCase().includes('inicia sesión') || data.message.toLowerCase().includes('cuenta baneada') || data.message.toLowerCase().includes('account banned'));
            return { status: data.status, isBanned, message: data.message };
        } catch (err) { return { status: 'ERROR', isBanned: false, message: err.message }; }
    };

    const generarCookieAsync = async () => {
        const response = await fetch(`${API_GENCOOKIE_URL}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ country: 'MX', add_address: true }) });
        const data = await response.json();
        if (!data.success) throw new Error('Error generando cookie');
        const creditResult = await deductCredits(telegramId, 4);
        if (creditResult?.creditsZero) await kickUserFromGroup(telegramId);
        await pool.query('UPDATE users SET cookies_generated = cookies_generated + 1 WHERE telegram_id = $1', [telegramId]);
        return data.data.cookie_string;
    };

    try {


        // 1. Detectar lista de tarjetas (múltiples líneas)
        let tarjetas = [];
        const lineas = fullParam.split(/\r?\n/);
        for (const linea of lineas) {
            const cardMatch = linea.match(/(\d{16})\s*[|]\s*(\d{2})\s*[|]\s*(\d{4})\s*[|]\s*(\d{3,4})/);
            if (cardMatch) tarjetas.push(`${cardMatch[1]}|${cardMatch[2]}|${cardMatch[3]}|${cardMatch[4]}`);
        }
        if (tarjetas.length > 0) {
            if (tarjetas.length > 200) {
                tarjetas = tarjetas.slice(0, 200);
                await sendSafeMessage(chatId, `⚠️ Se encontraron más de 200 tarjetas, solo se verificarán las primeras 200.`);
            }
            await sendSafeMessage(chatId, `📋 Se verificarán ${tarjetas.length} tarjetas.`);
            let stats = { lives: 0, deads: 0, errors: 0, cookiesUsadas: 0 };
            let currentCookie = await generarCookieAsync();
            let nextCookiePromise = generarCookieAsync().catch(err => { console.error(err); return null; });
            stats.cookiesUsadas++;
            let progressMsg = await sendSafeMessage(chatId, `🔄 Verificando 0/${tarjetas.length}... Cookies: 1`);
            for (let i = 0; i < tarjetas.length; i++) {
                const res = await verificarTarjetaConCookie(tarjetas[i], currentCookie);
                if (res.status === 'LIVE') stats.lives++;
                else if (res.status === 'DEAD') stats.deads++;
                else stats.errors++;
                if (res.isBanned) {
                    if (nextCookiePromise) currentCookie = await nextCookiePromise;
                    else currentCookie = await generarCookieAsync();
                    nextCookiePromise = generarCookieAsync().catch(err => { console.error(err); return null; });
                    stats.cookiesUsadas++;
                }
                if ((i+1) % 10 === 0 || res.isBanned) {
                    try {
                        await bot.editMessageText(`🔄 ${i+1}/${tarjetas.length}\n💚 ${stats.lives} ❌ ${stats.deads} ⚠️ ${stats.errors}\n🍪 ${stats.cookiesUsadas}`, { chat_id: chatId, message_id: progressMsg.message_id });
                    } catch(e) {}
                }
                await new Promise(r => setTimeout(r, 800));
            }
            if (nextCookiePromise) nextCookiePromise.catch(() => {});
            await sendSafeMessage(chatId, `📊 *RESULTADO*\n✅ ${stats.lives} LIVE | ❌ ${stats.deads} DEAD | ⚠️ ${stats.errors} ERROR\n🍪 Cookies: ${stats.cookiesUsadas}`, { parse_mode: 'Markdown' });
            return;
        }

        // 2. Si no hay tarjetas, determinar extra, BIN o banco
        if (!fullParam) {
            setUserState(telegramId, { step: 'awaiting_amazoninfinita_param' });
            return sendSafeMessage(chatId, '📌 Envía un BIN (6 dígitos), nombre de banco, un extra (ej. 481515xxxx|09|2029|rnd) o una lista de tarjetas.');
        }

        let cantidad = null;
        let extraInput = fullParam;
        const cantidadMatch = fullParam.match(/\s+(\d+)$/);
        if (cantidadMatch) {
            cantidad = parseInt(cantidadMatch[1]);
            extraInput = fullParam.substring(0, cantidadMatch.index).trim();
        }

        let extra = null;
        const esBin = /^\d{6}$/.test(extraInput);
        // Detectar si es banco usando la constante
        let esBanco = false;
        let binEncontrado = null;
        if (!esBin) {
            const nombreBanco = extraInput.toLowerCase().trim();
            for (const [key, bins] of Object.entries(bankBins)) {
                if (nombreBanco.includes(key)) {
                    esBanco = true;
                    binEncontrado = bins[Math.floor(Math.random() * bins.length)];
                    break;
                }
            }
        }
        if (esBin || esBanco) {
            const bin = esBin ? extraInput : binEncontrado;
            await sendSafeMessage(chatId, `🔍 Extrapolando BIN ${bin}...`);
            const extrasList = await getPatternsFromBin(chatId, bin);
            if (!extrasList.length) throw new Error('No se encontraron patrones');
            extra = extrasList[0];
            await sendSafeMessage(chatId, `✅ Extra elegido: \`${extra}\``);
        
        } else {
            extra = normalizarExtra(extraInput);
            const test = generarTarjetasDesdePatron(extra, 1);
            if (!test || test.length === 0) throw new Error('Formato inválido');
            await sendSafeMessage(chatId, `🎴 Extra validado: \`${extra}\``);
        }

        if (cantidad && cantidad > 0 && cantidad <= 500) {
            await procesarExtraConCantidad(chatId, telegramId, extra, cantidad);
        } else {
            setUserState(telegramId, { step: 'awaiting_amazoninfinita_cantidad', data: { extra } });
            await sendSafeMessage(chatId, '🔢 ¿Cuántas tarjetas quieres generar y verificar? (máximo 500, por defecto 100)');
        }
    } catch (error) {
        console.error('Error en amazoncookieinfinita:', error);
        await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
        clearUserState(telegramId);
    }
});

// ========== OTROS COMANDOS (resumidos) ==========
bot.onText(/^[\/\.]info(?:\s+([^\s]+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const requesterId = msg.from.id;
    let target = match[1];
    if (!target && msg.reply_to_message?.text) target = msg.reply_to_message.text.trim();
    if (target && /^\d+$/.test(target) && parseInt(target) < 10000) target = null;
    const role = await getUserRoleFromDB(requesterId);
    if (role !== 'admin' && role !== 'seller') return sendSafeMessage(chatId, '❌ No tienes permiso.');
    if (!target) {
        setUserState(requesterId, { step: 'awaiting_info_target' });
        return sendSafeMessage(chatId, '👤 Envía el username o ID del usuario:');
    }
    try {
        const user = await findUserByUsernameOrId(target, role);
        const createdDate = new Date(user.created_at).toLocaleDateString();
        const msgText = `📋 *Información del usuario*\n🆔 ID: ${user.id}\n👤 Usuario: ${user.username}\n💰 Créditos: ${user.credits}\n📅 Días restantes: ${user.days_remaining}\n⭐ Rol: ${user.role.toUpperCase()}\n📆 Registro: ${createdDate}\n📊 Mensajes enviados: ${user.total_checks || 0}`;
        await sendSafeMessage(chatId, msgText, { parse_mode: 'Markdown' });
    } catch (error) { await sendSafeMessage(chatId, `❌ Error: ${error.message}`); }
    clearUserState(requesterId);
});

bot.onText(/^[\/\.]gracias$/i, async (msg) => {
    await sendSafeMessage(msg.chat.id, "D nada preciosaa (˶ᵔ ᵕ ᵔ˶) ‹𝟹, un placer contribuir a alcanzar tu autonomía económica, emocional y espiritual ୭ ˚. ᵎᵎ");
});

// ========== COMANDO /amazon (usa cookie guardada) ==========
bot.onText(/^[\/\.](?:amazon\b|amz\b)(?:\s+(.+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    let param = getCommandParam(msg, 'amazon') || getCommandParam(msg, 'amz');
    if (!param && msg.reply_to_message?.text) param = msg.reply_to_message.text.trim();
    if (!param) {
        setUserState(telegramId, { step: 'awaiting_amazon_cards' });
        return sendSafeMessage(chatId, '💳 Envía tarjetas, patrón, BIN o nombre de banco:');
    }
    await handleAmazonCommand(chatId, telegramId, param);
    clearUserState(telegramId);
});

// ========== COMANDO /amazoncookie (genera cookie nueva) ==========
bot.onText(/^[\/\.](?:amazoncookie|amazoncuki|amazonck|amzck)/i, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    let param = getCommandParam(msg, 'amazoncookie') || getCommandParam(msg, 'amazoncuki') || getCommandParam(msg, 'amazonck') || getCommandParam(msg, 'amzck');
    if (!param && msg.reply_to_message?.text) param = msg.reply_to_message.text.trim();
    if (param) param = param.trim();
    if (param === '') param = null;
    clearUserState(telegramId);
    if (!param) {
        await sendSafeMessage(chatId, '🍪 Generando nueva cookie...');
        try {
            const response = await fetch(`${API_GENCOOKIE_URL}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ country: 'MX', add_address: true }) });
            const data = await response.json();
            if (!data.success) throw new Error('Error al generar cookie');
            const cookie = data.data.cookie_string;
            await updateUserCookie(telegramId, cookie);
            const creditResult = await deductCredits(telegramId, 4);
            await sendSafeMessage(chatId, `✅ Cookie generada. Créditos restantes: ${creditResult?.newCredits || '?'}.`);
            setUserState(telegramId, { step: 'awaiting_amazon_cards' });
            await sendSafeMessage(chatId, '💳 Envía las tarjetas (una por línea o con separadores):');
        } catch (err) { await sendSafeMessage(chatId, `❌ Error: ${err.message}`); }
        return;
    }
    let tarjetas = limpiarTarjetas(param);
    let esBin = /^\d{6}$/.test(param);
    let esBanco = !esBin && getBinForBank?.(param) !== null;
    if (tarjetas.length > 0) {
        if (tarjetas.length > 20) return sendSafeMessage(chatId, `⚠️ Máximo 20 tarjetas.`);
        await sendSafeMessage(chatId, `💳 *Tarjetas a verificar (${tarjetas.length}):*\n${tarjetas.map(t => `\`${t}\``).join('\n')}`, { parse_mode: 'Markdown' });
        await sendSafeMessage(chatId, '🍪 Generando cookie para verificación...');
        try {
            const response = await fetch(`${API_GENCOOKIE_URL}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ country: 'MX', add_address: true }) });
            const data = await response.json();
            if (!data.success) throw new Error('Error al generar cookie');
            const cookie = data.data.cookie_string;
            await updateUserCookie(telegramId, cookie);
            const creditResult = await deductCredits(telegramId, 4);
            await sendSafeMessage(chatId, `✅ Cookie generada. Créditos restantes: ${creditResult?.newCredits || '?'}.`);
            await verificarTarjetasConCookie(chatId, cookie, tarjetas, null);
        } catch (err) { await sendSafeMessage(chatId, `❌ Error al generar cookie: ${err.message}`); }
        return;
    }
    if (esBin || esBanco) {
        await sendSafeMessage(chatId, '🔄 Procesando en paralelo: generando cookie y extrapolando...');
        let cookie = null, extrapolation = null, cookieError = null, extrapolationError = null;
        try {
            [cookie, extrapolation] = await Promise.all([
                (async () => {
                    try {
                        const response = await fetch(`${API_GENCOOKIE_URL}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ country: 'MX', add_address: true }) });
                        const data = await response.json();
                        if (!data.success) throw new Error('Error al generar cookie');
                        await updateUserCookie(telegramId, data.data.cookie_string);
                        const creditResult = await deductCredits(telegramId, 4);
                        await sendSafeMessage(chatId, `✅ Cookie generada. Créditos restantes: ${creditResult?.newCredits || '?'}.`);
                        return data.data.cookie_string;
                    } catch (err) { cookieError = err; return null; }
                })(),
                (async () => {
                    try {
                        const binParam = esBanco ? (getBinForBank?.(param) || param) : param;
                        return await prepararExtrapolacion(chatId, telegramId, binParam);
                    } catch (err) { extrapolationError = err; return null; }
                })()
            ]);
            if (cookieError) throw cookieError;
            if (extrapolationError) throw extrapolationError;
            if (!extrapolation || !extrapolation.tarjetas?.length) throw new Error('No se generaron tarjetas');
            await verificarTarjetasConCookie(chatId, cookie, extrapolation.tarjetas, extrapolation.mensajePrevio);
        } catch (err) { await sendSafeMessage(chatId, `❌ Error: ${err.message}`); }
        return;
    }
    try {
        const normalized = normalizarExtra(param);
        const test = generarTarjetasDesdePatron(normalized, 1);
        if (test?.length) {
            let tarjetasGen = generarTarjetasDesdePatron(normalized, 20);
            await sendSafeMessage(chatId, `🎴 *Tarjetas generadas (${tarjetasGen.length}):*\n${tarjetasGen.slice(0,20).map(t => `\`${t}\``).join('\n')}`, { parse_mode: 'Markdown' });
            await sendSafeMessage(chatId, '🍪 Generando cookie para verificación...');
            const response = await fetch(`${API_GENCOOKIE_URL}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ country: 'MX', add_address: true }) });
            const data = await response.json();
            if (!data.success) throw new Error('Error al generar cookie');
            const cookie = data.data.cookie_string;
            await updateUserCookie(telegramId, cookie);
            const creditResult = await deductCredits(telegramId, 4);
            await sendSafeMessage(chatId, `✅ Cookie generada. Créditos restantes: ${creditResult?.newCredits || '?'}.`);
            await verificarTarjetasConCookie(chatId, cookie, tarjetasGen, null);
        } else throw new Error('Formato no reconocido');
    } catch (err) { await sendSafeMessage(chatId, `❌ Error: ${err.message}`); }
});

// ========== COMANDO /binlist ==========
bot.onText(/^[\/\.](?:binlist|bins|list|binl|bnl)(?:\s+(.+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    let query = match[1];
    if (!query && msg.reply_to_message?.text) query = msg.reply_to_message.text.trim();
    if (!query) {
        setUserState(telegramId, { step: 'awaiting_binlist_query' });
        return sendSafeMessage(chatId, '🏦 Ingresa el nombre de un banco o país:');
    }
    await handleBinlistCommand(chatId, telegramId, query);
    clearUserState(telegramId);
});

// ========== COMANDO /extrapolador ==========
bot.onText(/^[\/\.](?:extrapolador|extrapolado|extrapolad|extrapolar|extrapola|extrapol|extrapo|extrap|extras|extra|expo|exp|ext|xtr|xtrp|scrapper|scrapp|scrp)(?:\s+(.+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    let input = match[1]?.trim();
    if (!input && msg.reply_to_message?.text) input = msg.reply_to_message.text.trim();
    if (!input) {
        setUserState(telegramId, { step: 'awaiting_extrapolador_input' });
        return sendSafeMessage(chatId, '🔢 Envía un BIN de 6 dígitos, nombre de banco o país:');
    }
    await handleExtrapoladorCommand(chatId, telegramId, input);
    clearUserState(telegramId);
});

// ========== COMANDO /gen ==========
bot.onText(/^[\/\.](?:generadorccs|genccs|gncc|gen\b)(?:\s+(.+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    let param = match[1]?.trim();
    if (!param && msg.reply_to_message?.text) param = msg.reply_to_message.text.trim();
    if (!param) {
        setUserState(telegramId, { step: 'awaiting_gen_param' });
        return sendSafeMessage(chatId, '🎴 Envía un extra, BIN o nombre de banco:');
    }
    await handleGenCommand(chatId, telegramId, param);
    clearUserState(telegramId);
});

// ========== COMANDO /limpiador ==========
bot.onText(/\/limpiador(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    let texto = match[1]?.trim();
    if (!texto && msg.reply_to_message?.text) texto = msg.reply_to_message.text.trim();
    if (!texto) {
        setUserState(msg.from.id, { step: 'awaiting_limpiador' });
        return sendSafeMessage(chatId, '📝 Envía el texto sucio:');
    }
    await handleLimpiadorCommand(chatId, msg.from.id, texto);
    clearUserState(msg.from.id);
});

// ========== COMANDO /bin (información de BIN) ==========
bot.onText(/^[\/\.](?:bin)(?:\s+(\d{6}))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    let bin = match[1];
    if (!bin && msg.reply_to_message?.text) {
        const posibleBin = msg.reply_to_message.text.match(/\b\d{6}\b/);
        if (posibleBin) bin = posibleBin[0];
    }
    if (!bin) {
        setUserState(telegramId, { step: 'awaiting_bin_input' });
        return sendSafeMessage(chatId, '💳 Envía un BIN de 6 dígitos para obtener su información:');
    }
    if (!/^\d{6}$/.test(bin)) return sendSafeMessage(chatId, '❌ BIN inválido (6 dígitos).');
    await sendSafeMessage(chatId, `🔍 Consultando BIN ${bin}...`);
    try {
        const info = await getBinInfo(bin);
        if (!info) throw new Error('No se pudo obtener información');
        const emoji = info.countryCode ? ` 🇲🇽` : '';
        const mensaje = `💳 *Información del BIN: ${info.bin}*\n\n🏛 *Banco:* ${info.bank}\n🏢 *Marca:* ${info.brand}\n🏷 *Tipo:* ${info.type}\n👑 *Nivel:* ${info.level}\n🌎 *País:* ${info.country}${emoji} (${info.countryCode || '??'})`;
        await sendSafeMessage(chatId, mensaje, { parse_mode: 'Markdown' });
    } catch (err) { await sendSafeMessage(chatId, `❌ Error: ${err.message}`); }
    clearUserState(telegramId);
});

// ========== COMANDO /lattice ==========
bot.onText(/^[\/\.](?:lattice)(?:\s+(.+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    let amount = match[1]?.trim();
    if (!amount && msg.reply_to_message?.text) amount = msg.reply_to_message.text.trim();
    if (!amount) {
        setUserState(telegramId, { step: 'awaiting_lattice_amount' });
        return sendSafeMessage(chatId, '💰 Ingresa el monto (ej. 19.99):');
    }
    if (!await checkAndKickIfNoDaysOrCredits(telegramId, chatId, 1)) return;
    setUserState(telegramId, { step: 'awaiting_lattice_cards', data: { amount } });
    await sendSafeMessage(chatId, '💳 Envía las tarjetas (texto sucio o patrón):');
});

// ========== COMANDO /menu ==========
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

// ========== COMANDO /help ==========
bot.onText(/\/help/, async (msg) => {
    await sendSafeMessage(msg.chat.id,
        `📖 *COMANDOS DISPONIBLES*\n\n` +
        `🔹 *Gestión de cuenta*\n/start - Vincular tu cuenta\n/creditos - Ver créditos y días\n/menu - Menú interactivo\n\n` +
        `🔹 *Generación de cookies*\n/gencookie [país] - Genera cookie (4 créditos)\n/setcookie [cookie] - Guarda cookie manualmente\n\n` +
        `🔹 *Búsqueda y extrapolación*\n/binlist [banco|país] - Lista bins\n/extrapolador [banco|país|bin] - Extrae patrones (10 créditos)\n\n` +
        `🔹 *Verificación en Amazon*\n/amazon [banco|país|bin|extra|tarjetas] - Verifica con cookie guardada\n/amazoncookie [...] - Genera cookie nueva y verifica (4 créditos)\n/amazoncookieinfinita [...] - Verificación infinita con rotación de cookies\n\n` +
        `🔹 *Otras herramientas*\n/gen [banco|país|bin|extra] - Genera tarjetas (4 créditos)\n/limpiador - Extrae tarjetas de texto sucio\n/bin [6-digit-bin] - Info del BIN\n/lattice [monto] - Gate charged (1 crédito)\n\n` +
        `💡 *Uso interactivo:* escribe el comando sin parámetros, o responde a un mensaje.`,
        { parse_mode: 'Markdown' }
    );
});

// ========== COMANDO /creditos /credits /saldo ==========
bot.onText(/\/creditos|\/credits|\/saldo/, async (msg) => {
    const user = await pool.query('SELECT credits, days_remaining FROM users WHERE telegram_id = $1', [msg.from.id]);
    if (!user.rows.length) return sendSafeMessage(msg.chat.id, '❌ Usa /start primero.');
    await sendSafeMessage(msg.chat.id, `💰 Créditos: ${user.rows[0].credits}\n📅 Días: ${user.rows[0].days_remaining}`, { parse_mode: 'Markdown' });
});

// ========== COMANDO /setcookie ==========
bot.onText(/^[\/\.](?:setcookie|setcuki|stck|sck|setck|addcookie|addcuki|addck|dck|ack)(?:\s+(.+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    let cookie = match[1]?.trim();
    if (!cookie && msg.reply_to_message?.text) cookie = msg.reply_to_message.text.trim();
    if (!cookie) {
        setUserState(telegramId, { step: 'awaiting_setcookie' });
        return sendSafeMessage(chatId, '🍪 Envía la cookie:');
    }
    await updateUserCookie(telegramId, cookie);
    await sendSafeMessage(chatId, '✅ Cookie guardada.');
    clearUserState(telegramId);
});

// ========== MANEJADOR DE CALLBACK QUERY (menú) ==========
bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const telegramId = callbackQuery.from.id;
    const data = callbackQuery.data;
    if (data === 'gencookie_for_amazon') {
        try {
            const response = await fetch(`${API_GENCOOKIE_URL}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ country: 'MX', add_address: true }) });
            const json = await response.json();
            if (!json.success) throw new Error('Error');
            const cookie = json.data.cookie_string;
            await updateUserCookie(telegramId, cookie);
            const creditResult = await deductCredits(telegramId, 4);
            await sendSafeMessage(chatId, `✅ Cookie generada. Créditos restantes: ${creditResult?.newCredits || '?'}\nAhora envía las tarjetas:`);
            setUserState(telegramId, { step: 'awaiting_amazon_cards' });
        } catch (err) { await sendSafeMessage(chatId, `❌ Error: ${err.message}`); }
        await bot.answerCallbackQuery(callbackQuery.id);
    } else {
        let respuesta = '';
        switch(data) {
            case 'menu_gencookie': respuesta = 'Usa /gencookie MX (o US...). Cuesta 4 créditos.'; break;
            case 'menu_extrapolador': respuesta = 'Usa /extrapolador 123456 (10 créditos)'; break;
            case 'menu_gen': respuesta = 'Usa /gen 549949xxxx|05|2029'; break;
            case 'menu_limpiador': respuesta = 'Usa /limpiador y luego envía el texto'; break;
            case 'menu_chk': respuesta = 'Usa /amazon [tarjetas|patrón|BIN|banco]'; break;
            case 'menu_creditos': respuesta = 'Usa /creditos'; break;
            default: respuesta = 'Opción no válida.';
        }
        await sendSafeMessage(chatId, respuesta, { parse_mode: 'Markdown' });
        await bot.answerCallbackQuery(callbackQuery.id);
    }
});

// ========== CRON JOB PARA REVISIÓN MASIVA DE PERFILES ==========
cron.schedule('0 3 * * *', async () => {
    console.log('🔄 Revisión masiva de perfiles...');
    const usersRes = await pool.query(`SELECT id, telegram_id, telegram_username, display_name FROM users WHERE telegram_id IS NOT NULL AND updated_at > NOW() - INTERVAL '30 days'`);
    for (const user of usersRes.rows) {
        try {
            const chat = await bot.getChat(user.telegram_id);
            const fullName = (chat.first_name || '') + (chat.last_name ? ' ' + chat.last_name : '');
            await checkAndUpdateTelegramProfile(user.telegram_id, user.id, chat.username, fullName);
            await new Promise(r => setTimeout(r, 500));
        } catch (err) { console.error(err.message); }
    }
});

// ========== MANEJADOR DE MENSAJES PARA ESTADOS INTERACTIVOS ==========
bot.on('message', async (msg) => {
    const telegramId = msg.from.id;
    // Detectar cambios de perfil automáticamente
    const userRes = await pool.query('SELECT id FROM users WHERE telegram_id = $1', [telegramId]);
    if (userRes.rows.length > 0) {
        const userId = userRes.rows[0].id;
        const currentUsername = msg.from.username || null;
        const currentFullName = (msg.from.first_name || '') + (msg.from.last_name ? ' ' + msg.from.last_name : '');
        await checkAndUpdateTelegramProfile(telegramId, userId, currentUsername, currentFullName);
    }

    const state = userStates.get(telegramId);
    if (!state || !state.step) return;
    if (msg.text?.startsWith('/')) return;
    const userText = msg.text;
    const chatId = msg.chat.id;

    switch (state.step) {
        case 'awaiting_amazoninfinita_cantidad':
            const cantidad = parseInt(userText);
            if (isNaN(cantidad) || cantidad < 1) {
                await sendSafeMessage(chatId, '❌ Número inválido. Envía un número entero positivo.');
                return;
            }
            const extra = state.data.extra;
            clearUserState(telegramId);
            await procesarExtraConCantidad(chatId, telegramId, extra, Math.min(cantidad, 500));
            break;
        case 'awaiting_setcredits': {
            const parts = userText.split(/\s+/);
            if (parts.length >= 2) bot.emit('text', { ...msg, text: `/setcredits ${parts[0]} ${parts[1]}` });
            else await sendSafeMessage(chatId, '❌ Formato incorrecto. Usa: @usuario cantidad');
            break;
        }
        case 'awaiting_setdays': {
            const parts = userText.split(/\s+/);
            if (parts.length >= 2) bot.emit('text', { ...msg, text: `/setdays ${parts[0]} ${parts[1]}` });
            else await sendSafeMessage(chatId, '❌ Formato incorrecto. Usa: @usuario días');
            break;
        }
        case 'awaiting_setplan_20':
        case 'awaiting_setplan_60':
        case 'awaiting_setplan_120':
        case 'awaiting_setplan_200': {
            const plan = state.step.split('_')[2];
            bot.emit('text', { ...msg, text: `/setplan${plan} ${userText}` });
            break;
        }
        case 'awaiting_setadmin':
            bot.emit('text', { ...msg, text: `/setadmin ${userText}` });
            break;
        case 'awaiting_setseller':
            bot.emit('text', { ...msg, text: `/setseller ${userText}` });
            break;
        case 'awaiting_setuser':
            bot.emit('text', { ...msg, text: `/setuser ${userText}` });
            break;
        case 'awaiting_ban':
            bot.emit('text', { ...msg, text: `/ban ${userText}` });
            break;
        case 'awaiting_unban':
            bot.emit('text', { ...msg, text: `/unban ${userText}` });
            break;
        case 'awaiting_info_target':
            bot.emit('text', { ...msg, text: `/info ${userText}` });
            break;
        case 'awaiting_gencookie_country':
            await handleGenCookieCommand(chatId, telegramId, userText.toUpperCase());
            clearUserState(telegramId);
            break;
        default:
            // Si no es ninguno de los estados anteriores, limpiar
            clearUserState(telegramId);
            break;
    }
});

console.log('✅ Bot mejorado listo y funcionando');