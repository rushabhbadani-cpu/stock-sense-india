export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    const { action, q, symbol } = req.query;
    const RAPID_KEY = '06c40cc462msh2a69c4bed748376p121936jsna8eb70935d62';
    const RAPID_HOST = 'indian-stock-market-data-nse-bse.p.rapidapi.com';

    try {
        // 1. SEARCH: Matches "Reliance" to the correct ID
        if (action === 'search') {
            const response = await fetch(`https://${RAPID_HOST}/search?q=${encodeURIComponent(q)}`, {
                headers: { 'x-rapidapi-key': RAPID_KEY, 'x-rapidapi-host': RAPID_HOST }
            });
            const data = await response.json();
            // Map the results so the frontend can display them
            const results = (data || []).map(i => ({
                symbol: i.symbol || i.scrip_cd, // StocksCy uses symbol or scrip_cd
                name: i.name || i.symbol
            }));
            return res.status(200).json({ results });
        }

        // 2. QUOTE: Gets the live price
        if (action === 'quote') {
            // Force symbol to Uppercase (APIs are often case-sensitive)
            const cleanSymbol = symbol.toUpperCase();
            
            // Try the 'stock-full-info' endpoint which is usually the most reliable
            const response = await fetch(`https://${RAPID_HOST}/stock-full-info?symbol=${encodeURIComponent(cleanSymbol)}`, {
                headers: { 'x-rapidapi-key': RAPID_KEY, 'x-rapidapi-host': RAPID_HOST }
            });
            
            const d = await response.json();

            // If the first try fails, we send a clear error for debugging
            if (!d || (!d.lastPrice && !d.currentPrice)) {
                return res.status(404).json({ 
                    error: `Symbol ${cleanSymbol} not recognized by StocksCy.`,
                    suggestion: "Try searching for the stock first to get the exact ID."
                });
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
        return res.status(500).json({ error: 'API Connection Failed', details: err.message });
    }
}
