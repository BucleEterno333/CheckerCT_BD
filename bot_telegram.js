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

// ========== SEPARADORES BONITOS ==========
const SEPARATORS = [
    '﹌﹌﹌﹌﹌﹌﹌﹌﹌﹌﹌﹌﹌﹌﹌﹌﹌' ,
    '𓆩༺✧༻‧༺✧༻‧༺✧༻‧༺✧༻‧༺✧༻‧༺✧༻',
    '₊‿︵‿︵‿︵‿︵‿︵‿︵‿︵‿︵‿︵',
    '⋆.ೃ࿔*:･⋆.ೃ࿔*:･⋆.ೃ࿔*:･⋆.ೃ࿔*:･⋆.ೃ࿔',
    '་༘.ೃ࿔ᥫ᭡.⋆་༘.ೃ࿔ᥫ᭡.⋆་༘.ೃ࿔ᥫ᭡.⋆་༘.ೃ࿔ᥫ᭡.',

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
    const prefix = `/${commandName}`;
    if (text.startsWith(prefix)) {
        let param = text.substring(prefix.length).trim();
        if (param === '') return null;
        return param;
    }
    return null;
}

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
                await new Promise(r => setTimeout(r, 2000)); // espera 2 segundos antes de reintentar
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
            const clave = `${prefix}xxxx|${mes}|${año}`; // Guardamos con año completo
            patrones[clave] = (patrones[clave] || 0) + 1;
        }
        
        const ordenados = Object.entries(patrones).map(([p,c]) => ({ patron: p, count: c })).sort((a,b) => b.count - a.count);
        const mejor = ordenados[0];
        const [prefijo, mes, año] = mejor.patron.split('|');
        // Extra con formato completo: 12digitos + xxxx | mes | año | rnd
        const extraElegido = `${prefijo}xxxx|${mes}|${año}|rnd`;
        
        // Construir mensaje resumen con el formato deseado
        let mensajeResumen = `=== EXTRAPOLACIÓN COMPLETADA ===\n✅ EXTRA A CHECAR: \`${prefijo}xxxx|${mes}|${año}|rnd\` | (${mejor.count} veces)\n\n`;
        
        const muy = ordenados.filter(p => p.count >= 3).slice(0,10);
        const mod = ordenados.filter(p => p.count === 2).slice(0,5);
        const uni = ordenados.filter(p => p.count === 1).slice(0,10);
        
        if (muy.length) {
            mensajeResumen += `🟢 MUY REPETIDOS (${muy.length}):\n`;
            for (const p of muy) {
                const [pf, m, a] = p.patron.split('|');
                mensajeResumen += `\`${pf}xxxx|${m}|${a}|rnd\` (${p.count} veces)\n`;
            }
            mensajeResumen += `\n`;
        }
        if (mod.length) {
            mensajeResumen += `🟡 MODERADOS (${mod.length}):\n`;
            for (const p of mod) {
                const [pf, m, a] = p.patron.split('|');
                mensajeResumen += `\`${pf}xxxx|${m}|${a}|rnd\` (${p.count} veces)\n`;
            }
            mensajeResumen += `\n`;
        }
        if (uni.length) {
            mensajeResumen += `🔴 ÚNICOS (${uni.length}):\n`;
            for (const p of uni) {
                const [pf, m, a] = p.patron.split('|');
                mensajeResumen += `\`${pf}xxxx|${m}|${a}|rnd\` (${p.count} vez)\n`;
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
    // Si ya se mostró un mensaje previo (tabla de patrones, lista de tarjetas), no repetir.
    // Pero si se quiere, se puede enviar de nuevo opcionalmente.
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
    // Normalizar saltos de línea
    let texto = textoSucio.replace(/\r\n/g, '\n').replace(/\n+/g, '\n').trim();
    
    // Dividir por líneas y extraer tarjeta de cada línea
    const lineas = texto.split('\n');
    const tarjetas = [];
    
    for (const linea of lineas) {
        // Buscar patrón: 16 dígitos, separador, mes, año, cvv
        let match = linea.match(/(\d{16})\s*[|│]\s*(\d{2})\s*[|│]\s*(\d{4})\s*[|│]\s*(\d{3})/);
        if (match) {
            tarjetas.push(`${match[1]}|${match[2]}|${match[3]}|${match[4]}`);
            continue;
        }
        // Si no, probar con espacios como separadores
        match = linea.match(/(\d{16})\s+(\d{2})\s+(\d{4})\s+(\d{3})/);
        if (match) {
            tarjetas.push(`${match[1]}|${match[2]}|${match[3]}|${match[4]}`);
        }
    }
    
    return [...new Set(tarjetas)];
}
function normalizarExtra(texto) {
    let temp = texto.trim();
    // Reemplazar espacios, guiones, barras por pipe, pero evitando pipes dobles
    temp = temp.replace(/\s*[\/-]\s*/g, '|');  // primero reemplaza / y - por |
    temp = temp.replace(/\s*\|\s*/g, '|');     // luego normaliza espacios alrededor de |
    // Si no hay pipes, puede ser formato compacto
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
                // prefixWithX tiene formato "12digitos+xxxx", extraemos solo los 12 primeros
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
        const creditResult = await deductCredits(telegramId, 4);
        if (creditResult?.creditsZero) await kickUserFromGroup(telegramId);
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
        let msgText = `🍪 *Cookie ${ctry}*\n📞 Tel: \`${phone}\`\n🔑 Pass: \`${password}\`\n🍪 *Cookie string:*\n\`\`\`\n${cookie_string}\n\`\`\``;        if (creditResult) msgText += `\n💰 Créditos restantes: ${creditResult.newCredits}`;
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

    // 1. Limpiar tarjetas completas (lista de tarjetas con 16 dígitos)
    let tarjetas = limpiarTarjetas(param);
    if (tarjetas.length > 0) {
        if (tarjetas.length > 20) return sendSafeMessage(chatId, `⚠️ Máximo 20 tarjetas.`);
        await sendSafeMessage(chatId, `💳 *Tarjetas a verificar:*\n${tarjetas.map(t => `\`${t}\``).join('\n')}`, { parse_mode: 'Markdown' });
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

    // 2. Detectar si es un EXTRA (contiene | y fecha, incluso si empieza con 6 dígitos)
    let normalizedParam = normalizarExtra(param);
    let esExtra = normalizedParam.includes('|') && /[0-9X]+\|\d{1,2}\|\d{2,4}/.test(normalizedParam) && (normalizedParam.includes('X') || normalizedParam.split('|')[0].length < 16);
    
    // 3. Detectar BIN (solo si no es extra y son exactamente 6 dígitos)
    let esBin = false;
    if (!esExtra) {
        esBin = /^\d{6}$/.test(param.trim());
    }
    
    // 4. Detectar banco
    let esBanco = !esExtra && !esBin && getBinForBank(param) !== null;

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
            throw new Error('Formato no reconocido');
        }

        // Verificar tarjetas obtenidas (provenientes de extra o bin)
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

// ==================== COMANDOS ================

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
                `👋 ¡Hola ${firstName}! 👋\n\nHe guardado tu Chat ID: <code>${telegramId}</code>\n\nRegístrate en la web: https://astralchk.com/login.html con usuario @${username}`, { parse_mode: 'HTML' });
        } else {
            await sendSafeMessage(chatId,
                `👋 ¡Hola ${firstName}!\n💰 Créditos: ${existing.credits}\n📅 Días: ${existing.days_remaining}\n\nUsa /menu para ver comandos.`, { parse_mode: 'Markdown' });
        }
    } catch (error) {
        console.error(error);
        await sendSafeMessage(chatId, '❌ Error interno.');
    }
});

