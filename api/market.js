export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    const { action, symbol, q } = req.query;
    const API_KEY = 'YOUR_INDIAN_API_KEY'; // Swap this with your real key
    const BASE_URL = 'https://stock.indianapi.in';

    try {
        // ACTION 1: Search for company
        if (action === 'search') {
            const r = await fetch(`${BASE_URL}/search?q=${encodeURIComponent(q)}`, { headers: { 'x-api-key': API_KEY } });
            return res.status(200).json(await r.json());
        }

        // ACTION 2: Board Meetings & Corporate Actions (The JSON you just sent)
        if (action === 'corporate') {
            const r = await fetch(`${BASE_URL}/stock?symbol=${symbol}`, { headers: { 'x-api-key': API_KEY } });
            const data = await r.json();
            // We only send back the board meetings to keep it clean
            return res.status(200).json(data.board_meetings || { data: [] });
        }

        // ACTION 3: Financial Statements (P&L, Balance Sheet)
        if (action === 'financials') {
            const r = await fetch(`${BASE_URL}/statement?stock_name=${symbol}`, { headers: { 'x-api-key': API_KEY } });
            return res.status(200).json(await r.json());
        }

        return res.status(400).json({ error: "Invalid Action" });
    } catch (err) {
        return res.status(500).json({ error: 'Server Error', details: err.message });
    }
}
