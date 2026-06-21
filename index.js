require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { pool, initDatabase } = require('./database');
const { optionalAuth } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 8080;

// ========== CONFIGURACIÓN CORS (CORREGIDA) ==========
const corsOptions = {
    origin: [
        'https://astralchk.com',
        'http://localhost:3000',
        'http://127.0.0.1:5500'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Device-Fingerprint',
        'x-bot-key'
    ],
    credentials: true,
    optionsSuccessStatus: 200
};

// ✅ APLICAR CORS A TODAS LAS RUTAS
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ========== MIDDLEWARES DE PARSEO ==========
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ========== MIDDLEWARE DE AUTENTICACIÓN OPCIONAL ==========
app.use(optionalAuth);

// ========== RUTA RAIZ ==========
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

// ========== HEALTH CHECK ==========
app.get('/api/health', async (req, res) => {
    res.json({
        status: 'healthy',
        service: 'checkerct-api',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// ========== RUTAS ==========
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const sellerRoutes = require('./routes/seller');
const livesRoutes = require('./routes/lives');
const accountsRoutes = require('./routes/accounts');
const telegramRoutes = require('./routes/telegram');
const userRoutes = require('./routes/user');
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

// Montar rutas
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
app.use('/api/user', userRoutes); // <-- RUTAS DE USUARIO (incluye /users/all)
app.use('/api/contacts', contactsRoutes);
app.use('/api/user-accounts', userAccountsRoutes);
app.use('/api/user-responses', userResponsesRoutes);
app.use('/api/user-pages', userPagesRouter);

// ========== INICIO DEL SERVIDOR ==========
const startServer = async () => {
    try {
        console.log('🔄 Inicializando base de datos...');
        await initDatabase();
        console.log('✅ Base de datos lista');

        // Iniciar bot de Telegram
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

console.log('⏰ Tarea programada: restar 1 día a las 12:01 AM (hora CDMX)');

startServer();