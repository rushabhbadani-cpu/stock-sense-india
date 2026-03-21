// StockSense India — Market Proxy v5.0
// Yahoo Finance v10 — complete financials for ANY stock, free, no key

const https = require('https');

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = new URL(url);
    const options = {
      hostname: opts.hostname,
      path: opts.pathname + opts.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        ...headers
      },
      timeout: 10000
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

// Try NSE first, then BSE
async function trySymbols(sym, path) {
  const variants = [`${sym}.NS`, `${sym}.BO`, sym];
  for (const s of variants) {
    try {
      const url = `https://query1.finance.yahoo.com${path.replace('{SYM}', encodeURIComponent(s))}`;
      const r = await httpsGet(url);
      if (r.status === 200 && r.body && !r.body.error) return { data: r.body, sym: s };
    } catch {}
  }
  return null;
}

// ── QUOTE (price data) ────────────────────────────────────────────
async function getQuote(symbol) {
  const res = await trySymbols(symbol, '/v8/finance/chart/{SYM}?interval=1d&range=1d');
  if (!res?.data?.chart?.result) return null;
  const r = res.data.chart.result[0];
  const m = r.meta;
  const price = m.regularMarketPrice || m.previousClose || 0;
  const prev = m.previousClose || price;
  const change = price - prev;
  return {
    symbol, price: +price.toFixed(2),
    change: +change.toFixed(2),
    changePct: prev > 0 ? +((change / prev) * 100).toFixed(2) : 0,
    open: +(m.regularMarketOpen || price).toFixed(2),
    high: +(m.regularMarketDayHigh || price).toFixed(2),
    low: +(m.regularMarketDayLow || price).toFixed(2),
    prevClose: +prev.toFixed(2),
    volume: m.regularMarketVolume || 0,
    w52High: +(m.fiftyTwoWeekHigh || price).toFixed(2),
    w52Low: +(m.fiftyTwoWeekLow || 0).toFixed(2),
    pe: +(m.trailingPE || 0).toFixed(2),
    marketCap: m.marketCap || 0,
    longName: m.longName || m.shortName || symbol,
    exchange: m.exchangeName || 'NSE',
    live: true
  };
}

