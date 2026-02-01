require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
    origin: ['https://ciber7erroristaschk.com', 'http://localhost:5500'],
    credentials: true
}));
app.use(express.json());

// Conexión a Neon PostgreSQL
const pool = new Pool({
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432,
    ssl: { rejectUnauthorized: false }
});

// Verificar conexión
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Error conectando a PostgreSQL:', err);
    } else {
        console.log('✅ Conectado a PostgreSQL Neon');
        release();
    }
});

// Rutas básicas de prueba
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'checkerct-api'
    });
});

app.get('/api/test-db', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW() as time');
        res.json({ success: true, time: result.rows[0].time });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Aquí importarás las rutas reales después
// app.use('/api/auth', require('./routes/auth'));
// app.use('/api/lives', require('./routes/lives'));

app.listen(PORT, () => {
    console.log(`🚀 Servidor API en puerto ${PORT}`);
});