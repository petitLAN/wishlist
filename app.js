/**
 * app.js — Moving sale catalog
 * Fully data-driven: filters and labels are derived from the JSON data.
 * Supports local images, priority rating, "bought" state, and multiple links in description.
 */

// ----- STATE ------------------------------------------------------------
let items = [];
let filteredItems = [];
let activeCategory = 'all';
let activeCondition = 'all';
let currentSort = 'date-desc';
let currentItemId = null;

// ----- DOM refs --------------------------------------------------------
const grid = document.getElementById('itemGrid');
const modalOverlay = document.getElementById('modalOverlay');
const modalContent = document.getElementById('modalContent');
const modalClose = document.getElementById('modalClose');
const sortSelect = document.getElementById('sortSelect');
const clearFiltersBtn = document.getElementById('clearFilters');
const resultsCount = document.getElementById('resultsCount');
const totalCount = document.getElementById('totalCount');
const categoryFiltersContainer = document.getElementById('categoryFilters');
const conditionFiltersContainer = document.getElementById('conditionFilters');

// ----- helpers --------------------------------------------------------
function getConditionClass(condition) {
    const map = {
        'Good': 'condition-good',
        'Like-new': 'condition-like-new',
        'Fair': 'condition-fair'
    };
    return map[condition] || '';
}

function formatPrice(price) {
    return 'CHF ' + price.toFixed(2);
}

function getPriorityStars(priority) {
    if (!priority) return '';
    const full = Math.min(5, Math.max(0, Math.round(priority)));
    return '★'.repeat(full) + '☆'.repeat(5 - full);
}

function getEmojiForItem(title) {
    const lower = title.toLowerCase();
    if (lower.includes('laptop') || lower.includes('xps')) return '💻';
    if (lower.includes('treadmill')) return '🏃';
    if (lower.includes('bike') || lower.includes('scrapper')) return '🚲';
    if (lower.includes('headphone') || lower.includes('sony')) return '🎧';
    if (lower.includes('ski')) return '⛷️';
    if (lower.includes('boot')) return '🥾';
    if (lower.includes('monitor')) return '🖥️';
    if (lower.includes('webcam')) return '📷';
    return '📦';
}

// ----- Sanitize HTML (allow only safe tags and attributes) -------------
function sanitizeHTML(html) {
    // Use a DOMParser to parse and walk the tree
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const body = doc.body;

    // Allowed tags and their allowed attributes
    const allowedTags = ['a', 'p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'b', 'i', 'sub', 'sup'];
    const allowedAttrs = {
        'a': ['href', 'target', 'rel', 'title']
    };

    function cleanNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            // keep text
            return node.cloneNode();
        }

        if (node.nodeType === Node.ELEMENT_NODE) {
            const tagName = node.tagName.toLowerCase();
            if (!allowedTags.includes(tagName)) {
                // Replace with a span or just keep children
                const span = document.createElement('span');
                node.childNodes.forEach(child => {
                    const cleaned = cleanNode(child);
                    if (cleaned) span.appendChild(cleaned);
                });
                return span;
            }

            const newNode = document.createElement(tagName);
            // Copy allowed attributes
            if (tagName === 'a') {
                const attrs = allowedAttrs['a'];
                attrs.forEach(attr => {
                    if (node.hasAttribute(attr)) {
                        newNode.setAttribute(attr, node.getAttribute(attr));
                    }
                });
                // Ensure target="_blank" for security
                if (!newNode.hasAttribute('target')) {
                    newNode.setAttribute('target', '_blank');
                }
                if (!newNode.hasAttribute('rel')) {
                    newNode.setAttribute('rel', 'noopener noreferrer');
                }
            } else {
                // Copy only common safe attributes like class, style? we can skip for simplicity
                // We'll keep only id or class if we want, but we won't to keep it clean
            }

            node.childNodes.forEach(child => {
                const cleaned = cleanNode(child);
                if (cleaned) newNode.appendChild(cleaned);
            });
            return newNode;
        }
        return null; // other node types ignored
    }

    const cleanedBody = document.createElement('div');
    body.childNodes.forEach(child => {
        const cleaned = cleanNode(child);
        if (cleaned) cleanedBody.appendChild(cleaned);
    });
    return cleanedBody.innerHTML;
}

