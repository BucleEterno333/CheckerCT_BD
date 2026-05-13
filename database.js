const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432,
    ssl: { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

const initDatabase = async () => {
    try {
        // ============================================
        // 1. TABLAS DE USUARIOS Y AUTENTICACIÓN
        // ============================================
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                telegram_username VARCHAR(50) UNIQUE,
                telegram_verified BOOLEAN DEFAULT FALSE,
                verified_at TIMESTAMP,
                password_hash VARCHAR(255) NOT NULL,
                display_name VARCHAR(100),
                credits INTEGER DEFAULT 4,
                days_remaining INTEGER DEFAULT 0,
                role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('admin', 'seller', 'user')),
                total_checks INTEGER DEFAULT 0,
                total_lives INTEGER DEFAULT 0,
                created_by INTEGER REFERENCES users(id),
                is_active BOOLEAN DEFAULT TRUE,
                last_login TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                total_credited_users INTEGER DEFAULT 0,
                total_credits_given INTEGER DEFAULT 0,
                total_days_given INTEGER DEFAULT 0,
                seller_since TIMESTAMP,
                last_credited_user_id INTEGER REFERENCES users(id),
                last_credited_date TIMESTAMP,
                notes TEXT
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS credit_transactions (
                id SERIAL PRIMARY KEY,
                from_user_id INTEGER REFERENCES users(id),
                to_user_id INTEGER REFERENCES users(id) NOT NULL,
                transaction_type VARCHAR(20) CHECK (transaction_type IN ('credits', 'days', 'role_change')),
                amount INTEGER NOT NULL,
                previous_amount INTEGER,
                new_amount INTEGER,
                old_role VARCHAR(20),
                new_role VARCHAR(20),
                reason TEXT,
                ip_address INET,
                user_agent TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // ============================================
        // 2. TABLAS DE PLATAFORMAS Y CHECKERS
        // ============================================
        await pool.query(`
            CREATE TABLE IF NOT EXISTS pages (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) UNIQUE NOT NULL,
                display_name VARCHAR(200),
                allows_associate BOOLEAN DEFAULT FALSE,
                requires_login_number BOOLEAN DEFAULT FALSE,
                requires_2fa BOOLEAN DEFAULT FALSE,
                category VARCHAR(50),
                country_code VARCHAR(10),
                base_url TEXT,
                is_active BOOLEAN DEFAULT TRUE,
                login_type VARCHAR(20) DEFAULT 'email',
                verification VARCHAR(20) DEFAULT 'none',
                allow_card_association BOOLEAN DEFAULT TRUE,
                has_3d BOOLEAN DEFAULT FALSE,
                is_bineable BOOLEAN DEFAULT TRUE,
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabla de respuestas (ahora unificada y con campos del frontend)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS page_responses (
                id SERIAL PRIMARY KEY,
                page_id INTEGER REFERENCES pages(id) ON DELETE CASCADE,
                user_page_id INTEGER REFERENCES user_pages(id) ON DELETE CASCADE,
                response_text VARCHAR(500) NOT NULL,
                code VARCHAR(50),
                reason TEXT,
                solution TEXT,
                cloudinary_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CHECK ((page_id IS NOT NULL AND user_page_id IS NULL) OR (page_id IS NULL AND user_page_id IS NOT NULL))
            )
        `);

        // Tabla user_pages (páginas personales)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_pages (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
                name VARCHAR(100) NOT NULL,
                login_type VARCHAR(20) DEFAULT 'email',
                verification VARCHAR(20) DEFAULT 'none',
                allow_card_association BOOLEAN DEFAULT TRUE,
                has_3d BOOLEAN DEFAULT FALSE,
                is_bineable BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, name)
            )
        `);

        // Tablas de checkers, gates, phone_numbers, devices, user_accounts, user_lives, etc.
        // (Mantén el resto de tus tablas igual, solo actualiza page_responses)
        
        // ====== EL RESTO DE TUS TABLAS (sin cambios) ======
        // ... (copia aquí el resto de tus CREATE TABLE, índices, etc., pero omite la creación duplicada de page_responses)
        
        // ============================================
        // ÍNDICES (mantén los que tenías)
        // ============================================
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_page_responses_page ON page_responses(page_id);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_page_responses_user_page ON page_responses(user_page_id);`);
        
        // ============================================
        // DATOS POR DEFECTO (sin páginas duplicadas)
        // ============================================
        // ❌ NO INSERTES PÁGINAS POR DEFECTO (YA EXISTEN)
        // Si quieres asegurar que existan, usa ON CONFLICT con nombre normalizado
        
        // Insertar checkers por defecto
        const defaultCheckers = [
            {name: 'Shadow', type: 'premium'},
            {name: 'Cronos', type: 'premium'},
            {name: 'Moon', type: 'regular'}
        ];
        for (const checker of defaultCheckers) {
            await pool.query(
                `INSERT INTO checkers (name, type) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING`,
                [checker.name, checker.type]
            );
        }
        
        // Usuario admin
        const bcrypt = require('bcryptjs');
        const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
        const adminHash = await bcrypt.hash(adminPassword, 10);
        await pool.query(`
            INSERT INTO users 
            (username, password_hash, display_name, credits, days_remaining, role, is_active, telegram_verified)
            VALUES ('admin', $1, 'Administrador', 999999, 9999, 'admin', TRUE, TRUE)
            ON CONFLICT (username) DO NOTHING
        `, [adminHash]);

        console.log('✅ Base de datos inicializada con la nueva estructura');
    } catch (error) {
        console.error('❌ Error inicializando base de datos:', error);
        throw error;
    }
};

// Obtener el valor de una configuración
async function getSetting(key, defaultValue = true) {
    const result = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
    if (result.rows.length === 0) return defaultValue;
    return result.rows[0].value;
}

// Actualizar una configuración (solo admins deberían llamar esto)
async function setSetting(key, value, userId = null) {
    await pool.query(
        `INSERT INTO settings (key, value, updated_by, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value,
             updated_by = EXCLUDED.updated_by,
             updated_at = NOW()`,
        [key, value, userId]
    );
    return true;
}

module.exports = { pool, initDatabase, getSetting, setSetting };

