const uaParser = require('ua-parser-js');

const loggingMiddleware = async (req, res, next) => {
    // Obtener IP real, especialmente si usas Cloudflare o proxies
    const ip = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip;
    
    // Obtener y parsear el User-Agent
    const userAgent = req.headers['user-agent'];
    const ua = uaParser(userAgent);
    
    const logData = {
        user_id: req.user?.id || null, // Si el usuario está autenticado
        ip_address: ip,
        user_agent: userAgent,
        os: ua.os.name,
        os_version: ua.os.version,
        browser: ua.browser.name,
        browser_version: ua.browser.version,
        device_vendor: ua.device.vendor,
        device_model: ua.device.model,
        device_type: ua.device.type || 'desktop',
        // Aquí vendrá después el device_fingerprint
    };
    
    // Guardar en PostgreSQL
    // await pool.query('INSERT INTO access_logs ...', [logData...]);
    
    // Pasar los datos al request para usarlos en las rutas
    req.clientInfo = logData;
    next();
};