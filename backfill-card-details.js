// scripts/backfill-card-details.js
const { pool } = require('./database'); // Ajusta la ruta a tu conexión de BD
const axios = require('axios'); // npm install axios si no lo tienes

// Función para obtener red (network) desde el primer dígito
function getNetworkFromFirstDigit(cardNumber) {
    const first = cardNumber.toString()[0];
    if (first === '4') return 'Visa';
    if (first === '5') return 'Mastercard';
    if (first === '3') return 'American Express';
    if (first === '6') return 'Discover';
    return 'Otro';
}

// Función para consultar binlist.net
async function getBinInfo(bin) {
    try {
        const response = await axios.get(`https://lookup.binlist.net/${bin}`, { timeout: 5000 });
        if (response.data) {
            return {
                bank: response.data.bank?.name || null,
                country: response.data.country?.name || null,
                scheme: response.data.scheme || null,      // visa, mastercard, etc.
                type: response.data.type || null           // credit, debit
            };
        }
    } catch (err) {
        console.warn(`Error consultando BIN ${bin}: ${err.message}`);
    }
    return { bank: null, country: null, scheme: null, type: null };
}

async function backfillCards() {
    const client = await pool.connect();
    try {
        // Obtener todas las tarjetas que tengan campos nulos (o vacíos) que queremos rellenar
        const res = await client.query(`
            SELECT id, card_full, network, bank_name, country, card_class
            FROM user_lives
            WHERE (network IS NULL OR bank_name IS NULL OR country IS NULL OR card_class IS NULL)
        `);
        const cards = res.rows;
        console.log(`📦 Encontradas ${cards.length} tarjetas para procesar...`);

        for (const card of cards) {
            const parts = card.card_full?.split('|');
            const cardNumber = parts?.[0];
            if (!cardNumber || cardNumber.length < 6) {
                console.log(`⏭️  Saltando tarjeta ID ${card.id}: número inválido`);
                continue;
            }

            const bin = cardNumber.slice(0, 6);
            let network = card.network;
            let bank = card.bank_name;
            let country = card.country;
            let cardClass = card.card_class;

            // Si la red no está asignada, obtenerla del primer dígito (más rápido)
            if (!network) {
                network = getNetworkFromFirstDigit(cardNumber);
            }

            // Si faltan bank, country o class, consultar API
            if (!bank || !country || !cardClass) {
                const binInfo = await getBinInfo(bin);
                if (binInfo) {
                    if (!bank && binInfo.bank) bank = binInfo.bank;
                    if (!country && binInfo.country) country = binInfo.country;
                    if (!cardClass && binInfo.type) {
                        // Normalizar: credit -> Crédito, debit -> Débito
                        cardClass = binInfo.type === 'credit' ? 'Crédito' : (binInfo.type === 'debit' ? 'Débito' : null);
                    }
                    // Si no se obtuvo scheme, ya tenemos network del primer dígito
                }
            }

            // Actualizar la tarjeta en BD
            await client.query(`
                UPDATE user_lives
                SET network = COALESCE($1, network),
                    bank_name = COALESCE($2, bank_name),
                    country = COALESCE($3, country),
                    card_class = COALESCE($4, card_class)
                WHERE id = $5
            `, [network, bank, country, cardClass, card.id]);

            console.log(`✅ Actualizada tarjeta ID ${card.id} -> red: ${network}, banco: ${bank}, país: ${country}, clase: ${cardClass}`);
            // Pequeña pausa para no saturar la API
            await new Promise(r => setTimeout(r, 200));
        }

        console.log('🎉 Proceso completado.');
    } catch (err) {
        console.error('❌ Error durante el backfill:', err);
    } finally {
        client.release();
        process.exit(0);
    }
}

backfillCards();