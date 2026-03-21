// Add this inside your existing handler in api/market.js
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    const { action = 'quote', symbol, q } = req.query;

    try {
        if (action === 'search') {
            // This calls Yahoo's search API to find symbols like "RELIANCE.NS"
            const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=5&newsCount=0&listsCount=0`;
            const r = await httpsGet(url);
            const results = r.body?.quotes?.map(item => ({
                symbol: item.symbol,
                name: item.shortname || item.longname,
                exch: item.exchDisp
            })) || [];
            return res.status(200).json({ results });
        }

        if (action === 'quote') {
            const data = await trySymbols(symbol || 'TCS', '/v8/finance/chart/{SYM}?interval=1d&range=1d');
            if (!data) return res.status(404).json({ error: "Not found" });
            
            const result = data.data.chart.result[0];
            const m = result.meta;
            return res.status(200).json({
                symbol: data.sym,
                price: m.regularMarketPrice,
                change: (m.regularMarketPrice - m.previousClose).toFixed(2),
                changePct: (((m.regularMarketPrice - m.previousClose) / m.previousClose) * 100).toFixed(2),
                longName: m.longName || data.sym
            });
        }
        // ... rest of your logic
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}
