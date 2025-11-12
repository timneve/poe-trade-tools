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
            width: 250px;
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
            color: white;
            font-weight: bold;
        }

        #poe-seller-menu .refresh-btn {
            width: 100%;
            margin-top: 8px;
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
    `
    }));

    function createSellerMenu(accountMap) {
        const oldMenu = document.getElementById('poe-seller-menu');
        const wasMinimized = oldMenu && oldMenu.classList.contains('minimized');
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

        accountMap.forEach((listings, accName) => {
            if (listings.length <= 1) return;

            // Get the price from the first listing
            let priceText = '';
            let currencyImg = null;
            const firstListing = listings[0];
            const priceSpan = firstListing.querySelector('[data-field="price"]');
            if (priceSpan) {
                const spans = priceSpan.querySelectorAll('span');
                const amountSpan = spans[1]; // Second span is the price amount
                const currencyImgElement = priceSpan.querySelector('.currency-image img');
                if (amountSpan && currencyImgElement) {
                    const amount = amountSpan.textContent.trim();
                    const currency = currencyImgElement.getAttribute('title');
                    priceText = ` @ ${amount} ${currency}`;
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

            const nameSpan = document.createElement('span');
            nameSpan.className = 'seller-name';
            nameSpan.textContent = accName;
            entry.appendChild(nameSpan);

            const infoSpan = document.createElement('span');
            infoSpan.textContent = ` (${listings.length} items)${priceText}`;
            entry.appendChild(infoSpan);

            // Add currency image if available
            if (currencyImg) {
                entry.appendChild(currencyImg);
            }

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