// ── FULL FINANCIALS via v10 quoteSummary ─────────────────────────
async function getFinancials(symbol) {
  const modules = [
    'incomeStatementHistoryQuarterly',
    'incomeStatementHistory',
    'balanceSheetHistoryQuarterly',
    'cashflowStatementHistory',
    'defaultKeyStatistics',
    'financialData',
    'majorHoldersBreakdown',
    'assetProfile',
    'earningsHistory',
    'summaryDetail'
  ].join(',');

  const res = await trySymbols(symbol, `/v10/finance/quoteSummary/{SYM}?modules=${modules}`);
  if (!res?.data?.quoteSummary?.result) return null;

  const d = res.data.quoteSummary.result[0];
  const fmt = (v) => v?.raw ?? v?.fmt ?? null;
  const fmtPct = (v) => v?.raw != null ? +(v.raw * 100).toFixed(1) : null;

  // Quarterly results
  const quarterlyIS = d.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
  const quarterly = quarterlyIS.slice(0, 6).map(q => ({
    period: q.endDate?.fmt || '',
    revenue: fmt(q.totalRevenue),
    profit: fmt(q.netIncome),
    ebitda: fmt(q.ebitda),
    eps: fmt(q.dilutedEps),
    revenueStr: q.totalRevenue?.fmt || '—',
    profitStr: q.netIncome?.fmt || '—',
  }));

  // Annual P&L
  const annualIS = d.incomeStatementHistory?.incomeStatementHistory || [];
  const annual = annualIS.map(y => ({
    period: y.endDate?.fmt || '',
    revenue: fmt(y.totalRevenue),
    profit: fmt(y.netIncome),
    grossProfit: fmt(y.grossProfit),
    eps: fmt(y.dilutedEps),
    revenueStr: y.totalRevenue?.fmt || '—',
    profitStr: y.netIncome?.fmt || '—',
  }));

  // Balance sheet
  const bsQ = d.balanceSheetHistoryQuarterly?.balanceSheetStatements || [];
  const balanceSheet = bsQ.slice(0, 4).map(b => ({
    period: b.endDate?.fmt || '',
    totalAssets: fmt(b.totalAssets),
    totalLiab: fmt(b.totalLiab),
    stockholderEquity: fmt(b.totalStockholderEquity),
    cash: fmt(b.cash),
    totalDebt: fmt(b.shortLongTermDebt),
    assetsStr: b.totalAssets?.fmt || '—',
    equityStr: b.totalStockholderEquity?.fmt || '—',
  }));

  // Cash flow
  const cfH = d.cashflowStatementHistory?.cashflowStatements || [];
  const cashflow = cfH.slice(0, 4).map(c => ({
    period: c.endDate?.fmt || '',
    operatingCF: fmt(c.totalCashFromOperatingActivities),
    capex: fmt(c.capitalExpenditures),
    freeCF: c.totalCashFromOperatingActivities?.raw && c.capitalExpenditures?.raw
      ? c.totalCashFromOperatingActivities.raw + c.capitalExpenditures.raw : null,
    operatingStr: c.totalCashFromOperatingActivities?.fmt || '—',
  }));

  // Key stats and ratios
  const ks = d.defaultKeyStatistics || {};
  const fd = d.financialData || {};
  const sd = d.summaryDetail || {};
  const ratios = {
    pe: fmt(sd.trailingPE) || fmt(ks.forwardPE),
    pb: fmt(ks.priceToBook),
    roe: fmtPct(fd.returnOnEquity),
    roa: fmtPct(fd.returnOnAssets),
    debtToEquity: fd.debtToEquity?.raw != null ? +(fd.debtToEquity.raw / 100).toFixed(2) : null,
    currentRatio: fmt(fd.currentRatio),
    grossMargin: fmtPct(fd.grossMargins),
    operatingMargin: fmtPct(fd.operatingMargins),
    profitMargin: fmtPct(fd.profitMargins),
    revenueGrowth: fmtPct(fd.revenueGrowth),
    earningsGrowth: fmtPct(fd.earningsGrowth),
    dividendYield: fmtPct(sd.dividendYield),
    beta: fmt(ks.beta),
    eps: fmt(ks.trailingEps),
    bookValue: fmt(ks.bookValue),
    sharesOutstanding: fmt(ks.sharesOutstanding),
  };

  // Shareholding
  const mh = d.majorHoldersBreakdown || {};
  const shareholding = {
    insider: fmtPct(mh.insidersPercentHeld),
    institution: fmtPct(mh.institutionsPercentHeld),
    public: mh.insidersPercentHeld?.raw && mh.institutionsPercentHeld?.raw
      ? +(100 - mh.insidersPercentHeld.raw * 100 - mh.institutionsPercentHeld.raw * 100).toFixed(1) : null,
  };

  // Company profile
  const ap = d.assetProfile || {};
  const officers = (ap.companyOfficers || []).slice(0, 5).map(o => ({
    name: o.name || '',
    title: o.title || '',
    age: o.age || null,
  }));

  // Earnings history with surprise
  const eh = d.earningsHistory?.history || [];
  const earningsHistory = eh.slice(0, 8).map(e => ({
    period: e.period || '',
    date: e.quarter?.fmt || '',
    epsActual: fmt(e.epsActual),
    epsEstimate: fmt(e.epsEstimate),
    surprisePct: fmtPct(e.surprisePercent),
  }));

  return {
    quarterly, annual, balanceSheet, cashflow,
    ratios, shareholding, officers,
    earningsHistory,
    description: ap.longBusinessSummary || '',
    sector: ap.sector || '',
    industry: ap.industry || '',
    website: ap.website || '',
    employees: ap.fullTimeEmployees || null,
    country: ap.country || 'India',
    city: ap.city || '',
    nseUrl: `https://www.nseindia.com/get-quotes/equity?symbol=${symbol}`,
    live: true
  };
}

