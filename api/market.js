export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    const { action, q, symbol } = req.query;
    const RAPID_KEY = '06c40cc462msh2a69c4bed748376p121936jsna8eb70935d62';
    const RAPID_HOST = 'indian-stock-market-data-nse-bse.p.rapidapi.com';

    try {
        // --- SEARCH ACTION ---
        if (action === 'search') {
            const response = await fetch(`https://${RAPID_HOST}/search?q=${encodeURIComponent(q)}`, {
                headers: { 'x-rapidapi-key': RAPID_KEY, 'x-rapidapi-host': RAPID_HOST }
            });
            const data = await response.json();

            // FIXED: Handle both Arrays and Objects to prevent .map() errors
            const rawResults = Array.isArray(data) ? data : (data.results || data.data || []);
            
            const results = rawResults.slice(0, 8).map(i => ({
                symbol: i.symbol || i.scrip_cd || i.identifier,
                name: i.name || i.companyName || i.symbol
            }));
            
            return res.status(200).json({ results });
        }

        // --- QUOTE ACTION ---
        if (action === 'quote') {
            const cleanSymbol = symbol.toUpperCase();
            const response = await fetch(`https://${RAPID_HOST}/stock-full-info?symbol=${encodeURIComponent(cleanSymbol)}`, {
                headers: { 'x-rapidapi-key': RAPID_KEY, 'x-rapidapi-host': RAPID_HOST }
            });
            const d = await response.json();

            // Check if we got valid price data
            if (!d || (!d.lastPrice && !d.currentPrice)) {
                return res.status(404).json({ error: `No price data for ${cleanSymbol}` });
            }

            return res.status(200).json({
                symbol: d.symbol || cleanSymbol,
                name: d.companyName || d.identifier || cleanSymbol,
                price: d.lastPrice || d.currentPrice || 0,
                changePct: d.pChange || 0,
                high52: d.dayHigh || 0,
                pe: d.pe || "N/A"
            });
        }
    } catch (err) {
        console.error("Build Error:", err.message);
        return res.status(500).json({ error: 'Data Processing Error', details: err.message });
    }
}
