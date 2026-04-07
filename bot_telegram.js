// ============================================
// BOT DE TELEGRAM - CIBERTERRORISTAS CHK
// Comandos: /start, /gencookie, /gen, /limpiador, /extrapolador, /chk, /creditos, /renovar, /id, /help, /menu
// ============================================

const TelegramBot = require('node-telegram-bot-api');
const { pool } = require('./database');

// ========== CONFIGURACIÓN ==========
const token = process.env.TELEGRAM_BOT_TOKEN;
const API_BASE_URL = process.env.API_BASE_URL || 'https://p01--basedatos--vwr6mdxp7dhn.code.run/api';
const BOT_API_KEY = process.env.BOT_API_KEY || 'AALOL23894238HWKEJSNFSDGF'; // Clave secreta para que el bot pueda usar el endpoint de descuento de créditos
const API_GENCOOKIE_URL = process.env.API_GENCOOKIE_URL || 'https://p01--gencookie--2bcj5drfqjzx.code.run';
const API_EXTRAPOLADOR_URL = process.env.API_EXTRAPOLADOR_URL || 'https://p01--extrapolador--2bcj5drfqjzx.code.run';

if (!token) {
    console.error('❌ ERROR: TELEGRAM_BOT_TOKEN no está configurado');
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
console.log('🤖 Bot de Telegram inicializado');

// ========== FUNCIONES AUXILIARES ==========
async function getUserByChatId(chatId) {
    const res = await pool.query('SELECT username, credits, days_remaining FROM users WHERE telegram_chat_id = $1', [chatId]);
    return res.rows[0];
}

async function deductCredits(username, amount = 3) {
    try {
        const response = await fetch(`${API_BASE_URL}/user/bot/use-credits`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: username,
                amount: amount,
                bot_key: BOT_API_KEY
            })
        });
        const data = await response.json();
        if (data.success) {
            return data.newCredits;
        } else {
            console.error('Error al descontar créditos (bot):', data.error);
            return null;
        }
    } catch (error) {
        console.error('Error en petición de descuento de créditos:', error);
        return null;
    }
}

// Función para generar tarjetas a partir de un patrón (ej: 549949056298xxxx|05|2029)
function generarTarjetasDesdePatron(patron, cantidad = 10) {
    // Separar partes: número|mes|año
    const partes = patron.split('|');
    if (partes.length < 3) throw new Error('Formato incorrecto. Usa: 16dígitos|MM|AAAA o 12dígitosxxxx|MM|AAAA');
    let [numeroBase, mes, año] = partes;
    const cvv = partes[3] || 'rnd'; // opcional
    mes = mes.padStart(2, '0');
    año = año.length === 2 ? `20${año}` : año;

    // Validar que numeroBase tenga 16 caracteres con X
    if (!/^[0-9X]{16}$/.test(numeroBase)) throw new Error('El patrón del número debe tener 16 caracteres (números o X)');
    const tieneX = numeroBase.includes('X');
    const digitosFijos = numeroBase.replace(/X/g, '');
    const cantidadX = (numeroBase.match(/X/g) || []).length;

    const tarjetas = [];
    for (let i = 0; i < cantidad; i++) {
        let numeroCompleto = '';
        if (tieneX) {
            // Rellenar X con dígitos aleatorios
            let relleno = '';
            for (let j = 0; j < cantidadX; j++) relleno += Math.floor(Math.random() * 10).toString();
            numeroCompleto = digitosFijos + relleno;
            // Ajustar longitud (puede que digitosFijos ya tenga algunos dígitos después de las X)
            if (numeroCompleto.length > 16) numeroCompleto = numeroCompleto.slice(0, 16);
            if (numeroCompleto.length < 16) numeroCompleto = numeroCompleto.padEnd(16, '0');
        } else {
            numeroCompleto = numeroBase;
        }
        // Validar Luhn (opcional, pero si falla se puede regenerar)
        if (!validarLuhn(numeroCompleto)) {
            // Intentar corregir el último dígito
            const sinDigito = numeroCompleto.slice(0, 15);
            const digito = calcularDigitoLuhn(sinDigito);
            numeroCompleto = sinDigito + digito;
        }
        const cvvGenerado = cvv === 'rnd' ? Math.floor(100 + Math.random() * 900).toString() : cvv;
        tarjetas.push(`${numeroCompleto}|${mes}|${año}|${cvvGenerado}`);
    }
    return tarjetas;
}

