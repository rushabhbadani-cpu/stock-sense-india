// 1. Identify your elements
const searchInp = document.querySelector('.srch-inp');
const searchDrop = document.querySelector('.srch-drop');

// 2. SEARCH AS YOU TYPE
searchInp.addEventListener('input', async (e) => {
    const query = e.target.value;
    if (query.length < 2) {
        searchDrop.classList.remove('open');
        return;
    }

    try {
        // We use /api/market directly for Vercel
        const res = await fetch(`/api/market?action=search&q=${encodeURIComponent(query)}`);
        const data = await res.json();
        
        if (data.results && data.results.length > 0) {
            searchDrop.innerHTML = data.results.map(s => `
                <div class="sditem" onclick="window.selectStock('${s.symbol}')">
                    <span class="sdname">${s.symbol}</span>
                    <span class="sdsect">${s.name}</span>
                </div>
            `).join('');
            searchDrop.classList.add('open');
        }
    } catch (err) {
        console.error("Search failed:", err);
    }
});

// 3. FETCH DATA (Attached to 'window' so the click works)
window.selectStock = async function(symbol) {
    searchDrop.classList.remove('open');
    searchInp.value = symbol;
    
    try {
        const res = await fetch(`/api/market?action=quote&symbol=${symbol}`);
        const stock = await res.json();
        
        if (stock && stock.price) {
            // Update the UI elements you already have
            const dhSym = document.querySelector('.dh-sym');
            const dhName = document.querySelector('.dh-name');
            const dhPrice = document.querySelector('.dh-mv'); 
            
            if(dhSym) dhSym.innerText = stock.symbol;
            if(dhName) dhName.innerText = stock.longName;
            if(dhPrice) dhPrice.innerText = "₹" + stock.price.toLocaleString('en-IN');
        } else {
            console.error("Stock data incomplete", stock);
        }
    } catch (err) {
        console.error("Could not load live price:", err);
    }
};

// Close dropdown if user clicks outside
document.addEventListener('click', (e) => {
    if (!searchInp.contains(e.target) && !searchDrop.contains(e.target)) {
        searchDrop.classList.remove('open');
    }
});
