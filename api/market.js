export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    const { action, q, symbol } = req.query;
    const RAPID_KEY = '06c40cc462msh2a69c4bed748376p121936jsna8eb70935d62';
    // SWITCHED TO YOUR ACTIVE SUBSCRIPTION: StocksCy
    const RAPID_HOST = 'indian-stock-market-data-nse-bse.p.rapidapi.com';

    try {
        // ACTION: SEARCH (Using StocksCy Search)
        if (action === 'search') {
            const response = await fetch(`https://${RAPID_HOST}/search?q=${encodeURIComponent(q)}`, {
                headers: { 'x-rapidapi-key': RAPID_KEY, 'x-rapidapi-host': RAPID_HOST }
            });
            const data = await response.json();
            // StocksCy returns an array directly
            const results = (data || []).slice(0, 5).map(i => ({
                symbol: i.symbol,
                name: i.name || i.symbol
            }));
            return res.status(200).json({ results });
        }

        // ACTION: QUOTE (Using StocksCy Live Price)
        if (action === 'quote') {
            const response = await fetch(`https://${RAPID_HOST}/stock-full-info?symbol=${encodeURIComponent(symbol)}`, {
                headers: { 'x-rapidapi-key': RAPID_KEY, 'x-rapidapi-host': RAPID_HOST }
              });
            const d = await response.json();

            if (!d || !d.lastPrice) {
                return res.status(404).json({ error: "Stock details not found in StocksCy" });
            }

            return res.status(200).json({
                symbol: d.symbol,
                name: d.identifier || d.symbol,
                price: d.lastPrice || 0,
                changePct: d.pChange || 0,
                high52: d.dayHigh || 0,
                pe: d.pe || 0
            });
        }
    } catch (err) {
        return res.status(500).json({ error: 'Provider Error', details: err.message });
    }
}
