const { pool } = require('../database');
const axios = require('axios');

const DELAY_MS = 12000;
const MAX_RETRIES = 3;

function getNetworkFromFirstDigit(cardNumber) {
    const first = cardNumber.toString()[0];
    if (first === '4') return 'Visa';
    if (first === '5') return 'Mastercard';
    if (first === '3') return 'American Express';
    if (first === '6') return 'Discover';
    return 'Otro';
}

async function getBinInfo(bin, retryCount = 0) {
    try {
        const response = await axios.get(`https://lookup.binlist.net/${bin}`, { timeout: 10000 });
        if (response.data) {
            return {
                bank: response.data.bank?.name || null,
                country: response.data.country?.name || null,
                scheme: response.data.scheme || null,
                type: response.data.type === 'credit' ? 'Crédito' : (response.data.type === 'debit' ? 'Débito' : null)
            };
        }
    } catch (err) {
        if (err.response?.status === 429 && retryCount < MAX_RETRIES) {
            console.log(`⚠️ Rate limit (429) para BIN ${bin}. Reintentando en ${DELAY_MS/1000}s... (Intento ${retryCount + 1}/${MAX_RETRIES})`);
            await new Promise(r => setTimeout(r, DELAY_MS));
            return getBinInfo(bin, retryCount + 1);
        }
        console.warn(`Error consultando BIN ${bin}: ${err.message}`);
    }
    return { bank: null, country: null, scheme: null, type: null };
}

async function backfillCards() {
    const client = await pool.connect();
    try {
        const res = await client.query(`SELECT id, card_full, network, bank_name, country, card_class FROM user_lives WHERE (network IS NULL OR bank_name IS NULL OR country IS NULL OR card_class IS NULL) LIMIT 20`); // 👈 Ajusta o elimina el LIMIT 20 cuando estés seguro
        const cards = res.rows;
        console.log(`📦 Encontradas ${cards.length} tarjetas para procesar...`);

        for (const card of cards) {
            const parts = card.card_full?.split('|');
            const cardNumber = parts?.[0];
            if (!cardNumber || cardNumber.length < 6) {
                console.log(`⏭️ Saltando tarjeta ID ${card.id}: número inválido`);
                continue;
            }

            const bin = cardNumber.slice(0, 6);
            let network = card.network;
            let bank = card.bank_name;
            let country = card.country;
            let cardClass = card.card_class;

            if (!network) network = getNetworkFromFirstDigit(cardNumber);

            if (!bank || !country || !cardClass) {
                const binInfo = await getBinInfo(bin);
                if (binInfo) {
                    if (!bank && binInfo.bank) bank = binInfo.bank;
                    if (!country && binInfo.country) country = binInfo.country;
                    if (!cardClass && binInfo.type) cardClass = binInfo.type;
                }
            }

            await client.query(`
                UPDATE user_lives
                SET network = COALESCE($1, network),
                    bank_name = COALESCE($2, bank_name),
                    country = COALESCE($3, country),
                    card_class = COALESCE($4, card_class)
                WHERE id = $5
            `, [network, bank, country, cardClass, card.id]);

            console.log(`✅ Actualizada tarjeta ID ${card.id} -> red: ${network}, banco: ${bank}, país: ${country}, clase: ${cardClass}`);
            await new Promise(r => setTimeout(r, DELAY_MS));
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