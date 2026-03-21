// api/market.js
export default async function handler(req, res) {
    const { action, q, symbol } = req.query;
    
    // YOUR RAPIDAPI CONFIGURATION
    const RAPID_KEY = '06c40cc462msh2a69c4bed748376p121936jsna8eb70935d62';
    const RAPID_HOST = 'yh-finance.p.rapidapi.com'; 

    const headers = {
        'x-rapidapi-key': RAPID_KEY,
        'x-rapidapi-host': RAPID_HOST
    };

    try {
        // --- ACTION: SEARCH (Autocomplete) ---
        if (action === 'search') {
            const response = await fetch(`https://${RAPID_HOST}/auto-complete?q=${q}&region=IN`, { headers });
            const data = await response.json();
            
            // Filters only for STOCKS to keep the list clean
            const results = (data.quotes || [])
                .filter(item => item.quoteType === "EQUITY")
                .map(item => ({
                    symbol: item.symbol,
                    name: item.shortname || item.longname || item.symbol
                }));
            
            return res.status(200).json({ results });
        }

        // --- ACTION: QUOTE (Detailed Info + Educational Data) ---
        if (action === 'quote') {
            // We fetch "Summary" which includes Price, P/E, High/Low, and Market Cap
            const response = await fetch(`https://${RAPID_HOST}/stock/v2/get-summary?symbol=${symbol}&region=IN`, { headers });
            const data = await response.json();

            if (!data.price) return res.status(404).json({ error: "Stock not found" });

            // Standardizing the response for your Homepage/Research tabs
            const cleanData = {
                symbol: data.symbol,
                longName: data.price.longName || data.symbol,
                price: data.price.regularMarketPrice?.raw || 0,
                changePercent: data.price.regularMarketChangePercent?.fmt || "0%",
                high52: data.summaryDetail?.fiftyTwoWeekHigh?.fmt || "N/A",
                low52: data.summaryDetail?.fiftyTwoWeekLow?.fmt || "N/A",
                pe: data.summaryDetail?.trailingPE?.raw || null,
                sector: data.summaryProfile?.sector || "General",
                description: data.summaryProfile?.longBusinessSummary || ""
            };
            
            return res.status(200).json(cleanData);
        }

    } catch (error) {
        console.error("Backend Error:", error);
        res.status(500).json({ error: "API Connection Failed" });
    }
}