function validarLuhn(numero) {
    let suma = 0;
    let esPar = false;
    for (let i = numero.length - 1; i >= 0; i--) {
        let digito = parseInt(numero[i]);
        if (esPar) {
            digito *= 2;
            if (digito > 9) digito -= 9;
        }
        suma += digito;
        esPar = !esPar;
    }
    return suma % 10 === 0;
}

function calcularDigitoLuhn(parcial) {
    let suma = 0;
    let esPar = true;
    for (let i = parcial.length - 1; i >= 0; i--) {
        let digito = parseInt(parcial[i]);
        if (esPar) {
            digito *= 2;
            if (digito > 9) digito -= 9;
        }
        suma += digito;
        esPar = !esPar;
    }
    const digito = (10 - (suma % 10)) % 10;
    return digito.toString();
}

// Función para extraer tarjetas de texto sucio (igual que en amazon.js)
function filtrarTarjetasDeTexto(textoSucio) {
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

// ========== COMANDOS ==========
// /start – Identifica al usuario por su ID numérico de Telegram
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const from = msg.from;
    const userId = from.id;                 // ID numérico único
    const username = from.username || userId.toString();
    const firstName = from.first_name || '';

    try {
        // Verificar si el usuario ya existe por telegram_id
        const existing = await pool.query(
            'SELECT id, credits, days_remaining FROM users WHERE telegram_id = $1',
            [userId]
        );
        const isNew = existing.rows.length === 0;

        // Guardar o actualizar datos del usuario (siempre)
        // telegram_chat_id solo si es chat privado
        let query, params;
        if (msg.chat.type === 'private') {
            query = `
                INSERT INTO users (telegram_id, telegram_username, telegram_chat_id, username, created_at)
                VALUES ($1, $2, $3, $4, NOW())
                ON CONFLICT (telegram_id) DO UPDATE 
                SET telegram_chat_id = $3, telegram_username = $2, username = $4, updated_at = NOW()
            `;
            params = [userId, username, chatId, username];
        } else {
            // En grupos, no guardamos chat_id (para no mezclar)
            query = `
                INSERT INTO users (telegram_id, telegram_username, username, created_at)
                VALUES ($1, $2, $3, NOW())
                ON CONFLICT (telegram_id) DO UPDATE 
                SET telegram_username = $2, username = $3, updated_at = NOW()
            `;
            params = [userId, username, username];
        }
        await pool.query(query, params);

        if (isNew) {
            // Mensaje de bienvenida (primera vez)
            const welcome = 
                `👋 ¡Hola ${firstName}! 👋 \n\n` +
                `He guardado tu Chat ID: <code>${chatId}</code>\n\n` +
                `Ahora puedes registrarte en la web siguiendo estos pasos:\n\n` +
                `1. Ve a la página:\n\n` +
                `                 ꧁⎝ 𓆩༺✧༻𓆪 ⎠꧂\n` +
                `https://ciber7erroristaschk.com/login.html\n` +
                `                 ꧁⎝ 𓆩༺✧༻𓆪 ⎠꧂ \n\n` +
                `2. Usa tu usuario: @${username}\n\n` +
                `3. Recibirás un código de verificación aquí. \n\n` +
                `4. Escríbelo en la página web, y comienza a livear y shippear ahora. \n\n` +
                `                 👾 ¡Te esperamos! 👾`;
            await bot.sendMessage(chatId, welcome, { parse_mode: 'HTML' });
        } else {
            // Usuario ya existe: mostrar sus créditos reales
            const user = existing.rows[0];
                        const servicios = 
                `✅ *Servicios activos:*\n` +
                `*Gates:*\n` +
                `• Amazon (/setCookie + cookie, y /chk amazon + tarjetas) ✅\n` +
                `*Herramientas:*\n` +
                `• Generador de cookies (/gencookie + país) ✅\n` +
                `• Extrapolador (/extrapolador + BIN) ✅\n` +
                `• Generador de tarjetas (/gen + patrón) ✅\n` +
                `• Limpiador de texto (/limpiador) ✅\n`;

            const mensaje = 
                `👋 ¡Hola ${firstName}!\n\n` +
                `Tu cuenta de Telegram ya está vinculada.\n` +
                `💰 *Créditos:* ${credits}\n` +
                `📅 *Días restantes:* ${days}\n\n` +
                `${servicios}\n\n` +
                `Usa /menu para ver todos los comandos.`;
            await bot.sendMessage(chatId, mensaje, { parse_mode: 'Markdown' });
        }
    } catch (error) {
        console.error('Error en /start:', error);
        await bot.sendMessage(chatId, '❌ Error interno. Intenta más tarde.');
    }
});

