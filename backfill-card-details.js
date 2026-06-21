const { pool } = require('./database');
const axios = require('axios');

// Mapeo de bancos y países para normalizar
const bankMapping = {
    'banorte': 'Banorte',
    'bancoppel': 'BanCoppel',
    'banamex': 'Banamex',
    'santander': 'Santander',
    'bbva': 'BBVA Bancomer',
    'bbva bancomer': 'BBVA Bancomer',
    'hsbc': 'HSBC',
    'banco azteca': 'Banco Azteca',
    'spin by oxxo': 'Spin by OXXO',
    'us bank': 'U.S. Bank',
    'unisoluciones': 'Unisoluciones',
    // agregar más según sea necesario
};

const countryMapping = {
    'mexico': 'México',
    'canada': 'Canadá',
    'usa': 'Estados Unidos',
    'united states': 'Estados Unidos',
    // ...
};

function normalizeBank(name) {
    if (!name) return null;
    const lower = name.toLowerCase().trim();
    return bankMapping[lower] || name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

function normalizeCountry(name) {
    if (!name) return null;
    const lower = name.toLowerCase().trim();
    return countryMapping[lower] || name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

function getNetworkByFirstDigit(cardNumber) {
    const first = cardNumber.charAt(0);
    if (first === '4') return 'Visa';
    if (first === '5') return 'Mastercard';
    if (first === '3') return 'American Express';
    if (first === '6') return 'Discover';
    return 'Otro';
}

async function fetchFromChargeblast(bin) {
    try {
        const response = await axios.get(`https://api.chargeblast.com/bin/${bin}`, { timeout: 10000 });
        if (response.status === 200 && response.data) {
            const data = response.data;
            return {
                network: data.brand ? data.brand : null,
                bank_name: data.issuer ? normalizeBank(data.issuer) : null,
                country: data.country ? normalizeCountry(data.country) : null,
                card_class: data.type === 'DEBIT' ? 'Débito' : (data.type === 'CREDIT' ? 'Crédito' : null),
            };
        }
    } catch (err) {}
    return null;
}

async function fetchFromBinlist(bin) {
    try {
        const response = await axios.get(`https://lookup.binlist.net/${bin}`, { timeout: 10000 });
        if (response.status === 200 && response.data) {
            const data = response.data;
            return {
                network: data.brand ? data.brand : null,
                bank_name: data.bank?.name ? normalizeBank(data.bank.name) : null,
                country: data.country?.name ? normalizeCountry(data.country.name) : null,
                card_class: data.type === 'debit' ? 'Débito' : (data.type === 'credit' ? 'Crédito' : null),
            };
        }
    } catch (err) {}
    return null;
}

async function getBinInfo(bin) {
    let info = await fetchFromChargeblast(bin);
    if (info && (info.bank_name || info.country || info.card_class)) return info;
    info = await fetchFromBinlist(bin);
    if (info && (info.bank_name || info.country || info.card_class)) return info;
    return null;
}

async function backfillCards() {
    const client = await pool.connect();
    let processed = 0, updated = 0;
    try {
        await client.query(`
            ALTER TABLE user_lives 
            ADD COLUMN IF NOT EXISTS network VARCHAR(50),
            ADD COLUMN IF NOT EXISTS card_class VARCHAR(20)
        `);
        const res = await client.query(`
            SELECT id, card_full, network, bank_name, country, card_class
            FROM user_lives
            WHERE (bank_name IS NULL OR country IS NULL OR card_class IS NULL OR network IS NULL)
            ORDER BY id
        `);
        const cards = res.rows;
        console.log(`📦 ${cards.length} tarjetas pendientes`);
        for (const card of cards) {
            const parts = card.card_full?.split('|');
            const cardNumber = parts?.[0];
            if (!cardNumber || cardNumber.length < 6) continue;
            processed++;
            const bin = cardNumber.slice(0,6);
            let network = card.network;
            let bank_name = card.bank_name;
            let country = card.country;
            let card_class = card.card_class;
            if (!network) network = getNetworkByFirstDigit(cardNumber);
            if (!bank_name || !country || !card_class) {
                const binInfo = await getBinInfo(bin);
                if (binInfo) {
                    if (!bank_name && binInfo.bank_name) bank_name = binInfo.bank_name;
                    if (!country && binInfo.country) country = binInfo.country;
                    if (!card_class && binInfo.card_class) card_class = binInfo.card_class;
                    if (!network && binInfo.network) network = binInfo.network;
                }
            }
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
                updated++;
            }
            await new Promise(r => setTimeout(r, 2000));
        }
        console.log(`🎉 Actualizadas ${updated} de ${processed}`);
    } catch (err) { console.error(err); } finally { client.release(); process.exit(0); }
}
backfillCards();
