require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 8080; 

// Middleware SIMPLIFICADO temporalmente
app.use(cors()); // ✅ Permite todo temporalmente para debugging
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
            '/api/accounts'
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

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/seller', sellerRoutes);
app.use('/api/lives', livesRoutes);
app.use('/api/accounts', accountsRoutes);

// Inicializar servidor
const startServer = async () => {
    try {
        console.log('🔄 Inicializando base de datos...');
        await initDatabase();
        console.log('✅ Base de datos lista');
        
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

startServer();