require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { pool, initDatabase } = require('./database');

const app = express();

const PORT = process.env.PORT || 8080; 
const cron = require('node-cron');
const { sendSafeMessage } = require('./bot_telegram');


// Configuración de CORS mejorada
const corsOptions = {
    origin: function (origin, callback) {
        // Permitir solicitudes desde astralchk.com y también desde el mismo origen
        const allowedOrigins = ['https://astralchk.com', 'https://site--checkerct--slm72jkyf6vq.code.run'];
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Origen no permitido por CORS'));
        }
    },
    credentials: true,
    optionsSuccessStatus: 200,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']
};

// Aplica CORS a todas las rutas (incluyendo OPTIONS)
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));  // Manejo explícito de preflight

// 2. Parseo de JSON (IMPORTANTE: ANTES de las rutas)
app.use(express.json());
app.use(optionalAuth);   // <-- Aquí

app.use(express.urlencoded({ extended: true }));




// RUTA RAIZ - IMPORTANTE
app.get('/', (req, res) => {
    res.json({ 
        message: 'CheckerCT API - Running',
        timestamp: new Date().toISOString(),
        endpoints: [
            '/api/health',
            '/api/auth/login',
            '/api/auth/register',
            '/api/lives',
            '/api/accounts',
            '/api/user'
        ]
    });
});

// Health check
app.get('/api/health', async (req, res) => {
    res.json({ 
        status: 'healthy',
        service: 'checkerct-api',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Importar y usar rutas
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const sellerRoutes = require('./routes/seller');
const livesRoutes = require('./routes/lives');
const accountsRoutes = require('./routes/accounts');
const telegramRoutes = require('./routes/telegram');
const userRoutes = require ('./routes/user')
const contactsRoutes = require('./routes/contacts');
const userAccountsRoutes = require('./routes/user-accounts');
const userResponsesRoutes = require('./routes/user-responses');
const contactsRouter = require('./routes/contacts');
const numbersRouter = require('./routes/numbers');
const emailsRouter = require('./routes/emails');
const pagesRouter = require('./routes/pages');
const gatesRouter = require('./routes/gates');
const userPagesRouter = require('./routes/user-pages');
const accountActionsRouter = require('./routes/account-actions');
const devicesRouter = require('./routes/devices');
const settingsRoutes = require('./routes/settings');

app.use('/api/settings', settingsRoutes);
app.use('/api/devices', devicesRouter);
app.use('/api/accounts', accountActionsRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/numbers', numbersRouter);
app.use('/api/emails', emailsRouter);
app.use('/api/pages', pagesRouter);
app.use('/api/gates', gatesRouter);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/seller', sellerRoutes);
app.use('/api/lives', livesRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/telegram', telegramRoutes); 
app.use('/api/user', userRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/user-accounts', userAccountsRoutes);
app.use('/api/user-responses', userResponsesRoutes);
app.use('/api/user-pages', userPagesRouter);



// Inicializar servidor
const startServer = async () => {
    try {
        console.log('🔄 Inicializando base de datos...');
        await initDatabase();
        console.log('✅ Base de datos lista');

        // INICIAR BOT DE TELEGRAM
        const { bot } = require('./bot_telegram');
        console.log('🤖 Bot de Telegram listo para recibir /start');
        
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 API CheckerCT ejecutándose en http://0.0.0.0:${PORT}`);
            console.log(`🌐 Públicamente en: https://site--checkerct--slm72jkyf6vq.code.run`);
            console.log(`✅ Health check: https://site--checkerct--slm72jkyf6vq.code.run/api/health`);
            console.log(`👑 Admin: admin / ${process.env.ADMIN_PASSWORD || 'admin123'}`);
        });
    } catch (error) {
        console.error('❌ Error crítico:', error);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
};




cron.schedule('1 0 * * *', async () => {
    console.log('🕒 Ejecutando tarea programada: restando 1 día a todos los usuarios...');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Restar 1 día a todos los usuarios con days_remaining > 0
        const result = await client.query(
            `UPDATE users 
             SET days_remaining = GREATEST(0, days_remaining - 1),
                 updated_at = NOW()
             WHERE days_remaining > 0
             RETURNING id, username, days_remaining`
        );
        
        // Identificar usuarios que llegaron a 0 días exactamente después de la resta
        const usersAtZero = result.rows.filter(u => u.days_remaining === 0);
        
        if (usersAtZero.length > 0) {
            console.log(`⚠️ ${usersAtZero.length} usuarios llegaron a 0 días. Expulsando del grupo...`);
            const { bot } = require('./bot_telegram');
            const GROUP_CHAT_ID = process.env.GROUP_CHAT_ID;
            if (bot && GROUP_CHAT_ID) {
                for (const user of usersAtZero) {
                    // Obtener telegram_id del usuario
                    const tgRes = await client.query('SELECT telegram_id FROM users WHERE id = $1', [user.id]);
                    const telegramId = tgRes.rows[0]?.telegram_id;
                    if (telegramId) {
                        try {
                            await bot.telegram.kickChatMember(GROUP_CHAT_ID, telegramId);
                            console.log(`✅ Usuario ${user.username} (${telegramId}) expulsado por días 0`);
                            // Opcional: enviar mensaje privado
                            await sendSafeMessage(telegramId, '❌ Tus días han expirado. Has sido expulsado del grupo. Contacta al admin para renovar.');
                        } catch (err) {
                            console.error(`Error expulsando a ${telegramId}:`, err.message);
                        }
                    }
                }
            }
        }
        
        // Opcional: registrar solo si quieres, pero sin tabla system_logs puedes omitir
        console.log(`✅ Días actualizados para ${result.rowCount} usuarios. (${usersAtZero.length} llegaron a 0)`);
        
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error al actualizar días:', error);
    } finally {
        client.release();
    }
}, {
    scheduled: true,
    timezone: "America/Mexico_City"
});

console.log('⏰ Tarea programada: restar 1 día a las 12:01 AM (hora CDMX)');

startServer();