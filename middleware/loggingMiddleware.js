// middleware/loggingMiddleware.js
const uaParser = require('ua-parser-js');
const { pool } = require('../database'); // Ajusta la ruta según tu estructura

const loggingMiddleware = async (req, res, next) => {


    try {

        console.log('🟢 Logging middleware ejecutado para', req.method, req.url);
        
        // Obtener IP real (detecta proxies como Cloudflare)
        const ip = req.headers['cf-connecting-ip'] || 
                   req.headers['x-forwarded-for'] || 
                   req.connection?.remoteAddress || 
                   req.ip;
        
        // Parsear User-Agent
        const userAgent = req.headers['user-agent'] || '';
        const ua = uaParser(userAgent);
        
        // Datos a guardar
        const logData = {
            user_id: req.user?.id || null,
            ip_address: ip,
            user_agent: userAgent,
            os: ua.os.name || null,
            os_version: ua.os.version || null,
            browser: ua.browser.name || null,
            browser_version: ua.browser.version || null,
            device_vendor: ua.device.vendor || null,
            device_model: ua.device.model || null,
            device_type: ua.device.type || 'desktop',
            device_fingerprint: req.body?.device_fingerprint || null, // si se envía desde frontend
        };
        
        // Guardar en PostgreSQL (tabla access_logs)
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
        
        // Pasar los datos al request para usarlos en rutas posteriores
        req.clientInfo = logData;
        
    } catch (error) {
        console.error('Error en loggingMiddleware:', error.message);
        // No interrumpimos la ejecución, solo registramos el error
    }
    
    next();
};

module.exports = loggingMiddleware;