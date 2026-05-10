// scripts/backfill-card-details.js
const { pool } = require('../database');
const axios = require('axios');

// Configuración de NeutrinoAPI - ¡REEMPLAZA CON TUS CREDENCIALES!
const NEUTRINO_USER_ID = 'tu-user-id';
const NEUTRINO_API_KEY = 'tu-api-key';

// Función para obtener red desde el primer dígito (fallback)
function getNetworkFromFirstDigit(cardNumber) {
    const first = cardNumber.toString()[0];
    if (first === '4') return 'Visa';
    if (first === '5') return 'Mastercard';
    if (first === '3') return 'American Express';
    if (first === '6') return 'Discover';
    return 'Otro';
}

// Función principal que prueba múltiples APIs hasta obtener una respuesta
async function getBinInfo(bin) {
    // Lista de fuentes a probar en orden
    const sources = [
        {
            name: 'Chargeblast',
            url: `https://api.chargeblast.com/bin/${bin}`,
            process: (data) => ({
                bank: data.bank?.name || null,
                country: data.country?.name || null,
                network: data.scheme ? data.scheme.charAt(0).toUpperCase() + data.scheme.slice(1) : null,
                card_class: data.type === 'credit' ? 'Crédito' : (data.type === 'debit' ? 'Débito' : null)
            })
        },
        {
            name: 'Binlist.net',
            url: `https://lookup.binlist.net/${bin}`,
            process: (data) => ({
                bank: data.bank?.name || null,
                country: data.country?.name || null,
                network: data.scheme ? data.scheme.charAt(0).toUpperCase() + data.scheme.slice(1) : null,
                card_class: data.type === 'credit' ? 'Crédito' : (data.type === 'debit' ? 'Débito' : null)
            })
        },
        {
            name: 'OpenBIN',
            url: `https://openbin.org/${bin}.json`,
            process: (data) => ({
                bank: data.bank || null,
                country: data.country || null,
                network: data.scheme ? data.scheme.charAt(0).toUpperCase() + data.scheme.slice(1) : null,
                card_class: data.type ? (data.type === 'credit' ? 'Crédito' : (data.type === 'debit' ? 'Débito' : null)) : null
            })
        },
        {
            name: 'NeutrinoAPI',
            url: 'https://neutrinoapi.net/bin-lookup',
            method: 'POST',
            headers: {
                'User-ID': NEUTRINO_USER_ID,
                'API-Key': NEUTRINO_API_KEY,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            process: (data) => ({
                bank: data['issuer'] || null,
                country: data['country-code'] || null,
                network: data['card-brand'] || null,
                card_class: data['card-type'] === 'CREDIT' ? 'Crédito' : (data['card-type'] === 'DEBIT' ? 'Débito' : null)
            }),
            getBody: (bin) => `bin-number=${bin}`
        }
    ];

    for (const source of sources) {
        try {
            let response;
            if (source.method === 'POST') {
                response = await axios.post(source.url, source.getBody(bin), {
                    headers: source.headers,
                    timeout: 10000
                });
            } else {
                response = await axios.get(source.url, { timeout: 10000 });
            }

            if (response.status === 200 && response.data && !response.data.error) {
                // Si la respuesta tiene la estructura esperada
                if (Object.keys(response.data).length > 0 && (response.data.bank || response.data.scheme || response.data.country)) {
                    console.log(`✅ Datos obtenidos de ${source.name} para BIN ${bin}`);
                    return source.process(response.data);
                }
            }
        } catch (err) {
            // Si es un error 429 (demasiadas peticiones), no seguimos con esta fuente
            if (err.response?.status === 429) {
                console.log(`⚠️ Rate limit alcanzado en ${source.name}, cambiando a siguiente fuente...`);
                continue;
            }
            // Para otros errores, simplemente pasamos a la siguiente fuente
        }
    }

    // Si no se obtuvo respuesta de ninguna API
    console.log(`❌ No se encontraron datos para BIN ${bin} en ninguna fuente`);
    return null;
}

// Función principal de backfill
async function backfillCards() {
    const client = await pool.connect();
    let processed = 0;
    let successCount = 0;
    
    try {
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
                console.log(`⏭️ Saltando tarjeta ID ${card.id}: número inválido.`);
                continue;
            }

            processed++;
            const bin = cardNumber.slice(0, 6);
            let network = card.network;
            let bank = card.bank_name;
            let country = card.country;
            let cardClass = card.card_class;
            let updated = false;

            // 1. Calcular red por defecto si no existe (fallback)
            if (!network) {
                network = getNetworkFromFirstDigit(cardNumber);
                updated = true;
            }

            // 2. Intentar obtener datos de las APIs si falta información
            if (!bank || !country || !cardClass) {
                const binInfo = await getBinInfo(bin);
                if (binInfo) {
                    if (!bank && binInfo.bank) { bank = binInfo.bank; updated = true; }
                    if (!country && binInfo.country) { country = binInfo.country; updated = true; }
                    if (!cardClass && binInfo.card_class) { cardClass = binInfo.card_class; updated = true; }
                    if (binInfo.network && (!network || network === 'Otro')) { network = binInfo.network; updated = true; }
                    if (bank && country && cardClass) successCount++;
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
                console.log(`✅ [${processed}/${cards.length}] ID ${card.id} -> Red: ${network}, Banco: ${bank || 'N/A'}, País: ${country || 'N/A'}, Clase: ${cardClass || 'N/A'}`);
            } else {
                console.log(`⏭️ [${processed}/${cards.length}] ID ${card.id}: sin cambios.`);
            }

            // Pequeña pausa para ser respetuosos con los servidores
            await new Promise(r => setTimeout(r, 1000));
        }

        console.log(`🎉 Proceso completado. Éxitos: ${successCount} de ${processed}`);
    } catch (err) {
        console.error('❌ Error durante el backfill:', err);
    } finally {
        client.release();
        process.exit(0);
    }
}

backfillCards();