// /start – Manejo en privado y en grupos
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const from = msg.from;
    const chatType = msg.chat.type;

    // Si el comando viene de un grupo y el usuario no se ha identificado
    if (!from) {
        return bot.sendMessage(chatId, '❌ No se pudo identificar al usuario. Por favor, usa el comando en un chat privado con el bot.');
    }

    // Usar el username si existe, de lo contrario usar el ID numérico como identificador único
    const username = from.username || from.id.toString();
    const firstName = from.first_name || '';

    try {
        // Verificar si el usuario ya existe
        const existingUser = await pool.query(
            'SELECT id, credits, days_remaining FROM users WHERE username = $1',
            [username]
        );
        const isNewUser = existingUser.rows.length === 0;

        // Solo guardar el chat_id si es un chat privado (para poder enviarle mensajes luego)
        if (chatType === 'private') {
            await pool.query(
                `INSERT INTO users (username, telegram_username, telegram_chat_id, created_at)
                 VALUES ($1, $2, $3, NOW())
                 ON CONFLICT (username) DO UPDATE 
                 SET telegram_chat_id = $3, updated_at = NOW()`,
                [username, `@${username}`, chatId]
            );
        } else {
            // En grupos, solo aseguramos que el usuario exista (sin chat_id)
            await pool.query(
                `INSERT INTO users (username, telegram_username, created_at)
                 VALUES ($1, $2, NOW())
                 ON CONFLICT (username) DO NOTHING`,
                [username, `@${username}`]
            );
        }

        if (isNewUser) {
            // Mensaje de primera vez (registro)
            const mensajeBienvenida = 
                `👋 ¡Hola ${firstName}! 👋 \n\n` +
                `He guardado tu Chat ID: <code>${chatId}</code>\n\n` +
                `Ahora puedes registrarte en la web siguiendo estos pasos:\n\n` +
                `1. Ve a la página:\n\n` +
                `                 ꧁⎝ 𓆩༺✧༻𓆪 ⎠꧂\n` +
                `https://ciber7erroristaschk.com/login.html\n` +
                `                 ꧁⎝ 𓆩༺✧༻𓆪 ⎠꧂ \n\n` +
                `2. Usa tu usuario: @${username}\n\n` +
                `3. Recibirás un código de verificación aquí. \n\n` +
                `4. Escríbelo en la página web, y comienza a livear y shippear ahora. \n\n` +
                `                 👾 ¡Te esperamos! 👾`;
            await bot.sendMessage(chatId, mensajeBienvenida, { parse_mode: 'HTML' });
        } else {
            // Usuario ya registrado: mostrar créditos y servicios
            const user = existingUser.rows[0];
            const credits = user.credits;
            const days = user.days_remaining;

            const servicios = 
                `✅ *Servicios activos:*\n` +
                `*Gates:*\n` +
                `• Amazon (/setCookie + cookie, y /chk amazon + tarjetas) ✅\n` +
                `*Herramientas:*\n` +
                `• Generador de cookies (/gencookie + país) ✅\n` +
                `• Extrapolador (/extrapolador + BIN) ✅\n` +
                `• Generador de tarjetas (/gen + patrón) ✅\n` +
                `• Limpiador de texto (/limpiador) ✅\n`;

            const mensaje = 
                `👋 ¡Hola ${firstName}!\n\n` +
                `Tu cuenta de Telegram ya está vinculada.\n` +
                `💰 *Créditos:* ${credits}\n` +
                `📅 *Días restantes:* ${days}\n\n` +
                `${servicios}\n\n` +
                `Usa /menu para ver todos los comandos.`;
            await bot.sendMessage(chatId, mensaje, { parse_mode: 'Markdown' });
        }
    } catch (error) {
        console.error('❌ Error en /start:', error);
        // Envía el error detallado para depuración (puedes eliminarlo después)
        await bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
});
// /gencookie <país> – Genera cookie Amazon (cuesta 3 créditos)
bot.onText(/\/gencookie\s+(\w+)/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const username = msg.from.username;
    const country = match[1].toUpperCase();
    const paisesValidos = ['MX', 'US', 'CA', 'UK', 'DE', 'FR', 'IT', 'ES', 'JP', 'AU', 'IN'];
    if (!paisesValidos.includes(country)) {
        return bot.sendMessage(chatId, `❌ País no soportado. Usa: ${paisesValidos.join(', ')}`);
    }
    const user = await getUserByChatId(chatId);
    if (!user) return bot.sendMessage(chatId, '❌ Usuario no registrado. Usa /start primero.');
    if (user.credits < 3) return bot.sendMessage(chatId, '❌ No tienes suficientes créditos (necesitas 3).');
    await bot.sendMessage(chatId, `🔄 Generando cookie para ${country}... (esto puede tomar hasta 2 minutos)`);
    try {
        const response = await fetch(`${API_GENCOOKIE_URL}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ country, add_address: true })
        });
        const data = await response.json();
        if (data.success && data.data) {
            const { phone, password, cookie_string, country: ctry } = data.data;
            // Descontar créditos
            await deductCredits(username, 3);
            const newCredits = await getUserByChatId(chatId).then(u => u.credits);
            const mensaje = `🍪 *Cookie Amazon ${ctry} generada*\n\n` +
                            `📞 Teléfono: \`${phone}\`\n` +
                            `🔑 Contraseña: \`${password}\`\n` +
                            `🍪 Cookie:\n\`\`\`\n${cookie_string}\n\`\`\`\n` +
                            `💰 Créditos restantes: ${newCredits}\n` +
                            `⚠️ Guarda esta información, no se volverá a mostrar.`;
            await bot.sendMessage(chatId, mensaje, { parse_mode: 'Markdown' });
        } else {
            throw new Error(data.error || 'Error desconocido');
        }
    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, `❌ Error generando cookie: ${error.message}`);
    }
});

