// middleware/loggingMiddleware.js
const uaParser = require('ua-parser-js');
const { pool } = require('../database');

const loggingMiddleware = async (req, res, next) => {
    // Siempre muestra que se ejecuta (para depuración)
    console.log(`🔵 [LOGGING] Procesando ${req.method} ${req.url}`);
    
    try {
        // Obtener IP real
        const ip = req.headers['cf-connecting-ip'] || 
                   req.headers['x-forwarded-for'] || 
                   req.connection?.remoteAddress || 
                   req.ip || 
                   '0.0.0.0';
        
        const userAgent = req.headers['user-agent'] || '';
        const ua = uaParser(userAgent);
        const deviceFingerprint = req.body?.device_fingerprint || null;
        const userId = req.user?.id || null;
        
        // Guardar en access_logs
        const result = await pool.query(
            `INSERT INTO access_logs 
             (user_id, ip_address, user_agent, os, browser, browser_version, device_type, device_fingerprint, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
             RETURNING id`,
            [
                userId,
                ip,
                userAgent,
                ua.os.name || null,
                ua.browser.name || null,
                ua.browser.version || null,
                ua.device.type || 'desktop',
                deviceFingerprint
            ]
        );
        
        console.log(`✅ [LOGGING] Insertado registro ID ${result.rows[0].id} (usuario: ${userId || 'anónimo'})`);
        
        // Opcional: pasar datos al request
        req.clientInfo = { ip, userAgent, ua, deviceFingerprint, userId };
        
    } catch (error) {
        console.error(`❌ [LOGGING] Error: ${error.message}`);
        if (error.message.includes('column')) {
            console.error('   → Verifica que la tabla access_logs tenga todas las columnas necesarias');
        }
    }
    
    next();
};

module.exports = loggingMiddleware;