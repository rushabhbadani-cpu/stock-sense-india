export default async function handler(req, res) {
    // Standard CORS headers so your frontend can talk to this backend
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Content-Type', 'application/json');

    const { action, symbol, q } = req.query;
    
    // Credentials from your RapidAPI Screenshot
    const RAPID_KEY = '06c40cc462msh2a69c4bed748376p121936jsna8eb70935d62';
    const RAPID_HOST = 'indian-stock-exchange-api2.p.rapidapi.com';

    try {
        let url = '';
        
        // Routing based on user action
        if (action === 'search') {
            url = `https://${RAPID_HOST}/search?q=${encodeURIComponent(q)}`;
        } else if (action === 'corporate') {
            // Mapping for Dividends/Meetings
            url = `https://${RAPID_HOST}/corporate_actions?stock_name=${symbol}`;
        } else if (action === 'details') {
            // Mapping for Price/52W High-Low
            url = `https://${RAPID_HOST}/stock-details?symbol=${symbol}`;
        } else {
            return res.status(400).json({ error: "Invalid action. Use search, corporate, or details." });
        }

        const response = await fetch(url, {
            headers: {
                'x-rapidapi-key': RAPID_KEY,
                'x-rapidapi-host': RAPID_HOST
            }
        });

        const data = await response.json();
        return res.status(200).json(data);

    } catch (err) {
        return res.status(500).json({ error: 'Sync Error', details: err.message });
    }
}