// /gen <patrón> [cantidad] – Genera tarjetas a partir de un patrón (ej: 549949056298xxxx|05|2029)
bot.onText(/\/gen(?:\s+([^\s|]+\|\d{2}\|\d{2,4})(?:\s+(\d+))?)?/, async (msg, match) => {
    const chatId = msg.chat.id;
    let patron = match[1];
    let cantidad = match[2] ? parseInt(match[2]) : 10;
    if (!patron) {
        return bot.sendMessage(chatId, '❌ Uso: `/gen 549949056298xxxx|05|2029 [cantidad]`', { parse_mode: 'Markdown' });
    }
    if (cantidad > 50) cantidad = 50;
    try {
        const tarjetas = generarTarjetasDesdePatron(patron, cantidad);
        if (tarjetas.length === 0) throw new Error('No se pudo generar ninguna tarjeta');
        const lista = tarjetas.slice(0, 20).map((t, i) => `${i+1}. \`${t}\``).join('\n');
        const resto = tarjetas.length > 20 ? `\n... y ${tarjetas.length - 20} más.` : '';
        await bot.sendMessage(chatId, `🎴 *Tarjetas generadas (${tarjetas.length}):*\n\n${lista}${resto}`, { parse_mode: 'Markdown' });
    } catch (error) {
        bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
});

// /limpiador – Extrae tarjetas de un texto sucio (el usuario responde con el texto)
bot.onText(/\/limpiador/, async (msg) => {
    const chatId = msg.chat.id;
    await bot.sendMessage(chatId, '📝 Envía el texto con las tarjetas (formato sucio).');
    const replyListener = (responseMsg) => {
        if (responseMsg.chat.id === chatId && responseMsg.text && !responseMsg.text.startsWith('/')) {
            const texto = responseMsg.text;
            const tarjetas = filtrarTarjetasDeTexto(texto);
            if (tarjetas.length === 0) {
                bot.sendMessage(chatId, '❌ No se encontraron tarjetas válidas en el texto.');
            } else {
                const lista = tarjetas.slice(0, 30).map((t, i) => `${i+1}. \`${t}\``).join('\n');
                const resto = tarjetas.length > 30 ? `\n... y ${tarjetas.length - 30} más.` : '';
                bot.sendMessage(chatId, `🔍 *Tarjetas encontradas (${tarjetas.length}):*\n\n${lista}${resto}`, { parse_mode: 'Markdown' });
            }
            bot.removeListener('message', replyListener);
        }
    };
    bot.on('message', replyListener);
});

// /extrapolador <bin> – Busca tarjetas por BIN en el backend del extrapolador
bot.onText(/\/extrapolador\s+(\d{6})/, async (msg, match) => {
    const chatId = msg.chat.id;
    const bin = match[1];
    await bot.sendMessage(chatId, `🔍 Buscando tarjetas para BIN ${bin}...`);
    try {
        const response = await fetch(`${API_EXTRAPOLADOR_URL}/api/search-bin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bin })
        });
        const data = await response.json();
        if (data.success && data.data && data.data.length) {
            const lista = data.data.slice(0, 20).map((t, i) => `${i+1}. \`${t}\``).join('\n');
            const resto = data.data.length > 20 ? `\n... y ${data.data.length - 20} más.` : '';
            await bot.sendMessage(chatId, `📊 *Tarjetas encontradas para BIN ${bin} (${data.data.length}):*\n\n${lista}${resto}`, { parse_mode: 'Markdown' });
        } else {
            await bot.sendMessage(chatId, `❌ No se encontraron tarjetas para el BIN ${bin}.`);
        }
    } catch (error) {
        console.error(error);
        await bot.sendMessage(chatId, `❌ Error al consultar el extrapolador: ${error.message}`);
    }
});