// ── HISTORY ───────────────────────────────────────────────────────
async function getHistory(symbol, range, interval) {
  const res = await trySymbols(symbol, `/v8/finance/chart/{SYM}?interval=${interval}&range=${range}`);
  if (!res?.data?.chart?.result) return null;
  const r = res.data.chart.result[0];
  const timestamps = r.timestamp || [];
  const closes = r.indicators?.quote?.[0]?.close || [];
  const prices = timestamps.map((ts, i) => ({
    date: new Date(ts * 1000).toISOString().split('T')[0],
    close: closes[i] ? +closes[i].toFixed(2) : null
  })).filter(p => p.close !== null);
  return { prices, live: prices.length > 0 };
}

// ── INDICES ───────────────────────────────────────────────────────
async function getIndices() {
  const INDEX_MAP = {
    '^NSEI': 'NIFTY 50', '^BSESN': 'SENSEX',
    '^NSEBANK': 'NIFTY BANK', '^CNXIT': 'NIFTY IT',
    '^CNXPHARMA': 'NIFTY PHARMA', '^CNXAUTO': 'NIFTY AUTO',
    '^CNXFMCG': 'NIFTY FMCG', '^INDIAVIX': 'INDIA VIX'
  };
  const results = [];
  for (const [sym, name] of Object.entries(INDEX_MAP)) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`;
      const r = await httpsGet(url);
      if (r.status === 200 && r.body?.chart?.result) {
        const m = r.body.chart.result[0].meta;
        const price = m.regularMarketPrice || 0;
        const prev = m.previousClose || price;
        results.push({
          name, symbol: sym,
          value: +price.toFixed(2),
          change: +(price - prev).toFixed(2),
          changePct: prev > 0 ? +((price - prev) / prev * 100).toFixed(2) : 0,
          prevClose: +prev.toFixed(2),
          high: +(m.regularMarketDayHigh || price).toFixed(2),
          low: +(m.regularMarketDayLow || price).toFixed(2),
        });
      }
    } catch {}
  }
  return { indices: results, live: results.length > 0 };
}

// ── COMMODITIES ───────────────────────────────────────────────────
async function getCommodities() {
  const COMM = [
    { sym: 'GC=F',  label: 'Gold',       icon: '🥇', unit: 'USD/oz' },
    { sym: 'SI=F',  label: 'Silver',      icon: '🥈', unit: 'USD/oz' },
    { sym: 'CL=F',  label: 'Crude Oil',   icon: '🛢️', unit: 'USD/bbl' },
    { sym: 'NG=F',  label: 'Natural Gas', icon: '🔥', unit: 'USD/MMBtu' },
    { sym: 'HG=F',  label: 'Copper',      icon: '🔶', unit: 'USD/lb' },
    { sym: 'ALI=F', label: 'Aluminium',   icon: '🔩', unit: 'USD/MT' },
    { sym: 'ZC=F',  label: 'Corn',        icon: '🌽', unit: 'USc/bu' },
    { sym: 'ZW=F',  label: 'Wheat',       icon: '🌾', unit: 'USc/bu' },
    { sym: 'ZS=F',  label: 'Soybean',     icon: '🫘', unit: 'USc/bu' },
    { sym: 'CT=F',  label: 'Cotton',      icon: '☁️', unit: 'USc/lb' },
  ];
  const results = [];
  for (const c of COMM) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(c.sym)}?interval=1d&range=1d`;
      const r = await httpsGet(url);
      if (r.status === 200 && r.body?.chart?.result) {
        const m = r.body.chart.result[0].meta;
        const price = m.regularMarketPrice || 0;
        const prev = m.previousClose || price;
        results.push({ ...c, price: +price.toFixed(2), changePct: prev > 0 ? +((price - prev) / prev * 100).toFixed(2) : 0 });
      }
    } catch {}
  }
  return { commodities: results, live: results.length > 0 };
}

