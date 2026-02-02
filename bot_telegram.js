// telegram-bot.js - PARTE MODIFICADA

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username; // "BucleEterno8" (sin @)
    const firstName = msg.from.first_name || '';
    
    console.log(`🔔 /start recibido de: @${username} (Chat ID: ${chatId})`);
    
    try {
        // Verificar si ya existe en BD
        const userResult = await pool.query(
            'SELECT id, is_active FROM users WHERE username = $1',
            [username]
        );
        
        if (userResult.rows.length === 0) {
            // Usuario NO existe, crear registro INCOMPLETO (solo chat_id)
            await pool.query(
                `INSERT INTO users 
                 (username, telegram_username, telegram_chat_id, created_at)
                 VALUES ($1, $2, $3, NOW())
                 ON CONFLICT (username) 
                 DO UPDATE SET telegram_chat_id = $3, updated_at = NOW()`,
                [username, `@${username}`, chatId]
            );
            
            console.log(`✅ Chat ID guardado para @${username}: ${chatId}`);
            
        } else {
            // Usuario YA existe, actualizar chat_id
            await pool.query(
                `UPDATE users 
                 SET telegram_chat_id = $1, updated_at = NOW()
                 WHERE username = $2`,
                [chatId, username]
            );
            
            console.log(`✅ Chat ID actualizado para @${username}: ${chatId}`);
        }
        
        // Enviar mensaje de bienvenida
        await bot.sendMessage(
            chatId,
            `👋 *¡Hola ${firstName}!*\n\n` +
            `He guardado tu Chat ID: \`${chatId}\`\n\n` +
            `*Ahora puedes registrarte en la web:*\n` +
            `1. Ve a la página https://ciber7erroristaschk.com/login.html\n` +
            `2. Usa tu usuario: *@${username}*\n` +
            `3. Recibirás el código de verificación aquí\n\n` +
            `꧁⎝ 𓆩༺✧༻𓆪 ⎠꧂¡Te esperamos! ꧁⎝ 𓆩༺✧༻𓆪 ⎠꧂`,
            { parse_mode: 'Markdown' }
        );
        
    } catch (error) {
        console.error('❌ Error en /start:', error);
        await bot.sendMessage(
            chatId,
            '❌ Hubo un error procesando tu solicitud. Intenta más tarde.'
        );
    }
});