// /chk amazon – Información sobre verificación de tarjetas
bot.onText(/\/chk\s+amazon/i, async (msg) => {
    const chatId = msg.chat.id;
    await bot.sendMessage(chatId, 
        `🔍 *Verificación de tarjetas en Amazon*\n\n` +
        `Para verificar tarjetas, utiliza la plataforma web:\n` +
        `👉 https://ciber7erroristaschk.com/gates/amazon.html\n\n` +
        `Allí podrás pegar tus tarjetas y obtener resultados LIVE/DEAD.\n` +
        `*Este bot no realiza verificaciones masivas por ahora.*`,
        { parse_mode: 'Markdown' }
    );
});

bot.onText(/\/creditos/, async (msg) => {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    try {
        const result = await pool.query(
            'SELECT credits, days_remaining FROM users WHERE telegram_id = $1',
            [userId]
        );
        if (result.rows.length === 0) {
            return bot.sendMessage(chatId, '❌ No estás registrado. Usa /start primero.');
        }
        const { credits, days_remaining } = result.rows[0];
        await bot.sendMessage(chatId, `💰 Créditos: ${credits}\n📅 Días restantes: ${days_remaining}`);
    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, '❌ Error al consultar créditos.');
    }
});

// /renovar – Contactar con soporte (redirige a un contacto)
bot.onText(/\/renovar/, async (msg) => {
    const chatId = msg.chat.id;
    // Cambia 'tu_usuario_admin' por el usuario de Telegram del administrador o del seller
    const adminUsername = 'C1ber7errorist4sBot'; // o el que corresponda
    await bot.sendMessage(chatId,
        `🔄 *Renovación de créditos/días*\n\n` +
        `Para renovar, contacta con nuestro soporte:\n` +
        `👉 [@${adminUsername}](https://t.me/${adminUsername})\n\n` +
        `Indica tu usuario (@${msg.from.username}) y la cantidad que deseas.`,
        { parse_mode: 'Markdown', disable_web_page_preview: true }
    );
});

// /id – Ver Chat ID
bot.onText(/\/id/, async (msg) => {
    const chatId = msg.chat.id;
    await bot.sendMessage(chatId, `📋 *Tu Chat ID:* \`${chatId}\``, { parse_mode: 'Markdown' });
});

