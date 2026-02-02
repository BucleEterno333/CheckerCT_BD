// database.js - Tablas mejoradas
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
        // Tabla de usuarios con roles
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                display_name VARCHAR(100),
                credits INTEGER DEFAULT 20, -- Nuevos: 20 créditos
                days_remaining INTEGER DEFAULT 7, -- Nuevos: 7 días
                role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('admin', 'seller', 'user')),
                total_checks INTEGER DEFAULT 0,
                total_lives INTEGER DEFAULT 0,
                created_by INTEGER REFERENCES users(id), -- Quién creó esta cuenta
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP,
                is_active BOOLEAN DEFAULT TRUE,
                notes TEXT,
                
                -- Campos para sellers
                total_credited_users INTEGER DEFAULT 0,
                total_credits_given INTEGER DEFAULT 0,
                total_days_given INTEGER DEFAULT 0,
                seller_since TIMESTAMP,
                
                -- Campos para tracking
                last_credited_user_id INTEGER REFERENCES users(id),
                last_credited_date TIMESTAMP
            )
        `);

        // Tabla de transacciones de créditos/días
        await pool.query(`
            CREATE TABLE IF NOT EXISTS credit_transactions (
                id SERIAL PRIMARY KEY,
                from_user_id INTEGER REFERENCES users(id), -- Seller/Admin que da
                to_user_id INTEGER REFERENCES users(id) NOT NULL, -- Usuario que recibe
                transaction_type VARCHAR(20) CHECK (transaction_type IN ('credits', 'days', 'role_change')),
                amount INTEGER NOT NULL, -- Cantidad de créditos/días
                previous_amount INTEGER, -- Cantidad anterior
                new_amount INTEGER, -- Cantidad nueva
                old_role VARCHAR(20), -- Rol anterior (para cambios de rol)
                new_role VARCHAR(20), -- Rol nuevo
                reason TEXT,
                ip_address INET,
                user_agent TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                
                CHECK (
                    (transaction_type IN ('credits', 'days') AND amount > 0) OR
                    (transaction_type = 'role_change' AND old_role IS NOT NULL AND new_role IS NOT NULL)
                )
            )
        `);

        // Tabla de lives (actualizada con user_id)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_lives (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
                user_email VARCHAR(100), -- Email del checker (si aplica)
                card_full VARCHAR(50) NOT NULL,
                card_last_four CHAR(4) NOT NULL,
                card_bin CHAR(6) NOT NULL,
                gate_used VARCHAR(50) NOT NULL,
                check_date DATE NOT NULL,
                check_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status VARCHAR(20) DEFAULT 'live',
                phase VARCHAR(20) DEFAULT 'pending',
                bank_name VARCHAR(100),
                country VARCHAR(50),
                card_type VARCHAR(20),
                associated_platform VARCHAR(50),
                associated_account VARCHAR(100),
                associated_date DATE,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabla de logs de actividades
        await pool.query(`
            CREATE TABLE IF NOT EXISTS activity_logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                action_type VARCHAR(50) NOT NULL,
                target_user_id INTEGER REFERENCES users(id),
                details JSONB,
                ip_address INET,
                user_agent TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabla de cuentas
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_accounts (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                platform VARCHAR(50) NOT NULL,
                account_name VARCHAR(100),
                account_email VARCHAR(100),
                account_phone VARCHAR(20),
                device_name VARCHAR(50),
                status VARCHAR(20) DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_used TIMESTAMP
            )
        `);

        // Tabla de acciones
        await pool.query(`
            CREATE TABLE IF NOT EXISTS live_actions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                live_id INTEGER REFERENCES user_lives(id) ON DELETE CASCADE,
                account_id INTEGER REFERENCES user_accounts(id) ON DELETE SET NULL,
                action_type VARCHAR(30) NOT NULL,
                amount DECIMAL(10,2),
                currency CHAR(3) DEFAULT 'USD',
                platform VARCHAR(50),
                response_code VARCHAR(50),
                response_message TEXT,
                rest_days INTEGER,
                transferred_to VARCHAR(100),
                direct_payment BOOLEAN DEFAULT TRUE,
                action_date DATE NOT NULL,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);


        // Tabla de Checkers
        await pool.query(`
            CREATE TABLE IF NOT EXISTS checkers (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) UNIQUE NOT NULL, -- Shadow, Cronos, Moon
        `);

        // Tabla de gates
        await pool.query(`
            CREATE TABLE IF NOT EXISTS pages (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) UNIQUE NOT NULL, -- Dragon 
                checker VARCHAR(50), -- Shadow, Cronos, Moon
        `);

        // Tabla de páginas
        await pool.query(`
            CREATE TABLE IF NOT EXISTS pages (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) UNIQUE NOT NULL,
                category VARCHAR(50), -- amazon, shopify, aliexpress, etc
        `);


        // Tabla de respuestas comunes por página
        await pool.query(`
            CREATE TABLE IF NOT EXISTS page_responses (
                id SERIAL PRIMARY KEY,
                page_id INTEGER REFERENCES pages(id) ON DELETE CASCADE,
                response_text VARCHAR(200) NOT NULL,
                response_type VARCHAR(50), -- 3d, insufficient_funds, generic, etc
                is_common BOOLEAN DEFAULT TRUE,
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(page_id, response_text)
            )
        `);

        // Tabla de cuentas de usuarios (ML, Amazon, etc)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_accounts (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
                platform VARCHAR(100) NOT NULL, -- MercadoLibre, Amazon, etc
                account_name VARCHAR(200), -- ML1, ALI2, UBR3, SHN4
                account_email VARCHAR(200),
                account_phone VARCHAR(50),
                associated_cards DECIMAL(10,2),
                orders_shipped DECIMAL(10,2),
                device_name VARCHAR(100), -- Celular amarillo, Poco F7, etc
                status VARCHAR(50) DEFAULT 'active', -- active, banned, limited, etc
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_used TIMESTAMP,
                notes TEXT,
            )
        `);

        //  Tabla de productos comprados por cuenta
        await pool.query(`
            CREATE TABLE IF NOT EXISTS account_purchases (
                id SERIAL PRIMARY KEY,
                account_id INTEGER REFERENCES user_accounts(id) ON DELETE CASCADE,
                product_id VARCHAR(100), -- ID del producto en la plataforma
                product_name VARCHAR(500) NOT NULL,
                product_url TEXT,
                purchase_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                unit_price DECIMAL(10,2),
                quantity INTEGER DEFAULT 1,
                total_amount DECIMAL(10,2) GENERATED ALWAYS AS (unit_price * quantity) STORED,
                status VARCHAR(50) DEFAULT 'pending', -- pending, shipped, delivered, cancelled
                tracking_number VARCHAR(100),
                estimated_delivery DATE,
                actual_delivery DATE,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(account_id, product_id, purchase_date) -- Evitar duplicados
            );
        `);

        

        // Tabla de acciones para lives (MUY IMPORTANTE)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS live_actions (
                id SERIAL PRIMARY KEY,
                live_id INTEGER REFERENCES user_lives(id) ON DELETE CASCADE NOT NULL,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
                account_id INTEGER REFERENCES user_accounts(id) ON DELETE SET NULL,
                
                action_type VARCHAR(50) NOT NULL CHECK (
                    action_type IN (
                        'live_obtained',
                        'payment_declined', 
                        'payment_approved',
                        'transferred_to_other',
                        'associated_account',
                        'account_created',
                        'manual_note'
                    )
                ),
                
                -- Campos específicos por tipo de acción
                page_id INTEGER REFERENCES pages(id), -- Página donde ocurrió
                page_name VARCHAR(100), -- Por si no existe en pages
                amount DECIMAL(10,2), -- Monto
                currency CHAR(3) DEFAULT 'USD',
                
                -- Para pagos aprobados
                product_name VARCHAR(200),
                is_direct_payment BOOLEAN DEFAULT TRUE,
                rest_days INTEGER, -- Días de reposo
                
                -- Para pagos declinados
                response_id INTEGER REFERENCES page_responses(id),
                response_text VARCHAR(200), -- Respuesta específica
                
                -- Para transferencias a otros
                transferred_to VARCHAR(200), -- A quién se transfirió
                transfer_result VARCHAR(50), -- approved, declined, unknown
                
                -- Fechas importantes
                action_date DATE NOT NULL,
                action_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                
                -- Dispositivo/información adicional
                device_used VARCHAR(100),
                additional_info JSONB, -- Para datos extra no estructurados
                
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Índices para mejor performance
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_live_actions_live ON live_actions(live_id);
            CREATE INDEX IF NOT EXISTS idx_live_actions_user ON live_actions(user_id);
            CREATE INDEX IF NOT EXISTS idx_live_actions_type ON live_actions(action_type);
            CREATE INDEX IF NOT EXISTS idx_live_actions_date ON live_actions(action_date DESC);
            CREATE INDEX IF NOT EXISTS idx_user_accounts_user ON user_accounts(user_id);
            CREATE INDEX IF NOT EXISTS idx_user_accounts_platform ON user_accounts(platform);
        `);

        // Insertar páginas comunes por defecto
        const defaultPages = [
            'Amazon MX', 'Amazon US', 'Shadow Dragon', 
            'AliExpress', 'Miatt', 'MercadoLibre',
            'Shopify', 'Walmart', 'BestBuy', 'Ebay'
        ];
        
        for (const page of defaultPages) {
            await pool.query(
                `INSERT INTO pages (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
                [page]
            );
        }

        // Insertar respuestas comunes
        const defaultResponses = [
            { page: 'AliExpress', response: '3D Secure Authentication Required', type: '3d' },
            { page: 'AliExpress', response: 'Insufficient Funds', type: 'insufficient_funds' },
            { page: 'Amazon MX', response: 'Tarjeta declinada', type: 'declined' },
            { page: 'Amazon MX', response: 'CVV incorrecto', type: 'cvv' },
            { page: 'Shadow Dragon', response: 'Live', type: 'live' },
            { page: 'Shadow Dragon', response: 'Die', type: 'die' },
            { page: 'MercadoLibre', response: 'Pago no autorizado', type: 'unauthorized' },
            { page: 'MercadoLibre', response: 'Error en procesamiento', type: 'processing_error' }
        ];

        for (const resp of defaultResponses) {
            const pageResult = await pool.query(
                'SELECT id FROM pages WHERE name = $1',
                [resp.page]
            );
            
            if (pageResult.rows[0]) {
                await pool.query(
                    `INSERT INTO page_responses (page_id, response_text, response_type) 
                     VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
                    [pageResult.rows[0].id, resp.response, resp.type]
                );
            }
        }

        // Índices para performance
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_user_lives_user_id ON user_lives(user_id);
            CREATE INDEX IF NOT EXISTS idx_user_lives_bin ON user_lives(card_bin);
            CREATE INDEX IF NOT EXISTS idx_user_lives_status ON user_lives(status);
            CREATE INDEX IF NOT EXISTS idx_user_lives_check_date ON user_lives(check_date DESC);
            CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
            CREATE INDEX IF NOT EXISTS idx_users_created_by ON users(created_by);
            CREATE INDEX IF NOT EXISTS idx_credit_transactions_from ON credit_transactions(from_user_id);
            CREATE INDEX IF NOT EXISTS idx_credit_transactions_to ON credit_transactions(to_user_id);
            CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);
        `);
        
        
        
        // Tabla de códigos de verificación
await pool.query(`
    CREATE TABLE IF NOT EXISTS verification_codes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        code VARCHAR(6) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        used BOOLEAN DEFAULT FALSE,
        
        UNIQUE(user_id, code)
    )
