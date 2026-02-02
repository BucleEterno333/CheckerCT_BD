// database.js - CORREGIDO Y ORGANIZADO
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
        
        // Tabla de usuarios con roles
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                telegram_username VARCHAR(50) UNIQUE,
                telegram_verified BOOLEAN DEFAULT FALSE,
                verified_at TIMESTAMP,
                password_hash VARCHAR(255) NOT NULL,
                display_name VARCHAR(100),
                credits INTEGER DEFAULT 20,
                days_remaining INTEGER DEFAULT 7,
                role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('admin', 'seller', 'user')),
                total_checks INTEGER DEFAULT 0,
                total_lives INTEGER DEFAULT 0,
                created_by INTEGER REFERENCES users(id),
                is_active BOOLEAN DEFAULT TRUE,
                last_login TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                
                -- Campos para sellers
                total_credited_users INTEGER DEFAULT 0,
                total_credits_given INTEGER DEFAULT 0,
                total_days_given INTEGER DEFAULT 0,
                seller_since TIMESTAMP,
                last_credited_user_id INTEGER REFERENCES users(id),
                last_credited_date TIMESTAMP,
                notes TEXT
            )
        `);

        // Tabla de transacciones
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
        
        // Tabla de PÁGINAS/E-COMMERCE (Amazon, ML, AliExpress)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS pages (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) UNIQUE NOT NULL, -- amazon, mercadolibre, aliexpress
                display_name VARCHAR(200),
                allows_associate BOOLEAN DEFAULT FALSE,
                requires_login_number BOOLEAN DEFAULT FALSE,
                requires_2fa BOOLEAN DEFAULT FALSE,
                category VARCHAR(50), -- 'ecommerce', 'gaming', 'streaming'
                country_code VARCHAR(10),
                base_url TEXT,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabla de respuestas específicas por página
        await pool.query(`
            CREATE TABLE IF NOT EXISTS page_responses (
                id SERIAL PRIMARY KEY,
                page_id INTEGER REFERENCES pages(id) ON DELETE CASCADE NOT NULL,
                response_code VARCHAR(50) NOT NULL, -- Código interno: '3d_secure', 'insufficient_funds'
                response_text VARCHAR(500) NOT NULL, -- Texto real: "3D Secure required"
                is_success BOOLEAN DEFAULT FALSE,
                requires_action BOOLEAN DEFAULT TRUE,
                action_required VARCHAR(100), -- 'retry', 'new_card', 'contact_bank'
                is_common BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(page_id, response_code)
            )
        `);

        // Tabla de CHECKERS (Shadow, Cronos, Moon) - DIFERENTE de páginas
        await pool.query(`
            CREATE TABLE IF NOT EXISTS checkers (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) UNIQUE NOT NULL,
                type VARCHAR(50), -- 'premium', 'free', 'private'
                active_membership BOOLEAN DEFAULT FALSE,
                days_remaining INTEGER DEFAULT 0,
                total_gates INTEGER DEFAULT 0,
                status VARCHAR(20) DEFAULT 'active',
                last_checked TIMESTAMP,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabla de GATES (Dragon, etc.) - Pertenecen a checkers
        await pool.query(`
            CREATE TABLE IF NOT EXISTS gates (
                id SERIAL PRIMARY KEY,
                checker_id INTEGER REFERENCES checkers(id) ON DELETE CASCADE NOT NULL,
                name VARCHAR(100) NOT NULL,
                status VARCHAR(20) DEFAULT 'active',
                last_used TIMESTAMP,
                total_checks INTEGER DEFAULT 0,
                success_rate DECIMAL(5,2) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(checker_id, name)
            )
        `);

        // ============================================
        // 3. TABLAS DE DISPOSITIVOS Y NÚMEROS
        // ============================================
        
        // Tabla de DISPOSITIVOS
        await pool.query(`
            CREATE TABLE IF NOT EXISTS devices (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
                type VARCHAR(20) NOT NULL CHECK (type IN ('laptop', 'pc', 'tablet', 'mobile', 'server')),
                brand VARCHAR(100),
                model VARCHAR(100),
                custom_name VARCHAR(200), -- POCO F7 ULTRA_PARALLEL, LAPTOP_DOLPHIN1
                color VARCHAR(50),
                has_mobile_data BOOLEAN DEFAULT FALSE,
                can_be_formatted BOOLEAN DEFAULT TRUE,
                ram_gb INTEGER,
                os VARCHAR(50),
                imei VARCHAR(100),
                serial_number VARCHAR(100),
                current_number_id INTEGER REFERENCES phone_numbers(id),
                status VARCHAR(20) DEFAULT 'active', -- active, broken, formatted, lost
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_used TIMESTAMP
            )
        `);

        // Tabla de NÚMEROS TELEFÓNICOS
        await pool.query(`
            CREATE TABLE IF NOT EXISTS phone_numbers (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
                telephone_company VARCHAR(100) NOT NULL, -- Telcel, AT&T, Movistar
                phone_number VARCHAR(20) UNIQUE NOT NULL,
                has_mobile_data BOOLEAN DEFAULT TRUE,
                data_plan_gb INTEGER,
                status VARCHAR(20) DEFAULT 'available', -- available, in_use, lost, blocked
                current_device_id INTEGER REFERENCES devices(id),
                assigned_at TIMESTAMP,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // ============================================
        // 4. TABLAS DE CUENTAS Y LIVES
        // ============================================
        
        // Tabla de CUENTAS de usuarios en plataformas
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_accounts (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
                page_id INTEGER REFERENCES pages(id) ON DELETE SET NULL,
                platform_name VARCHAR(100) NOT NULL, -- Para compatibilidad
                
                -- Información de la cuenta
                account_name VARCHAR(200), -- ML1, ALI2, UBR3
                account_email VARCHAR(200),
                account_phone VARCHAR(50),
                account_password VARCHAR(500), -- Encriptado
                
                -- Datos de dispositivo/número
                device_id INTEGER REFERENCES devices(id),
                phone_number_id INTEGER REFERENCES phone_numbers(id),
                
                -- Estadísticas
                total_associated_cards INTEGER DEFAULT 0,
                total_orders_shipped INTEGER DEFAULT 0,
                total_successful_payments INTEGER DEFAULT 0,
                total_failed_payments INTEGER DEFAULT 0,
                
                -- Estado
                status VARCHAR(50) DEFAULT 'active', -- active, banned, limited, suspended
                last_login TIMESTAMP,
                last_payment_attempt TIMESTAMP,
                
                -- Metadatos
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                
                UNIQUE(user_id, platform_name, account_email)
            )
        `);

        // Tabla de LIVES (tarjetas válidas)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_lives (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
                
                -- Información de la tarjeta
                card_full VARCHAR(50) NOT NULL,
                card_last_four CHAR(4) NOT NULL,
                card_bin CHAR(6) NOT NULL,
                card_type VARCHAR(20), -- visa, mastercard, amex
                bank_name VARCHAR(100),
                country VARCHAR(50),
                
                -- Cómo fue obtenido
                checker_id INTEGER REFERENCES checkers(id),
                gate_id INTEGER REFERENCES gates(id),
                gate_name VARCHAR(100), -- Por si no existe en gates
                
                -- Fechas y estado
                check_date DATE NOT NULL,
                check_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status VARCHAR(20) DEFAULT 'live', -- live, used, expired, burned
                phase VARCHAR(20) DEFAULT 'pending', -- pending, testing, ready, used
                
                -- Asociación actual
                associated_account_id INTEGER REFERENCES user_accounts(id),
                associated_date DATE,
                
                -- Seguimiento
                total_payment_attempts INTEGER DEFAULT 0,
                successful_payments INTEGER DEFAULT 0,
                last_payment_date DATE,
                
                -- Notas
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                
                UNIQUE(card_full, user_id)
            )
        `);

        // Tabla de PEDIDOS/COMPRAS por cuenta
        await pool.query(`
            CREATE TABLE IF NOT EXISTS account_purchases (
                id SERIAL PRIMARY KEY,
                account_id INTEGER REFERENCES user_accounts(id) ON DELETE CASCADE NOT NULL,
                live_id INTEGER REFERENCES user_lives(id) ON DELETE SET NULL,
                
                -- Información del producto
                product_id VARCHAR(100),
                product_name VARCHAR(500) NOT NULL,
                product_url TEXT,
                category VARCHAR(100),
                
                -- Detalles de compra
                purchase_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                unit_price DECIMAL(10,2),
                quantity INTEGER DEFAULT 1,
                total_amount DECIMAL(10,2) GENERATED ALWAYS AS (unit_price * quantity) STORED,
                currency CHAR(3) DEFAULT 'USD',
                
                -- Envío y estado
                status VARCHAR(50) DEFAULT 'pending', -- pending, paid, shipped, delivered, cancelled
                tracking_number VARCHAR(100),
                shipping_address TEXT,
                estimated_delivery DATE,
                actual_delivery DATE,
                
                -- Método de pago
                payment_method VARCHAR(50), -- card, transfer, etc
                payment_status VARCHAR(50), -- approved, declined, pending
                
                -- Notas
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                
                UNIQUE(account_id, product_id, purchase_date)
            )
        `);

        // ============================================
        // 5. TABLAS DE ACCIONES Y LOGS
        // ============================================
        
        // Tabla de ACCIONES sobre lives
        await pool.query(`
            CREATE TABLE IF NOT EXISTS live_actions (
                id SERIAL PRIMARY KEY,
                live_id INTEGER REFERENCES user_lives(id) ON DELETE CASCADE NOT NULL,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
                account_id INTEGER REFERENCES user_accounts(id) ON DELETE SET NULL,
                page_id INTEGER REFERENCES pages(id),
                
                action_type VARCHAR(50) NOT NULL CHECK (
                    action_type IN (
                        'live_obtained',
                        'payment_attempt',
                        'payment_approved',
                        'payment_declined',
                        'account_created',
                        'account_logged_in',
                        'card_associated',
                        'card_transferred',
                        'manual_note'
                    )
                ),
                
                -- Detalles específicos
                amount DECIMAL(10,2),
                currency CHAR(3) DEFAULT 'USD',
                response_id INTEGER REFERENCES page_responses(id),
                response_text VARCHAR(500),
                
                -- Para pagos
                product_name VARCHAR(200),
                is_direct_payment BOOLEAN DEFAULT TRUE,
                rest_days INTEGER,
                
                -- Para transferencias
                transferred_to VARCHAR(200),
                transferred_to_user_id INTEGER REFERENCES users(id),
                
                -- Dispositivo/número usado
                device_id INTEGER REFERENCES devices(id),
                phone_number_id INTEGER REFERENCES phone_numbers(id),
                
                -- Fechas
                action_date DATE NOT NULL,
                action_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                
                -- Información adicional
                additional_info JSONB,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabla de LOGS de actividad
        await pool.query(`
            CREATE TABLE IF NOT EXISTS activity_logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                action_type VARCHAR(50) NOT NULL,
                target_type VARCHAR(50), -- user, account, live, device
                target_id INTEGER,
                details JSONB,
                ip_address INET,
                user_agent TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // ============================================
        // 6. TABLAS DE VERIFICACIÓN Y SEGURIDAD
        // ============================================
        
        // Tablas de verificación 
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



        // ============================================
        // 7. ÍNDICES PARA PERFORMANCE
        // ============================================
        
        await pool.query(`
            -- Índices de usuarios
            CREATE INDEX IF NOT EXISTS idx_users_created_by ON users(created_by);
            CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
            CREATE INDEX IF NOT EXISTS idx_users_telegram ON users(telegram_username);
            
            -- Índices de lives
            CREATE INDEX IF NOT EXISTS idx_user_lives_user ON user_lives(user_id);
            CREATE INDEX IF NOT EXISTS idx_user_lives_bin ON user_lives(card_bin);
            CREATE INDEX IF NOT EXISTS idx_user_lives_status ON user_lives(status);
            CREATE INDEX IF NOT EXISTS idx_user_lives_account ON user_lives(associated_account_id);
            CREATE INDEX IF NOT EXISTS idx_user_lives_checker ON user_lives(checker_id);
            
            -- Índices de cuentas
            CREATE INDEX IF NOT EXISTS idx_user_accounts_user ON user_accounts(user_id);
            CREATE INDEX IF NOT EXISTS idx_user_accounts_page ON user_accounts(page_id);
            CREATE INDEX IF NOT EXISTS idx_user_accounts_status ON user_accounts(status);
            
            -- Índices de dispositivos y números
            CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);
            CREATE INDEX IF NOT EXISTS idx_devices_number ON devices(current_number_id);
            CREATE INDEX IF NOT EXISTS idx_phone_numbers_user ON phone_numbers(user_id);
            CREATE INDEX IF NOT EXISTS idx_phone_numbers_device ON phone_numbers(current_device_id);
            
            -- Índices de acciones
            CREATE INDEX IF NOT EXISTS idx_live_actions_live ON live_actions(live_id);
            CREATE INDEX IF NOT EXISTS idx_live_actions_user ON live_actions(user_id);
            CREATE INDEX IF NOT EXISTS idx_live_actions_date ON live_actions(action_date DESC);
            
            -- Índices de compras
            CREATE INDEX IF NOT EXISTS idx_purchases_account ON account_purchases(account_id);
            CREATE INDEX IF NOT EXISTS idx_purchases_live ON account_purchases(live_id);
            CREATE INDEX IF NOT EXISTS idx_purchases_status ON account_purchases(status);
        `);

        // ============================================
        // 8. DATOS POR DEFECTO
        // ============================================
        
        // Insertar páginas comunes
        const defaultPages = [
            {name: 'amazon', display_name: 'Amazon', allows_associate: true, requires_2fa: true},
            {name: 'aliexpress', display_name: 'AliExpress', allows_associate: true, requires_2fa: false},
            {name: 'mercadolibre', display_name: 'MercadoLibre', allows_associate: true, requires_2fa: true},
            {name: 'uber', display_name: 'Uber', allows_associate: false, requires_login_number: true},
            {name: 'shein', display_name: 'Shein', allows_associate: false, requires_login_number: true},
            {name: 'didi', display_name: 'Didi', allows_associate: false, requires_login_number: true}

        ];
        
        for (const page of defaultPages) {
            await pool.query(
                `INSERT INTO pages (name, display_name, allows_associate, requires_2fa, requires_login_number) 
                 VALUES ($1, $2, $3, $4, $5) ON CONFLICT (name) DO NOTHING`,
                [page.name, page.display_name, page.allows_associate, page.requires_2fa, page.requires_login_number]
            );
        }

        // Insertar checkers por defecto
        const defaultCheckers = [
            {name: 'Shadow', type: 'premium'},
            {name: 'Cronos', type: 'premium'},
            {name: 'Moon', type: 'regular'}
            
        ];
        
        for (const checker of defaultCheckers) {
            await pool.query(
                `INSERT INTO checkers (name, type) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [checker.name, checker.type]
            );
        }

        // Crear usuario admin por defecto
        const bcrypt = require('bcryptjs');
        const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
        const adminHash = await bcrypt.hash(adminPassword, 10);
        
        await pool.query(`
            INSERT INTO users 
            (username, password_hash, display_name, credits, days_remaining, role, is_active, telegram_verified)
            VALUES ('admin', $1, 'Administrador', 999999, 9999, 'admin', TRUE, TRUE)
            ON CONFLICT (username) DO NOTHING
        `, [adminHash]);

        console.log('✅ Base de datos inicializada correctamente');
        console.log('📊 Estructura: 1 Usuario → N Cuentas → N Lives → N Pedidos');
        console.log('📊 Estructura: 1 Usuario → N Dispositivos ↔ N Números');
        console.log('📊 Estructura: Checkers → Gates → Lives');
        console.log('📊 Estructura: Páginas → Respuestas específicas');

    } catch (error) {
        console.error('❌ Error inicializando base de datos:', error);
        throw error;
    }
};

module.exports = { pool, initDatabase };
        
      