bot.onText(/^\/(?:gencookie|gencuki|genck|gnck)(?:\s+(\w+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    let country = match[1] ? match[1].toUpperCase() : null;
    if (!country) {
        setUserState(telegramId, { step: 'awaiting_gencookie_country' });
        return sendSafeMessage(chatId, '🌎 ¿País? (MX, US, CA, UK, DE, FR, IT, ES, JP, AU, IN)');
    }
    await handleGenCookieCommand(chatId, telegramId, country);
    clearUserState(telegramId);
});

bot.onText(/^\/(?:amazoncookie|amazoncuki|amazonck|amzck)/i, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    let param = getCommandParam(msg, 'amazoncookie') || getCommandParam(msg, 'amazoncuki') || getCommandParam(msg, 'amazonck') || getCommandParam(msg, 'amzck');
    
    // Solo limpiar espacios al inicio/final, NO eliminar saltos de línea
    if (param) param = param.trim();
    if (param === '') param = null;
    
    clearUserState(telegramId);
    
    // Caso 1: Sin parámetro → generar cookie y luego pedir tarjetas
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
    
    // Caso 2: Con parámetro → detectar qué es y procesar
    // Primero, intentar limpiar tarjetas completas (el parámetro conserva los saltos de línea)
    let tarjetas = limpiarTarjetas(param);
    let esBin = /^\d{6}$/.test(param);
    let esBanco = !esBin && getBinForBank(param) !== null;
    
    if (tarjetas.length > 0) {
        // Son tarjetas completas
        if (tarjetas.length > 20) return sendSafeMessage(chatId, `⚠️ Máximo 20 tarjetas.`);
        await sendSafeMessage(chatId, `💳 *Tarjetas a verificar (${tarjetas.length}):*\n${tarjetas.map(t => `\`${t}\``).join('\n')}`, { parse_mode: 'Markdown' });
        // Generar cookie y verificar
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
    
    // Si no son tarjetas, comprobar si es BIN o banco
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
    
    // Último intento: si es un extra (patrón con X)
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

bot.onText(/^\/(?:amazon\b|amz\b)(?:\s+(.+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    let param = getCommandParam(msg, 'amazon') || getCommandParam(msg, 'amz');

    if (!param) {
        setUserState(telegramId, { step: 'awaiting_amazon_cards' });
        return sendSafeMessage(chatId, '💳 Envía tarjetas, patrón, BIN o nombre de banco:');
    }
    await handleAmazonCommand(chatId, telegramId, param);
    clearUserState(telegramId);
});


bot.onText(/^\/(?:binlist|bins|list|binl|bnl)(?:\s+(.+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    let query = match[1];
    if (!query) {
        setUserState(telegramId, { step: 'awaiting_binlist_query' });
        return sendSafeMessage(chatId, '🏦 Ingresa el nombre de un banco o país:');
    }
    await handleBinlistCommand(chatId, telegramId, query);
    clearUserState(telegramId);
});

bot.onText(/^\/(?:extrapolador|extrapolado|extrapolad|extrapolar|extrapola|extrapol|extrapo|extrap|extras|extra|expo|exp|ext|xtr|xtrp|scrapper|scrapp|scrp)(?:\s+(.+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    let input = match[1];
    if (!input) {
        setUserState(telegramId, { step: 'awaiting_extrapolador_input' });
        return sendSafeMessage(chatId, '🔢 Envía un BIN de 6 dígitos, nombre de banco o país:');
    }
    await handleExtrapoladorCommand(chatId, telegramId, input);
    clearUserState(telegramId);
});

bot.onText(/^\/(?:generadorccs|genccs|gncc|gen\b)(?:\s+(.+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    let param = match[1];
    if (!param) {
        setUserState(telegramId, { step: 'awaiting_gen_param' });
        return sendSafeMessage(chatId, '🎴 Envía un extra, BIN o nombre de banco:');
    }
    await handleGenCommand(chatId, telegramId, param);
    clearUserState(telegramId);
});



bot.onText(/^\/(?:setcookie|setcuki|stck|sck|setck|addcookie|addcuki|addck|dck|ack)(?:\s+(.+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    let cookie = match[1];
    if (!cookie) {
        setUserState(telegramId, { step: 'awaiting_setcookie' });
        return sendSafeMessage(chatId, '🍪 Envía la cookie:');
    }
    await handleSetCookieCommand(chatId, telegramId, cookie);
    clearUserState(telegramId);
});




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

bot.onText(/\/limpiador(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    let texto = match[1];
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
        `📖 *Comandos:*\n/start\n/gencookie [país]\n/setcookie [cookie]\n/binlist [banco/pais]\n/extrapolador [bin|banco]\n/gen [extra|bin|banco]\n/amazon [extra|bin|tarjetas|banco]\n/amazoncookie [extra|bin|banco]\n/lattice [monto]\n/limpiador\n/creditos\n/menu`, { parse_mode: 'Markdown' });
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