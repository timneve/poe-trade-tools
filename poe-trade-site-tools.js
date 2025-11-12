// ==UserScript==
// @name         PoE Trade Tools
// @namespace    http://tampermonkey.net/
// @version      2025-10-23
// @description  Group listings by account, show item count, and add seller overview menu with teleport buttons
// @author       Giapreys
// @match        https://www.pathofexile.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=pathofexile.com
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // Inject custom CSS
    document.head.append(Object.assign(document.createElement("style"), {
        type: "text/css",
        textContent: `
        body {
            background: black;
        }

        .btn.btn-xs.btn-default.direct-btn.active.disabled {
            color: red;
            opacity: 0.2;
        }

        .acc-count-badge {
            margin-left: 6px;
            color: #e9cf9f;
            font-weight: bold;
            font-size: 0.9em;
        }

        #poe-seller-menu {
            position: fixed;
            top: 70px;
            right: 20px;
            max-height: 80vh;
            overflow-y: auto;
            background: #1e1e1e;
            color: #e9cf9f;
            border: 1px solid #444;
            padding: 12px;
            z-index: 9999;
            font-size: 13px;
            font-family: sans-serif;
            transition: width 0.3s ease;
        }

        #poe-seller-menu.minimized {
            width: 40px;
            height: 40px;
            padding: 8px;
            overflow: hidden;
        }

        #poe-seller-menu .menu-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 4px;
        }

        #poe-seller-menu.minimized .menu-header {
            width: 20px;
            height: 20px;
        }

        #poe-seller-menu .toggle-btn {
            background: none;
            border: none;
            color: #e9cf9f;
            font-size: 16px;
            cursor: pointer;
            padding: 0;
            line-height: 1;
        }

        #poe-seller-menu .toggle-btn:hover {
            color: white;
        }

        #poe-seller-menu .menu-content {
            display: flex;
            flex-direction: column;
        }

        #poe-seller-menu.minimized .menu-content {
            display: none;
        }

        #poe-seller-menu.minimized .menu-title {
            display: none;
        }

        #poe-seller-menu .menu-title {
            font-weight: bold;
            margin-bottom: 4px;
            text-align: center;
        }

        #poe-seller-menu .menu-description {
            font-size: 11px;
            color: #999;
            margin-bottom: 8px;
        }

        #poe-seller-menu .seller-name {
            color: #e9cf9f;
            font-weight: bold;
            font-size: 11px;
            display: block;
            margin-top: 2px;
        }

        #poe-seller-menu .item-count {
            color: white;
            font-weight: bold;
        }

        #poe-seller-menu .refresh-btn {
            margin: 0 auto;
            padding: 4px;
            background: #444;
            color: white;
            border: 1px solid #666;
            cursor: pointer;
            font-weight: bold;
        }

        #poe-seller-menu .refresh-btn:hover {
            background: #555;
        }

        #poe-seller-menu .seller-entry {
            margin-bottom: 6px;
            padding: 4px;
            cursor: pointer;
            border-radius: 3px;
            transition: background-color 0.2s;
        }

        #poe-seller-menu .seller-entry:hover {
            background: #333;
        }

        #poe-seller-menu .price-good {
            color: #4CAF50 !important;
            font-weight: bold;
        }

        #poe-seller-menu .price-bad {
            color: #F44336 !important;
        }
    `
    }));

    // Cookie utility functions
    function setCookie(name, value, days = 30) {
        const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
        document.cookie = `${name}=${value}; expires=${expires}; path=/`;
    }

    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
    }

    function createSellerMenu(accountMap) {
        const oldMenu = document.getElementById('poe-seller-menu');
        const wasMinimized = oldMenu ? oldMenu.classList.contains('minimized') : getCookie('poe-menu-minimized') === 'true';
        if (oldMenu) oldMenu.remove();

        const menu = document.createElement('div');
        menu.id = 'poe-seller-menu';
        if (wasMinimized) {
            menu.classList.add('minimized');
        }

        // Header with title and toggle button
        const header = document.createElement('div');
        header.className = 'menu-header';

        const title = document.createElement('div');
        title.className = 'menu-title';
        title.textContent = 'Bulk Sellers';

        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'toggle-btn';
        toggleBtn.textContent = '📦';
        toggleBtn.onclick = () => {
            menu.classList.toggle('minimized');
            // Save state to cookie
            setCookie('poe-menu-minimized', menu.classList.contains('minimized'));
        };

        header.appendChild(title);
        header.appendChild(toggleBtn);
        menu.appendChild(header);

        // Menu content (everything except the header)
        const content = document.createElement('div');
        content.className = 'menu-content';

        const description = document.createElement('div');
        description.className = 'menu-description';
        description.textContent = 'Click on name to teleport';
        content.appendChild(description);

        // First pass: collect all prices by currency
        const pricesByCurrency = new Map();
        accountMap.forEach((listings, accName) => {
            if (listings.length <= 1) return;

            const firstListing = listings[0];
            const priceSpan = firstListing.querySelector('[data-field="price"]');
            if (priceSpan) {
                const spans = priceSpan.querySelectorAll('span');
                const amountSpan = spans[1];
                const currencyImgElement = priceSpan.querySelector('.currency-image img');
                if (amountSpan && currencyImgElement) {
                    const amount = parseFloat(amountSpan.textContent.trim());
                    const currency = currencyImgElement.getAttribute('title');
                    
                    if (!pricesByCurrency.has(currency)) {
                        pricesByCurrency.set(currency, []);
                    }
                    pricesByCurrency.get(currency).push({ amount, accName });
                }
            }
        });

        // Calculate price thresholds for each currency
        const priceThresholds = new Map();
        pricesByCurrency.forEach((prices, currency) => {
            if (prices.length < 2) return; // Need at least 2 sellers to compare
            
            const amounts = prices.map(p => p.amount).sort((a, b) => a - b);
            const minPrice = amounts[0];
            const maxPrice = amounts[amounts.length - 1];
            const priceRange = maxPrice - minPrice;
            
            // Good deal: bottom 30% of price range
            // Bad deal: top 30% of price range
            const goodThreshold = minPrice + (priceRange * 0.3);
            const badThreshold = maxPrice - (priceRange * 0.3);
            
            priceThresholds.set(currency, { good: goodThreshold, bad: badThreshold });
        });

        accountMap.forEach((listings, accName) => {
            if (listings.length <= 1) return;

            // Get the price from the first listing
            let priceText = '';
            let currencyImg = null;
            let priceClass = '';
            const firstListing = listings[0];
            const priceSpan = firstListing.querySelector('[data-field="price"]');
            if (priceSpan) {
                const spans = priceSpan.querySelectorAll('span');
                const amountSpan = spans[1]; // Second span is the price amount
                const currencyImgElement = priceSpan.querySelector('.currency-image img');
                if (amountSpan && currencyImgElement) {
                    const amount = parseFloat(amountSpan.textContent.trim());
                    const currency = currencyImgElement.getAttribute('title');
                    priceText = ` @ ${amountSpan.textContent.trim()} ${currency}`;
                    
                    // Determine price class based on thresholds
                    const threshold = priceThresholds.get(currency);
                    if (threshold) {
                        if (amount <= threshold.good) {
                            priceClass = 'price-good';
                        } else if (amount >= threshold.bad) {
                            priceClass = 'price-bad';
                        }
                    }
                    
                    // Clone the currency image for display
                    currencyImg = currencyImgElement.cloneNode(true);
                    currencyImg.style.cssText = 'width: 16px; height: 16px; margin-left: 4px; vertical-align: middle;';
                }
            }

            const entry = document.createElement('div');
            entry.className = 'seller-entry';
            entry.onclick = () => {
                for (const listing of listings) {
                    const teleportBtn = listing.querySelector('.direct-btn');
                    if (teleportBtn && teleportBtn.textContent.includes('Travel')) {
                        teleportBtn.click();
                        break;
                    }
                }
            };

            const infoSpan = document.createElement('span');
            infoSpan.innerHTML = `<span class="item-count">${listings.length}</span> items @ `;
            entry.appendChild(infoSpan);

            // Add price amount with color coding
            if (priceText) {
                const priceMatch = priceText.match(/ @ (\d+(?:\.\d+)?)\s*(.+)/);
                if (priceMatch) {
                    const priceAmount = document.createElement('span');
                    priceAmount.textContent = priceMatch[1];
                    if (priceClass) {
                        priceAmount.className = priceClass;
                    }
                    entry.appendChild(priceAmount);

                    const currencyText = document.createElement('span');
                    currencyText.textContent = ` ${priceMatch[2]}`;
                    entry.appendChild(currencyText);
                } else {
                    const fullPrice = document.createElement('span');
                    fullPrice.textContent = priceText;
                    entry.appendChild(fullPrice);
                }
            }

            // Add currency image if available
            if (currencyImg) {
                entry.appendChild(currencyImg);
            }

            // Add account name on new line
            const nameSpan = document.createElement('span');
            nameSpan.className = 'seller-name';
            nameSpan.textContent = accName;
            entry.appendChild(nameSpan);

            content.appendChild(entry);
        });

        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'refresh-btn';
        refreshBtn.textContent = '🔄 Refresh Listings';
        refreshBtn.onclick = () => groupListingsAndShowMenu();
        content.appendChild(refreshBtn);

        menu.appendChild(content);
        document.body.appendChild(menu);
    }

    function groupListingsAndShowMenu() {
        const listings = document.querySelectorAll('.row');
        const accountMap = new Map();

        listings.forEach(listing => {
            const accSpan = listing.querySelector('.character-name, .profile-link');
            if (!accSpan) return;

            // Clean the account name by removing any existing badge text
            let accName = accSpan.textContent.trim();
            // Remove existing badge pattern like "(3 items)" from the account name
            accName = accName.replace(/\(\d+\s+items?\)/g, '').trim();

            if (!accName) return;

            if (!accountMap.has(accName)) {
                accountMap.set(accName, []);
            }
            accountMap.get(accName).push(listing);
        });

        createSellerMenu(accountMap);
    }

    // Debounced observer to prevent Chrome crashes
    let debounceTimer;
    const observer = new MutationObserver(() => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            if (document.querySelectorAll('.row').length > 0) {
                groupListingsAndShowMenu();
            }
        }, 1000); // Wait 1 second after last mutation
    });

    const app = document.getElementById('app');
    if (app) {
        observer.observe(app, { childList: true, subtree: true });
    }

    // Initial run
    setTimeout(groupListingsAndShowMenu, 2000);
})();
