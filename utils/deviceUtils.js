const { pool } = require('../database');
const { notifyAdminsAndGroups } = require('./notifications'); // Crearemos este archivo después

// Verificar si un dispositivo está baneado
async function isDeviceBanned(deviceFingerprint) {
    if (!deviceFingerprint) return false;
    const res = await pool.query('SELECT 1 FROM banned_devices WHERE device_fingerprint = $1', [deviceFingerprint]);
    return res.rows.length > 0;
}

// Registrar acceso de usuario (se llama en login/registro)
async function logUserAccess(userId, deviceFingerprint, ip, userAgent, req) {
    if (!deviceFingerprint) return;
    const uaParser = require('ua-parser-js');
    const ua = uaParser(userAgent);
    await pool.query(
        `INSERT INTO access_logs 
         (user_id, device_fingerprint, ip_address, user_agent, os, browser, device_type) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, deviceFingerprint, ip, userAgent, ua.os.name, ua.browser.name, ua.device.type || 'desktop']
    );
}

// Detectar multicuentas al registrar/loguear
async function detectMulticuentas(deviceFingerprint, newUserId, newUsername) {
    if (!deviceFingerprint) return null;
    const res = await pool.query(
        `SELECT DISTINCT u.id, u.username, u.role, al.created_at as last_used
         FROM access_logs al
         JOIN users u ON al.user_id = u.id
         WHERE al.device_fingerprint = $1 AND al.user_id != $2
         ORDER BY al.created_at DESC`,
        [deviceFingerprint, newUserId]
    );
    if (res.rows.length > 0) {
        const message = `⚠️ *POSIBLE MULTICUENTA DETECTADA* ⚠️\n\n` +
                        `🔹 Nuevo usuario: ${newUsername} (ID: ${newUserId})\n` +
                        `🔹 Mismo fingerprint que:\n` +
                        res.rows.map(u => `   • ${u.username} (ID: ${u.id}, rol: ${u.role})`).join('\n') +
                        `\n\n📅 Detectado automáticamente.`;
        await notifyAdminsAndGroups(message);
        return res.rows;
    }
    return null;
}

// Banear un dispositivo (fingerprint)
async function banDevice(deviceFingerprint, reason, adminId) {
    if (!deviceFingerprint) throw new Error('Fingerprint requerido');
    await pool.query(
        `INSERT INTO banned_devices (device_fingerprint, reason, banned_by, created_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (device_fingerprint) DO UPDATE
         SET reason = EXCLUDED.reason, banned_by = EXCLUDED.banned_by, created_at = NOW()`,
        [deviceFingerprint, reason, adminId]
    );
    // Opcional: desactivar todos los usuarios que usaron ese dispositivo
    await pool.query(
        `UPDATE users SET is_active = false 
         WHERE id IN (SELECT DISTINCT user_id FROM access_logs WHERE device_fingerprint = $1)`,
        [deviceFingerprint]
    );
    return true;
}

// Desbanear un dispositivo
async function unbanDevice(deviceFingerprint) {
    await pool.query('DELETE FROM banned_devices WHERE device_fingerprint = $1', [deviceFingerprint]);
    return true;
}

// Obtener dispositivos de un usuario (para admin)
async function getUserDevices(userId) {
    const res = await pool.query(
        `SELECT device_fingerprint, COUNT(*) as times_used, 
         array_agg(DISTINCT ip_address) as ips,
         MAX(created_at) as last_seen
         FROM access_logs 
         WHERE user_id = $1 
         GROUP BY device_fingerprint`,
        [userId]
    );
    return res.rows;
}

// Obtener otros usuarios que usaron el mismo fingerprint
async function getRelatedUsersByFingerprint(deviceFingerprint, excludeUserId) {
    const res = await pool.query(
        `SELECT DISTINCT u.id, u.username, u.role, u.is_active, al.created_at as last_seen
         FROM access_logs al
         JOIN users u ON al.user_id = u.id
         WHERE al.device_fingerprint = $1 AND u.id != $2`,
        [deviceFingerprint, excludeUserId]
    );
    return res.rows;
}

module.exports = {
    isDeviceBanned,
    logUserAccess,
    detectMulticuentas,
    banDevice,
    unbanDevice,
    getUserDevices,
    getRelatedUsersByFingerprint
};