`);

// Tabla de logs de verificación
await pool.query(`
    CREATE TABLE IF NOT EXISTS verification_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        code VARCHAR(6),
        sent_via VARCHAR(20) DEFAULT 'telegram',
        status VARCHAR(20) DEFAULT 'sent',
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`);

// Tabla de recuperación de contraseñas
await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_codes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        code VARCHAR(6) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`);

// Modificar tabla users para agregar campos de Telegram
await pool.query(`
    ALTER TABLE users 
    ADD COLUMN IF NOT EXISTS telegram_username VARCHAR(50),
    ADD COLUMN IF NOT EXISTS telegram_verified BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT FALSE
`);

// Índices para mejor performance
await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_verification_codes_user ON verification_codes(user_id);
    CREATE INDEX IF NOT EXISTS idx_verification_codes_expires ON verification_codes(expires_at);
    CREATE INDEX IF NOT EXISTS idx_verification_logs_user ON verification_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_password_reset_codes_user ON password_reset_codes(user_id);
    CREATE INDEX IF NOT EXISTS idx_users_telegram ON users(telegram_username);
    CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
`);



// Crear usuario admin por defecto si no existe (ya verificado)
const bcrypt = require('bcryptjs');
const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
const adminHash = await bcrypt.hash(adminPassword, 10);

await pool.query(`
    INSERT INTO users 
    (username, telegram_username, password_hash, display_name, 
     credits, days_remaining, role, is_active, telegram_verified, 
     verified_at, created_at)
    VALUES ('admin', 'admin', $1, 'Administrador', 
            999999, 9999, 'admin', TRUE, TRUE, 
            NOW(), NOW())
    ON CONFLICT (username) 
    DO UPDATE SET 
        telegram_verified = TRUE,
        is_active = TRUE
`, [adminHash]);

        console.log('✅ Base de datos inicializada correctamente');
        console.log('👑 Usuario admin: admin / ' + (process.env.ADMIN_PASSWORD || 'admin123'));

    } catch (error) {
        console.error('❌ Error inicializando base de datos:', error);
        throw error;
    }
};

module.exports = { pool, initDatabase };
