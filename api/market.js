export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const { action, symbol, q } = req.query;
    
    // AUTHENTICATION: Replace with your actual key from indianapi.in
    const API_KEY = 'YOUR_ACTUAL_INDIAN_API_KEY_HERE'; 
    const BASE_URL = 'https://stock.indianapi.in';

    try {
        if (action === 'test') {
            const r = await fetch(`${BASE_URL}/stock?symbol=INFY`, {
                headers: { 'x-api-key': API_KEY }
            });
            const data = await r.json();
            return res.status(200).json({ status: "Connected", data });
        }

        if (action === 'corporate') {
            const r = await fetch(`${BASE_URL}/stock?symbol=${symbol}`, {
                headers: { 'x-api-key': API_KEY }
            });
            return res.status(200).json(await r.json());
        }

        return res.status(400).json({ error: "No action specified" });
    } catch (err) {
        return res.status(500).json({ error: 'Connection Failed', details: err.message });
    }
}