// ----- extract unique values from data ---------------------------------
function getUniqueValues(key) {
    const values = new Set();
    items.forEach(item => {
        if (item[key]) values.add(item[key]);
    });
    return Array.from(values).sort();
}

// ----- build filter buttons --------------------------------------------
function buildFilterButtons(container, filterKey, activeValue) {
    const values = getUniqueValues(filterKey);
    let html = `<button class="filter-btn active" data-filter="${filterKey}" data-value="all">All</button>`;
    values.forEach(val => {
        const isActive = activeValue === val ? 'active' : '';
        html += `<button class="filter-btn ${isActive}" data-filter="${filterKey}" data-value="${val}">${val}</button>`;
    });
    container.innerHTML = html;

    // attach click events
    container.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.filter;
            const value = btn.dataset.value;

            // remove active from siblings
            container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            if (key === 'category') {
                activeCategory = value;
            } else if (key === 'condition') {
                activeCondition = value;
            }
            applyFiltersAndSort();
        });
    });
}

// ----- render grid ----------------------------------------------------
function renderGrid() {
    if (filteredItems.length === 0) {
        grid.innerHTML = `<div class="empty-state">✨ No items match your filters</div>`;
        resultsCount.textContent = 'Showing 0 items';
        return;
    }

    let html = '';
    for (const item of filteredItems) {
        const firstImg = item.images && item.images.length > 0 ? item.images[0] : '';
        const condClass = getConditionClass(item.condition);
        const emoji = getEmojiForItem(item.title);
        const priorityStars = getPriorityStars(item.priority);
        const isBought = item.bought === true;

        // Build card
        let cardClasses = 'item-card';
        if (isBought) cardClasses += ' bought';

        html += `
                <div class="${cardClasses}" data-id="${item.id}" role="listitem">
                    ${isBought ? '<div class="bought-badge">BOUGHT</div>' : ''}
                    <div class="card-image">
                        ${firstImg ? `<img src="${firstImg}" alt="${item.title}" loading="lazy" />` : `<span style="font-size:56px;">${emoji}</span>`}
                    </div>
                    <div class="card-body">
                        <div class="card-title">${item.title}</div>
                        <div class="card-price">${formatPrice(item.price)} <small>CHF</small></div>
                        <div class="card-labels">
                            <span class="label category">${item.category}</span>
                            <span class="label ${condClass}">${item.condition}</span>
                            ${item.priority ? `<span class="label priority">${priorityStars}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
    }

    grid.innerHTML = html;
    resultsCount.textContent = `Showing ${filteredItems.length} items`;
    totalCount.textContent = items.length;

    // attach click listeners to cards
    document.querySelectorAll('.item-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = parseInt(card.dataset.id);
            openModal(id);
        });
    });
}

// ----- filtering & sorting --------------------------------------------
function applyFiltersAndSort() {
    // First filter by category and condition
    let result = [...items];

    if (activeCategory !== 'all') {
        result = result.filter(item => item.category === activeCategory);
    }
    if (activeCondition !== 'all') {
        result = result.filter(item => item.condition === activeCondition);
    }

    // Split into active and bought
    const activeItems = result.filter(item => !item.bought);
    const boughtItems = result.filter(item => item.bought === true);

    // Sort each group according to current sort
    const sortFn = getSortFunction(currentSort);
    activeItems.sort(sortFn);
    boughtItems.sort(sortFn);

    // Concatenate: active first, then bought
    filteredItems = [...activeItems, ...boughtItems];
    renderGrid();
}

function getSortFunction(sortKey) {
    switch (sortKey) {
        case 'price-asc':
            return (a, b) => a.price - b.price;
        case 'price-desc':
            return (a, b) => b.price - a.price;
        case 'date-asc':
            return (a, b) => new Date(a.dateAdded) - new Date(b.dateAdded);
        case 'priority-desc':
            return (a, b) => (b.priority || 0) - (a.priority || 0);
        case 'date-desc':
        default:
            return (a, b) => new Date(b.dateAdded) - new Date(a.dateAdded);
    }
}

