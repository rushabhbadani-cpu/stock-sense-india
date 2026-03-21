export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    const { action, q, symbol } = req.query;
    const RAPID_KEY = '06c40cc462msh2a69c4bed748376p121936jsna8eb70935d62';
    const RAPID_HOST = 'indian-stock-market-data-nse-bse.p.rapidapi.com';

    try {
        // --- SEARCH: Finding the Symbol ---
        if (action === 'search') {
            // Some Indian APIs prefer 'stock_name' instead of 'q'
            const response = await fetch(`https://${RAPID_HOST}/search?q=${encodeURIComponent(q)}`, {
                headers: { 'x-rapidapi-key': RAPID_KEY, 'x-rapidapi-host': RAPID_HOST }
            });
            const data = await response.json();

            // StocksCy fallback: sometimes data is in .data or .stocks
            const list = Array.isArray(data) ? data : (data.data || data.stocks || []);
            
            const results = list.slice(0, 10).map(item => ({
                symbol: item.symbol || item.scrip_cd || item.ticker || "UNKNOWN",
                name: item.name || item.companyName || item.symbol || "Stock"
            }));
            
            return res.status(200).json({ results });
        }

        // --- QUOTE: Getting the Live Price ---
        if (action === 'quote') {
            // We use 'stock-full-info' as seen in your screenshot's suggested endpoints
            const response = await fetch(`https://${RAPID_HOST}/stock-full-info?symbol=${encodeURIComponent(symbol)}`, {
                headers: { 'x-rapidapi-key': RAPID_KEY, 'x-rapidapi-host': RAPID_HOST }
            });
            const d = await response.json();

            if (!d || (!d.lastPrice && !d.currentPrice)) {
                return res.status(404).json({ error: `Market data restricted for ${symbol}` });
            }

            return res.status(200).json({
                symbol: d.symbol || symbol,
                name: d.companyName || d.identifier || symbol,
                price: d.lastPrice || d.currentPrice || 0,
                changePct: d.pChange || 0,
                high52: d.dayHigh || 0,
                pe: d.pe || "N/A"
            });
        }
    } catch (err) {
        return res.status(500).json({ error: 'API Handshake Failed', details: err.message });
    }
}