// /help – Ayuda completa
bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    await bot.sendMessage(chatId,
        `📖 *Ayuda - Comandos disponibles*\n\n` +
        `/start - Vincular tu cuenta y ver estado de servicios\n` +
        `/gencookie MX (o US, CA...) - Generar cookie Amazon (cuesta 3 créditos)\n` +
        `/gen 549949056298xxxx|05|2029 [cantidad] - Generar tarjetas desde patrón\n` +
        `/limpiador - Extraer tarjetas de texto sucio (luego envía el texto)\n` +
        `/extrapolador 549949 - Buscar tarjetas por BIN (6 dígitos)\n` +
        `/chk amazon - Información sobre verificación de tarjetas\n` +
        `/creditos - Ver tus créditos y días restantes\n` +
        `/renovar - Contactar con soporte para recargar\n` +
        `/id - Ver tu Chat ID\n` +
        `/menu - Mostrar este menú interactivo (próximamente)\n` +
        `/help - Mostrar esta ayuda\n\n` +
        `*Nota:* Los comandos /gen y /limpiador no consumen créditos.`,
        { parse_mode: 'Markdown' }
    );
});

// /menu – Menú interactivo con botones (opcional)
bot.onText(/\/menu/, async (msg) => {
    const chatId = msg.chat.id;
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🍪 Generar Cookie', callback_data: 'menu_gencookie' }],
                [{ text: '🎴 Generar Tarjetas (/gen)', callback_data: 'menu_gen' }],
                [{ text: '🧹 Limpiador de texto', callback_data: 'menu_limpiador' }],
                [{ text: '🔍 Extrapolador por BIN', callback_data: 'menu_extrapolador' }],
                [{ text: '💰 Ver créditos', callback_data: 'menu_creditos' }],
                [{ text: '🔄 Renovar', callback_data: 'menu_renovar' }],
                [{ text: '❓ Ayuda', callback_data: 'menu_help' }]
            ]
        }
    };
    await bot.sendMessage(chatId, '📋 *Menú principal* - Selecciona una opción:', { parse_mode: 'Markdown', ...opts });
});

// Manejo de callbacks del menú (responde con instrucciones)
bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const data = callbackQuery.data;
    let respuesta = '';
    switch (data) {
        case 'menu_gencookie':
            respuesta = '📝 *Cómo usar /gencookie:*\n`/gencookie MX` (para México) o `/gencookie US` (para Estados Unidos).\nCuesta 3 créditos.';
            break;
        case 'menu_gen':
            respuesta = '📝 *Cómo usar /gen:*\n`/gen 549949056298xxxx|05|2029 [cantidad]`\nEjemplo: `/gen 549949056298xxxx|05|2029 15` genera 15 tarjetas con ese patrón.';
            break;
        case 'menu_limpiador':
            respuesta = '📝 *Cómo usar /limpiador:*\nEnvía `/limpiador` y luego responde con el texto sucio que contiene las tarjetas. El bot extraerá las que tengan formato 16|MM|AAAA|CVV.';
            break;
        case 'menu_extrapolador':
            respuesta = '📝 *Cómo usar /extrapolador:*\n`/extrapolador 549949` (6 dígitos). El bot buscará tarjetas reales asociadas a ese BIN.';
            break;
        case 'menu_creditos':
            respuesta = '💰 Usa `/creditos` para ver tus créditos y días restantes.';
            break;
        case 'menu_renovar':
            respuesta = '🔄 Usa `/renovar` para obtener el contacto de soporte y recargar.';
            break;
        case 'menu_help':
            respuesta = '❓ Usa `/help` para ver la lista completa de comandos.';
            break;
        default:
            respuesta = 'Opción no válida.';
    }
    await bot.sendMessage(chatId, respuesta, { parse_mode: 'Markdown' });
    await bot.answerCallbackQuery(callbackQuery.id);
});

// ========== FUNCIONES EXISTENTES (para compatibilidad con el sistema de verificación) ==========
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

module.exports = { bot, sendVerificationCodeToUser, sendLiveToTelegram };