// ----- modal ----------------------------------------------------------
function openModal(id) {
    const item = items.find(i => i.id === id);
    if (!item) return;

    currentItemId = id;
    const condClass = getConditionClass(item.condition);
    const images = item.images || [];
    const priorityStars = getPriorityStars(item.priority);
    const isBought = item.bought === true;

    // build gallery thumbnails
    let thumbsHtml = '';
    if (images.length > 0) {
        images.forEach((img, i) => {
            const activeClass = i === 0 ? 'active' : '';
            thumbsHtml += `
                    <div class="thumb ${activeClass}" data-index="${i}">
                        <img src="${img}" alt="${item.title} — image ${i+1}" />
                    </div>
                `;
        });
    } else {
        thumbsHtml = '<span style="font-size:14px;color:#94a3b8;">No additional images</span>';
    }

    const boughtLabel = isBought ? '<span class="label bought-status">Bought</span>' : '';

    // Sanitize description to allow safe HTML (links, etc.)
    const safeDescription = item.description ? sanitizeHTML(item.description) : 'No description available.';

    modalContent.innerHTML = `
            <div class="modal-gallery">
                <div class="main-image" id="modalMainImage">
                    <img src="${images.length > 0 ? images[0] : ''}" alt="${item.title}" />
                </div>
                <div class="thumbnails" id="modalThumbnails">
                    ${thumbsHtml}
                </div>
            </div>

            <div class="modal-title">${item.title}</div>
            <div class="modal-price">${formatPrice(item.price)} <small>CHF</small></div>

            <div class="modal-meta">
                <span class="label category">${item.category}</span>
                <span class="label ${condClass}">${item.condition}</span>
                ${item.priority ? `<span class="label priority">${priorityStars}</span>` : ''}
                ${boughtLabel}
            </div>

            <div class="modal-description">${safeDescription}</div>

            <div class="modal-link">
                <a href="${item.link || '#'}" target="_blank" rel="noopener noreferrer">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                    View product page
                </a>
            </div>
        `;

    // thumbnail click handling
    const thumbs = modalContent.querySelectorAll('.thumb');
    const mainImg = modalContent.querySelector('#modalMainImage img');

    thumbs.forEach((thumb) => {
        thumb.addEventListener('click', () => {
            thumbs.forEach(t => t.classList.remove('active'));
            thumb.classList.add('active');
            const imgSrc = thumb.querySelector('img').src;
            mainImg.src = imgSrc;
        });
    });

    modalOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    modalOverlay.classList.remove('open');
    document.body.style.overflow = '';
    currentItemId = null;
}

// ----- load data from JSON --------------------------------------------
async function loadData() {
    try {
        const response = await fetch('data.json');
        if (!response.ok) throw new Error('Failed to load data.json');
        items = await response.json();

        // ensure each item has an id, images array, dateAdded, and bought default
        items.forEach((item, index) => {
            if (!item.id) item.id = index + 1;
            if (!item.images) item.images = [];
            if (!item.dateAdded) item.dateAdded = new Date().toISOString().split('T')[0];
            if (item.bought === undefined) item.bought = false;
            // prepend "images/" to each image filename (if not already a URL)
            item.images = item.images.map(img => img.startsWith('http') || img.startsWith('data:') ? img : `images/${img}`);
        });

        // build dynamic filters
        buildFilterButtons(categoryFiltersContainer, 'category', activeCategory);
        buildFilterButtons(conditionFiltersContainer, 'condition', activeCondition);

        // initial render
        applyFiltersAndSort();

    } catch (error) {
        console.error('Error loading data:', error);
        grid.innerHTML = `<div class="empty-state">⚠️ Could not load items. Please check that data.json exists and images are in the "images" folder.</div>`;
    }
}

// ----- event listeners ------------------------------------------------
// sort select
sortSelect.addEventListener('change', () => {
    currentSort = sortSelect.value;
    applyFiltersAndSort();
});

// clear filters
clearFiltersBtn.addEventListener('click', () => {
    // reset category
    categoryFiltersContainer.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    const allCat = categoryFiltersContainer.querySelector('.filter-btn[data-value="all"]');
    if (allCat) allCat.classList.add('active');
    activeCategory = 'all';

    // reset condition
    conditionFiltersContainer.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    const allCond = conditionFiltersContainer.querySelector('.filter-btn[data-value="all"]');
    if (allCond) allCond.classList.add('active');
    activeCondition = 'all';

    // reset sort
    sortSelect.value = 'date-desc';
    currentSort = 'date-desc';

    applyFiltersAndSort();
});

// modal close
modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
});

// ----- init -----------------------------------------------------------
document.addEventListener('DOMContentLoaded', loadData);