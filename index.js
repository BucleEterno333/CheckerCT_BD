// index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [
        'https://ciber7erroristaschk.com',
        'http://localhost:5500',
        'http://localhost:3000'
    ],
    credentials: true
}));

app.use(express.json());

// Importar rutas
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const sellerRoutes = require('./routes/seller');
const livesRoutes = require('./routes/lives');
const accountsRoutes = require('./routes/accounts');

// Usar rutas
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/seller', sellerRoutes);
app.use('/api/lives', livesRoutes);
app.use('/api/accounts', accountsRoutes);

// Health check
app.get('/api/health', async (req, res) => {
    res.json({ 
        status: 'healthy',
        service: 'checkerct-api',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Inicializar servidor
const startServer = async () => {
    try {
        await initDatabase();
        
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 API CheckerCT ejecutándose en puerto ${PORT}`);
            console.log(`✅ Health check: http://localhost:${PORT}/api/health`);
            console.log(`🔐 Registro: POST http://localhost:${PORT}/api/auth/register`);
            console.log(`🔑 Login: POST http://localhost:${PORT}/api/auth/login`);
            console.log(`💳 Lives: GET http://localhost:${PORT}/api/lives`);
            console.log(`👤 Cuentas: GET http://localhost:${PORT}/api/accounts`);
            console.log(`👑 Admin: username: admin, password: ${process.env.ADMIN_PASSWORD || 'admin123'}`);
        });
    } catch (error) {
        console.error('❌ Error al iniciar servidor:', error);
        process.exit(1);
    }
};

startServer();