// scripts/backfill-card-details.js
const { pool } = require('./database'); // Ajusta la ruta si es necesario
const axios = require('axios');

// Función para obtener red desde el primer dígito (fallback)
function getNetworkByFirstDigit(cardNumber) {
    const first = cardNumber.charAt(0);
    if (first === '4') return 'Visa';
    if (first === '5') return 'Mastercard';
    if (first === '3') return 'American Express';
    if (first === '6') return 'Discover';
    return 'Otro';
}

// Normalizar a primera letra mayúscula y resto minúsculas
function normalize(str) {
    if (!str) return null;
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// Obtener información desde Chargeblast (sin límites conocidos)
async function fetchFromChargeblast(bin) {
    try {
        const response = await axios.get(`https://api.chargeblast.com/bin/${bin}`, { timeout: 10000 });
        if (response.status === 200 && response.data) {
            const data = response.data;
            return {
                network: data.brand ? normalize(data.brand) : null,
                bank_name: data.issuer || null,
                country: data.country || null,
                card_class: data.type === 'DEBIT' ? 'Débito' : (data.type === 'CREDIT' ? 'Crédito' : null),
            };
        }
    } catch (err) {
        // Silenciamos errores de conexión
    }
    return null;
}

// Obtener información desde Binlist (solo como respaldo)
async function fetchFromBinlist(bin) {
    try {
        const response = await axios.get(`https://lookup.binlist.net/${bin}`, { timeout: 10000 });
        if (response.status === 200 && response.data) {
            const data = response.data;
            return {
                network: data.brand ? normalize(data.brand) : null,
                bank_name: data.bank?.name || null,
                country: data.country?.name || null,
                card_class: data.type === 'debit' ? 'Débito' : (data.type === 'credit' ? 'Crédito' : null),
            };
        }
    } catch (err) {
        // Silenciamos errores
    }
    return null;
}

// Función principal que combina las fuentes
async function getBinInfo(bin) {
    // 1. Intentar Chargeblast (sin límites)
    const chargeblastData = await fetchFromChargeblast(bin);
    if (chargeblastData && (chargeblastData.bank_name || chargeblastData.country || chargeblastData.card_class)) {
        return chargeblastData;
    }

    // 2. Si Chargeblast no tiene datos, usar Binlist (pero con límite)
    const binlistData = await fetchFromBinlist(bin);
    if (binlistData && (binlistData.bank_name || binlistData.country || binlistData.card_class)) {
        return binlistData;
    }

    // 3. Si nada funciona, devolver solo la red por el primer dígito
    return null;
}

async function backfillCards() {
    const client = await pool.connect();
    let processed = 0;
    let updated = 0;

    try {
        // Asegurar que las columnas existan (ejecutar una sola vez)
        await client.query(`
            ALTER TABLE user_lives 
            ADD COLUMN IF NOT EXISTS network VARCHAR(50),
            ADD COLUMN IF NOT EXISTS card_class VARCHAR(20)
        `);

        // Seleccionar tarjetas que aún tengan campos nulos
        const res = await client.query(`
            SELECT id, card_full, network, bank_name, country, card_class
            FROM user_lives
            WHERE (bank_name IS NULL OR country IS NULL OR card_class IS NULL OR network IS NULL)
            ORDER BY id
        `);
        const cards = res.rows;
        console.log(`📦 ${cards.length} tarjetas pendientes de enriquecer`);

        for (const card of cards) {
            const parts = card.card_full?.split('|');
            const cardNumber = parts?.[0];
            if (!cardNumber || cardNumber.length < 6) {
                console.log(`⏭️ ID ${card.id}: número inválido`);
                continue;
            }
            processed++;
            const bin = cardNumber.slice(0, 6);

            let network = card.network;
            let bank_name = card.bank_name;
            let country = card.country;
            let card_class = card.card_class;

            // Si falta la red, calcular por el primer dígito (fallback)
            if (!network) {
                network = getNetworkByFirstDigit(cardNumber);
                console.log(`🔢 ID ${card.id}: Red calculada por dígito -> ${network}`);
            }

            // Si faltan otros campos, consultar APIs
            if (!bank_name || !country || !card_class) {
                const binInfo = await getBinInfo(bin);
                if (binInfo) {
                    if (!bank_name && binInfo.bank_name) bank_name = binInfo.bank_name;
                    if (!country && binInfo.country) country = binInfo.country;
                    if (!card_class && binInfo.card_class) card_class = binInfo.card_class;
                    if (!network && binInfo.network) network = binInfo.network;
                }
            }

            // Armar objeto con solo los campos que han cambiado
            const updates = {};
            if (network && network !== card.network) updates.network = network;
            if (bank_name && bank_name !== card.bank_name) updates.bank_name = bank_name;
            if (country && country !== card.country) updates.country = country;
            if (card_class && card_class !== card.card_class) updates.card_class = card_class;

            if (Object.keys(updates).length > 0) {
                await client.query(`
                    UPDATE user_lives
                    SET network = COALESCE($1, network),
                        bank_name = COALESCE($2, bank_name),
                        country = COALESCE($3, country),
                        card_class = COALESCE($4, card_class)
                    WHERE id = $5
                `, [updates.network || null, updates.bank_name || null, updates.country || null, updates.card_class || null, card.id]);
                console.log(`✅ [${processed}/${cards.length}] ID ${card.id} -> Red: ${updates.network || card.network || 'N/A'}, Banco: ${updates.bank_name || card.bank_name || 'N/A'}, País: ${updates.country || card.country || 'N/A'}, Clase: ${updates.card_class || card.card_class || 'N/A'}`);
                updated++;
            } else {
                console.log(`⏭️ [${processed}/${cards.length}] ID ${card.id}: sin cambios (ya tiene todos los datos o no se obtuvieron nuevos)`);
            }

            // Pausa de 2 segundos entre solicitudes para no saturar
            await new Promise(r => setTimeout(r, 2000));
        }

        console.log(`🎉 Terminado. Actualizadas ${updated} de ${processed} tarjetas.`);
    } catch (err) {
        console.error('❌ Error durante el backfill:', err);
    } finally {
        client.release();
        process.exit(0);
    }
}

backfillCards();