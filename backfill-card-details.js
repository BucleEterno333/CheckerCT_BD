// scripts/backfill-card-details.js
const { pool } = require('./database'); // Ajusta la ruta a tu conexión de BD
const axios = require('axios');

// Función para obtener red desde el primer dígito
function getNetworkFromFirstDigit(cardNumber) {
    const first = cardNumber.toString()[0];
    if (first === '4') return 'Visa';
    if (first === '5') return 'Mastercard';
    if (first === '3') return 'American Express';
    if (first === '6') return 'Discover';
    return 'Otro';
}

// Consultar Chargeblast API (sin límites conocidos)
async function getBinInfoFromChargeblast(bin) {
    try {
        const response = await axios.get(`https://api.chargeblast.com/bin/${bin}`, { timeout: 10000 });
        if (response.data) {
            const data = response.data;
            return {
                bank: data.bank?.name || null,
                country: data.country?.name || null,
                network: data.scheme ? data.scheme.charAt(0).toUpperCase() + data.scheme.slice(1) : null,
                card_class: data.type === 'credit' ? 'Crédito' : (data.type === 'debit' ? 'Débito' : null)
            };
        }
    } catch (err) {
        console.warn(`⚠️ Error consultando Chargeblast para BIN ${bin}: ${err.message}`);
    }
    return null;
}

async function backfillCards() {
    const client = await pool.connect();
    try {
        // Selecciona todas las tarjetas que tengan algún campo nulo (o vacío)
        const res = await client.query(`
            SELECT id, card_full, network, bank_name, country, card_class
            FROM user_lives
            WHERE (network IS NULL OR bank_name IS NULL OR country IS NULL OR card_class IS NULL)
        `);
        const cards = res.rows;
        console.log(`📦 Encontradas ${cards.length} tarjetas para procesar...`);

        for (let i = 0; i < cards.length; i++) {
            const card = cards[i];
            const parts = card.card_full?.split('|');
            const cardNumber = parts?.[0];
            if (!cardNumber || cardNumber.length < 6) {
                console.log(`⏭️  Saltando tarjeta ID ${card.id}: número inválido.`);
                continue;
            }

            const bin = cardNumber.slice(0, 6);
            let network = card.network;
            let bank = card.bank_name;
            let country = card.country;
            let cardClass = card.card_class;
            let updated = false;

            // Si la red no está, calcular por el primer dígito
            if (!network) {
                network = getNetworkFromFirstDigit(cardNumber);
                updated = true;
            }

            // Si faltan datos, consultar Chargeblast
            if (!bank || !country || !cardClass) {
                const binInfo = await getBinInfoFromChargeblast(bin);
                if (binInfo) {
                    if (!bank && binInfo.bank) { bank = binInfo.bank; updated = true; }
                    if (!country && binInfo.country) { country = binInfo.country; updated = true; }
                    if (!cardClass && binInfo.card_class) { cardClass = binInfo.card_class; updated = true; }
                    // Opcional: si la red obtenida es más precisa que la calculada, usarla
                    if (binInfo.network && (!network || network === 'Otro')) {
                        network = binInfo.network;
                        updated = true;
                    }
                }
            }

            if (updated) {
                await client.query(`
                    UPDATE user_lives
                    SET network = COALESCE($1, network),
                        bank_name = COALESCE($2, bank_name),
                        country = COALESCE($3, country),
                        card_class = COALESCE($4, card_class)
                    WHERE id = $5
                `, [network, bank, country, cardClass, card.id]);
                console.log(`✅ [${i+1}/${cards.length}] Actualizada tarjeta ID ${card.id} -> red: ${network}, banco: ${bank}, país: ${country}, clase: ${cardClass}`);
            } else {
                console.log(`⏭️ [${i+1}/${cards.length}] Tarjeta ID ${card.id} sin cambios.`);
            }

            // Pequeña pausa para no sobrecargar la API (1 segundo es suficiente)
            await new Promise(r => setTimeout(r, 1000));
        }

        console.log('🎉 Proceso completado exitosamente.');
    } catch (err) {
        console.error('❌ Error durante el backfill:', err);
    } finally {
        client.release();
        process.exit(0);
    }
}

backfillCards();