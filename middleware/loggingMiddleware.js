// middleware/loggingMiddleware.js
const uaParser = require('ua-parser-js');
const { pool } = require('../database');

// Cache en memoria para evitar logs repetitivos (se reinicia al reiniciar el servidor)
const seenUsers = new Set();      // Para usuarios (por user_id)
const seenFingerprints = new Set(); // Para fingerprints

const loggingMiddleware = async (req, res, next) => {
    try {
        const ip = req.headers['cf-connecting-ip'] || 
                   req.headers['x-forwarded-for'] || 
                   req.connection?.remoteAddress || 
                   req.ip;
        
        const userAgent = req.headers['user-agent'] || '';
        const ua = uaParser(userAgent);
        const deviceFingerprint = req.body?.device_fingerprint || null;
        const userId = req.user?.id || null;
        
        // Datos a guardar siempre
        const logData = {
            user_id: userId,
            ip_address: ip,
            user_agent: userAgent,
            os: ua.os.name || null,
            os_version: ua.os.version || null,
            browser: ua.browser.name || null,
            browser_version: ua.browser.version || null,
            device_vendor: ua.device.vendor || null,
            device_model: ua.device.model || null,
            device_type: ua.device.type || 'desktop',
            device_fingerprint: deviceFingerprint,
        };
        
        // Guardar en BD siempre (no hay problema)
        await pool.query(
            `INSERT INTO access_logs 
             (user_id, ip_address, user_agent, os, os_version, browser, browser_version, 
              device_vendor, device_model, device_type, device_fingerprint, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
            [
                logData.user_id,
                logData.ip_address,
                logData.user_agent,
                logData.os,
                logData.os_version,
                logData.browser,
                logData.browser_version,
                logData.device_vendor,
                logData.device_model,
                logData.device_type,
                logData.device_fingerprint
            ]
        );
        
        // ========== LOGS SOLO PARA NUEVAS DETECCIONES ==========
        let logMessage = null;
        
        // Si hay user_id y es primera vez que lo vemos en esta sesión del servidor
        if (userId && !seenUsers.has(userId)) {
            seenUsers.add(userId);
            // Obtener username de la BD
            const userRes = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
            const username = userRes.rows[0]?.username || 'desconocido';
            logMessage = `🆕 Nuevo usuario detectado: ${username} (ID: ${userId}) desde IP ${ip}`;
        }
        // Si no hay user_id pero hay fingerprint y es primera vez
        else if (!userId && deviceFingerprint && !seenFingerprints.has(deviceFingerprint)) {
            seenFingerprints.add(deviceFingerprint);
            logMessage = `🆕 Nuevo fingerprint detectado: ${deviceFingerprint.substring(0,16)}... desde IP ${ip}`;
        }
        
        // Mostrar el log solo si es una nueva detección relevante
        if (logMessage) {
            console.log(logMessage);
        }
        
        req.clientInfo = logData;
        
    } catch (error) {
        // Solo mostrar errores reales, no inundar la consola
        if (error.message && !error.message.includes('column "browser_version" does not exist')) {
            console.error('Error en loggingMiddleware:', error.message);
        }
    }
    
    next();
};

module.exports = loggingMiddleware;