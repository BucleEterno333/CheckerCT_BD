require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 8080; 

// Middleware SIMPLIFICADO temporalmente
app.use(cors({
    origin: 'https://ciber7erroristaschk.com',
    credentials: true,
    optionsSuccessStatus: 200
}));
app.use(express.json());

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
const telegramRoutes = require('./routes/telegram'); // 👈 NUEVA LÍNEA
const userRoutes = require ('./routes/user')

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/seller', sellerRoutes);
app.use('/api/lives', livesRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/telegram', telegramRoutes); // 👈 NUEVA LÍNEA
app.use('/api/user', userRoutes); // 👈 NUEVA LÍNEA



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

const cron = require('node-cron');

// ========== CRON JOB: RESTAR 1 DÍA A TODOS LOS USUARIOS A LAS 12:01 AM ==========
// Programa la tarea para que se ejecute todos los días a las 00:01 (12:01 AM)
cron.schedule('1 0 * * *', async () => {
    console.log('🕒 Ejecutando tarea programada: restando 1 día a todos los usuarios...');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Restar 1 día a todos los usuarios que tengan days_remaining > 0
        const result = await client.query(
            `UPDATE users 
             SET days_remaining = GREATEST(0, days_remaining - 1),
                 updated_at = NOW()
             WHERE days_remaining > 0
             RETURNING id, username, days_remaining`
        );
        
        // Registrar la operación en una tabla de logs (opcional)
        await client.query(
            `INSERT INTO system_logs (action, details, created_at)
             VALUES ('daily_days_decrement', $1, NOW())`,
            [JSON.stringify({
                affected_users: result.rowCount,
                timestamp: new Date().toISOString()
            })]
        );
        
        await client.query('COMMIT');
        console.log(`✅ Días actualizados para ${result.rowCount} usuarios.`);
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error al actualizar días:', error);
    } finally {
        client.release();
    }
}, {
    scheduled: true,
    timezone: "America/Mexico_City"  // Ajusta a tu zona horaria
});

console.log('⏰ Tarea programada: restar 1 día a las 12:01 AM (hora CDMX)');

startServer();