// ── FOREX ─────────────────────────────────────────────────────────
async function getForex() {
  const PAIRS = [
    { sym: 'INR=X',    label: 'USD/INR', flag: '🇺🇸', sub: 'US Dollar' },
    { sym: 'AEDINR=X', label: 'AED/INR', flag: '🇦🇪', sub: 'UAE Dirham' },
    { sym: 'EURINR=X', label: 'EUR/INR', flag: '🇪🇺', sub: 'Euro' },
    { sym: 'GBPINR=X', label: 'GBP/INR', flag: '🇬🇧', sub: 'British Pound' },
    { sym: 'JPYINR=X', label: 'JPY/INR', flag: '🇯🇵', sub: 'Japanese Yen' },
    { sym: 'CNHINR=X', label: 'CNH/INR', flag: '🇨🇳', sub: 'Chinese Yuan' },
    { sym: 'SARINR=X', label: 'SAR/INR', flag: '🇸🇦', sub: 'Saudi Riyal' },
    { sym: 'SGDINR=X', label: 'SGD/INR', flag: '🇸🇬', sub: 'Singapore Dollar' },
  ];
  const results = [];
  for (const p of PAIRS) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(p.sym)}?interval=1d&range=1d`;
      const r = await httpsGet(url);
      if (r.status === 200 && r.body?.chart?.result) {
        const m = r.body.chart.result[0].meta;
        const rate = m.regularMarketPrice || 0;
        const prev = m.previousClose || rate;
        results.push({ ...p, rate: +rate.toFixed(4), changePct: prev > 0 ? +((rate - prev) / prev * 100).toFixed(2) : 0 });
      }
    } catch {}
  }
  return { forex: results, live: results.length > 0 };
}

// ── NEWS ──────────────────────────────────────────────────────────
async function getNews(q) {
  try {
    const query = encodeURIComponent(q || 'India stock market NSE Nifty Sensex');
    const url = `https://news.google.com/rss/search?q=${query}+when:1d&hl=en-IN&gl=IN&ceid=IN:en`;
    const r = await httpsGet(url, { 'Accept': 'application/rss+xml, text/xml' });
    if (r.status === 200 && typeof r.body === 'string') {
      const items = [];
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match;
      while ((match = itemRegex.exec(r.body)) !== null && items.length < 20) {
        const content = match[1];
        const title = (content.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || content.match(/<title>(.*?)<\/title>/))?.[1] || '';
        const source = (content.match(/<source[^>]*>(.*?)<\/source>/))?.[1] || 'News';
        const pubDate = (content.match(/<pubDate>(.*?)<\/pubDate>/))?.[1] || '';
        const link = (content.match(/<link>(.*?)<\/link>/))?.[1] || '';
        if (title) {
          const tl = title.toLowerCase();
          const sentiment = tl.includes('fall')||tl.includes('drop')||tl.includes('crash')||tl.includes('loss')||tl.includes('decline') ? 'negative'
            : tl.includes('rise')||tl.includes('gain')||tl.includes('surge')||tl.includes('rally')||tl.includes('profit') ? 'positive' : 'neutral';
          const d = new Date(pubDate);
          const hrs = Math.round((new Date() - d) / 3600000);
          const timeAgo = hrs < 1 ? 'Just now' : hrs < 24 ? `${hrs}h ago` : `${Math.round(hrs/24)}d ago`;
          items.push({ title: title.replace(/ - [^-]+$/, '').trim().slice(0, 120), source, sentiment, timeAgo, link });
        }
      }
      return { news: items, live: items.length > 0 };
    }
  } catch {}
  return { news: [], live: false };
}

// ── MAIN HANDLER ──────────────────────────────────────────────────
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache'
  };
  const p = event.queryStringParameters || {};
  const action = p.action || 'quote';

  try {
    let result;
    if (action === 'quote') {
      result = await getQuote(p.symbol || 'TCS') || { live: false, error: 'No data' };
    } else if (action === 'financials') {
      result = await getFinancials(p.symbol || 'TCS') || { live: false, error: 'No data' };
    } else if (action === 'history') {
      result = await getHistory(p.symbol || 'TCS', p.range || '1y', p.interval || '1wk') || { live: false, prices: [] };
    } else if (action === 'indices') {
      result = await getIndices();
    } else if (action === 'commodities') {
      result = await getCommodities();
    } else if (action === 'forex') {
      result = await getForex();
    } else if (action === 'news') {
      result = await getNews(p.q);
    } else {
      result = { error: 'Unknown action' };
    }
    return { statusCode: 200, headers, body: JSON.stringify(result) };
  } catch (e) {
    return { statusCode: 200, headers, body: JSON.stringify({ live: false, error: e.message }) };
  }
};
