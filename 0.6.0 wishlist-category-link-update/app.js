/**
 * app.js — Wishlist catalog
 * Fully data-driven: filters and labels are derived from the JSON data.
 * Supports local images, priority rating, "bought" state, multiple links
 * in description, and flexible fixed/range/estimated prices.
 */

// ----- STATE ------------------------------------------------------------
let items = [];
let filteredItems = [];
let activeCategory = 'all';
let activeSeller = 'all';
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
const sellerFiltersContainer = document.getElementById('sellerFilters');

// ----- helpers --------------------------------------------------------

function getCategoryFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('category');
}

function updateCategoryInURL(category) {
    const url = new URL(window.location.href);

    if (!category || category === 'all') {
        url.searchParams.delete('category');
    } else {
        url.searchParams.set('category', category);
    }

    window.history.replaceState({}, '', url);
}

function applyCategoryFromURL() {
    const requestedCategory = getCategoryFromURL();

    if (!requestedCategory) {
        activeCategory = 'all';
        return;
    }

    const categories = getUniqueValues('category');

    const matchedCategory = categories.find(
        category => category.toLowerCase() === requestedCategory.toLowerCase()
    );

    activeCategory = matchedCategory || 'all';

    if (matchedCategory) {
        updateCategoryInURL(matchedCategory);
    }
}


// ----- PRICE HELPERS --------------------------------------------------

/**
 * Normalizes the price object.
 *
 * Supported JSON:
 *
 * "price": {
 *     "type": "fixed",
 *     "value": 299
 * }
 *
 * "price": {
 *     "type": "range",
 *     "min": 250,
 *     "max": 350
 * }
 *
 * "price": {
 *     "type": "estimate",
 *     "value": 300
 * }
 *
 * "price": {
 *     "type": "estimate-range",
 *     "min": 250,
 *     "max": 350
 * }
 */
function normalizePrice(price) {
    // Allow a simple number as a fallback for older data.
    if (typeof price === 'number') {
        return {
            type: 'fixed',
            value: price
        };
    }

    if (!price || typeof price !== 'object') {
        return {
            type: 'fixed',
            value: 0
        };
    }

    const type = price.type || 'fixed';

    if (type === 'range' || type === 'estimate-range') {
        return {
            type,
            min: Number(price.min) || 0,
            max: Number(price.max) || 0
        };
    }

    return {
        type,
        value: Number(price.value) || 0
    };
}


/**
 * Returns the numeric value used for sorting.
 *
 * For ranges, the midpoint is used.
 *
 * Example:
 * €250–€350 → €300 for sorting
 */
function getPriceSortValue(price) {
    const normalized = normalizePrice(price);

    if (
        normalized.type === 'range' ||
        normalized.type === 'estimate-range'
    ) {
        return (normalized.min + normalized.max) / 2;
    }

    return normalized.value;
}


/**
 * Formats a price for display.
 */
function formatPrice(price) {
    const normalized = normalizePrice(price);

    const formatEuro = value => {
        return '€ ' + Number(value).toFixed(2);
    };

    switch (normalized.type) {

        case 'range':
            return `${formatEuro(normalized.min)} – ${formatEuro(normalized.max)}`;

        case 'estimate':
            return `≈ ${formatEuro(normalized.value)}`;

        case 'estimate-range':
            return `≈ ${formatEuro(normalized.min)} – ${formatEuro(normalized.max)}`;

        case 'fixed':
        default:
            return formatEuro(normalized.value);
    }
}


// ----- DATE HELPERS ---------------------------------------------------

function parseLocalDate(dateString) {
    if (!dateString) return null;

    const parts = dateString.split('-').map(Number);

    if (parts.length !== 3 || parts.some(Number.isNaN)) {
        return null;
    }

    return new Date(parts[0], parts[1] - 1, parts[2]);
}

function formatBoughtDate(dateString) {
    const boughtDate = parseLocalDate(dateString);

    if (!boughtDate) return 'Bought';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    boughtDate.setHours(0, 0, 0, 0);

    const diffDays = Math.round(
        (today - boughtDate) / 86400000
    );

    if (diffDays === 0) return 'Bought today';
    if (diffDays === 1) return 'Bought yesterday';
    if (diffDays === 2) return 'Bought two days ago';

    const day = String(boughtDate.getDate()).padStart(2, '0');
    const month = String(boughtDate.getMonth() + 1).padStart(2, '0');
    const year = boughtDate.getFullYear();

    return `Bought ${day}/${month}/${year}`;
}


function getPriorityStars(priority) {
    if (!priority) return '';

    const full = Math.min(
        5,
        Math.max(0, Math.round(priority))
    );

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


// ----- Sanitize HTML --------------------------------------------------

function sanitizeHTML(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const body = doc.body;

    const allowedTags = [
        'a',
        'p',
        'br',
        'strong',
        'em',
        'u',
        'ul',
        'ol',
        'li',
        'span',
        'div',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'b',
        'i',
        'sub',
        'sup'
    ];

    const allowedAttrs = {
        'a': ['href', 'target', 'rel', 'title']
    };

    function cleanNode(node) {

        if (node.nodeType === Node.TEXT_NODE) {
            return node.cloneNode();
        }

        if (node.nodeType === Node.ELEMENT_NODE) {

            const tagName = node.tagName.toLowerCase();

            if (!allowedTags.includes(tagName)) {

                const span = document.createElement('span');

                node.childNodes.forEach(child => {
                    const cleaned = cleanNode(child);

                    if (cleaned) {
                        span.appendChild(cleaned);
                    }
                });

                return span;
            }

            const newNode = document.createElement(tagName);

            if (tagName === 'a') {

                const attrs = allowedAttrs['a'];

                attrs.forEach(attr => {

                    if (node.hasAttribute(attr)) {
                        newNode.setAttribute(
                            attr,
                            node.getAttribute(attr)
                        );
                    }

                });

                if (!newNode.hasAttribute('target')) {
                    newNode.setAttribute('target', '_blank');
                }

                if (!newNode.hasAttribute('rel')) {
                    newNode.setAttribute(
                        'rel',
                        'noopener noreferrer'
                    );
                }
            }

            node.childNodes.forEach(child => {

                const cleaned = cleanNode(child);

                if (cleaned) {
                    newNode.appendChild(cleaned);
                }

            });

            return newNode;
        }

        return null;
    }

    const cleanedBody = document.createElement('div');

    body.childNodes.forEach(child => {

        const cleaned = cleanNode(child);

        if (cleaned) {
            cleanedBody.appendChild(cleaned);
        }

    });

    return cleanedBody.innerHTML;
}


// ----- extract unique values from data -------------------------------

function getUniqueValues(key) {

    const values = new Set();

    items.forEach(item => {

        const value = item[key];

        if (Array.isArray(value)) {

            value.forEach(v => {

                if (v) {
                    values.add(v);
                }

            });

        } else if (value) {

            values.add(value);

        }

    });

    return Array.from(values).sort();
}


// ----- build filter buttons -------------------------------------------

function buildFilterButtons(container, filterKey, activeValue) {

    const values = getUniqueValues(filterKey);

    const allActive =
        activeValue === 'all'
            ? 'active'
            : '';

    let html = `
        <button
            class="filter-btn ${allActive}"
            data-filter="${filterKey}"
            data-value="all">
            All
        </button>
    `;

    values.forEach(val => {

        const isActive =
            activeValue === val
                ? 'active'
                : '';

        html += `
            <button
                class="filter-btn ${isActive}"
                data-filter="${filterKey}"
                data-value="${val}">
                ${val}
            </button>
        `;
    });

    container.innerHTML = html;

    container
        .querySelectorAll('.filter-btn')
        .forEach(btn => {

            btn.addEventListener('click', () => {

                const key = btn.dataset.filter;
                const value = btn.dataset.value;

                container
                    .querySelectorAll('.filter-btn')
                    .forEach(b =>
                        b.classList.remove('active')
                    );

                btn.classList.add('active');

                if (key === 'category') {

                    activeCategory = value;
                    updateCategoryInURL(activeCategory);

                } else if (key === 'sellers') {

                    activeSeller = value;

                }

                applyFiltersAndSort();
            });

        });
}


// ----- render grid ----------------------------------------------------

function renderGrid() {

    if (filteredItems.length === 0) {

        grid.innerHTML = `
            <div class="empty-state">
                ✨ No items match your filters
            </div>
        `;

        resultsCount.textContent = 'Showing 0 items';

        return;
    }

    let html = '';

    let hasRenderedAvailableItem = false;
    let boughtSectionStarted = false;

    for (const item of filteredItems) {

        const isBought = item.bought === true;

        if (
            isBought &&
            hasRenderedAvailableItem &&
            !boughtSectionStarted
        ) {

            html += `
                <div
                    class="bought-row-break"
                    aria-hidden="true">
                </div>
            `;

            boughtSectionStarted = true;
        }

        if (!isBought) {
            hasRenderedAvailableItem = true;
        }

        const firstImg =
            item.images &&
            item.images.length > 0
                ? item.images[0]
                : '';

        const emoji =
            getEmojiForItem(item.title);

        const priorityStars =
            getPriorityStars(item.priority);

        const priceDisplay =
            formatPrice(item.price);

        let cardClasses = 'item-card';

        if (isBought) {
            cardClasses += ' bought';
        }

        html += `
            <div
                class="${cardClasses}"
                data-id="${item.id}"
                role="listitem">

                ${
                    isBought
                        ? `
                            <div class="bought-ribbon">
                                <span>
                                    ${formatBoughtDate(item.dateBought)}
                                </span>
                            </div>
                        `
                        : ''
                }

                <div class="card-image">

                    ${
                        firstImg
                            ? `
                                <img
                                    src="${firstImg}"
                                    alt="${item.title}"
                                    loading="lazy"
                                />
                            `
                            : `
                                <span style="font-size:56px;">
                                    ${emoji}
                                </span>
                            `
                    }

                </div>

                <div class="card-body">

                    <div class="card-title">
                        ${item.title}
                    </div>

                    <div class="card-price">
                        ${priceDisplay}
                    </div>

                    <div class="card-labels">

                        <span class="label category">
                            ${item.category}
                        </span>

                        ${
                            (item.sellers || [])
                                .map(
                                    seller =>
                                        `<span class="label seller">${seller}</span>`
                                )
                                .join('')
                        }

                        ${
                            item.priority
                                ? `
                                    <span class="label priority">
                                        ${priorityStars}
                                    </span>
                                `
                                : ''
                        }

                    </div>

                </div>

            </div>
        `;
    }

    grid.innerHTML = html;

    resultsCount.textContent =
        `Showing ${filteredItems.length} items`;

    totalCount.textContent =
        items.length;

    document
        .querySelectorAll('.item-card')
        .forEach(card => {

            card.addEventListener('click', () => {

                const id =
                    parseInt(card.dataset.id);

                openModal(id);
            });

        });
}


// ----- filtering & sorting --------------------------------------------

function applyFiltersAndSort() {

    let result = [...items];

    if (activeCategory !== 'all') {

        result = result.filter(
            item =>
                item.category === activeCategory
        );
    }

    if (activeSeller !== 'all') {

        result = result.filter(
            item =>
                (item.sellers || [])
                    .includes(activeSeller)
        );
    }

    const activeItems =
        result.filter(item => !item.bought);

    const boughtItems =
        result.filter(item => item.bought === true);

    const sortFn =
        getSortFunction(currentSort);

    activeItems.sort(sortFn);
    boughtItems.sort(sortFn);

    filteredItems = [
        ...activeItems,
        ...boughtItems
    ];

    renderGrid();
}


// ----- sorting --------------------------------------------------------

function getSortFunction(sortKey) {

    switch (sortKey) {

        case 'price-asc':

            return (a, b) =>
                getPriceSortValue(a.price) -
                getPriceSortValue(b.price);


        case 'price-desc':

            return (a, b) =>
                getPriceSortValue(b.price) -
                getPriceSortValue(a.price);


        case 'date-asc':

            return (a, b) =>
                new Date(a.dateAdded) -
                new Date(b.dateAdded);


        case 'priority-desc':

            return (a, b) =>
                (b.priority || 0) -
                (a.priority || 0);


        case 'date-desc':
        default:

            return (a, b) =>
                new Date(b.dateAdded) -
                new Date(a.dateAdded);
    }
}


// ----- modal ----------------------------------------------------------

function openModal(id) {

    const item =
        items.find(i => i.id === id);

    if (!item) return;

    currentItemId = id;

    const images =
        item.images || [];

    const priorityStars =
        getPriorityStars(item.priority);

    const isBought =
        item.bought === true;

    // Format price
    const priceDisplay =
        formatPrice(item.price);

    // Build gallery thumbnails
    let thumbsHtml = '';

    if (images.length > 0) {

        images.forEach((img, i) => {

            const activeClass =
                i === 0
                    ? 'active'
                    : '';

            thumbsHtml += `
                <div
                    class="thumb ${activeClass}"
                    data-index="${i}">

                    <img
                        src="${img}"
                        alt="${item.title} — image ${i + 1}"
                    />

                </div>
            `;
        });

    } else {

        thumbsHtml = `
            <span
                style="
                    font-size:14px;
                    color:#94a3b8;
                ">
                No additional images
            </span>
        `;
    }

    const boughtLabel =
        isBought
            ? `
                <span class="label bought-status">
                    ${formatBoughtDate(item.dateBought)}
                </span>
            `
            : '';

    const safeDescription =
        item.description
            ? sanitizeHTML(item.description)
            : 'No description available.';

    modalContent.innerHTML = `

        <div class="modal-gallery">

            <div
                class="main-image"
                id="modalMainImage">

                <img
                    src="${images.length > 0 ? images[0] : ''}"
                    alt="${item.title}"
                />

            </div>

            <div
                class="thumbnails"
                id="modalThumbnails">

                ${thumbsHtml}

            </div>

        </div>


        <div class="modal-title">
            ${item.title}
        </div>


        <div class="modal-price">
            ${priceDisplay}
        </div>


        <div class="modal-meta">

            <span class="label category">
                ${item.category}
            </span>

            ${
                (item.sellers || [])
                    .map(
                        seller =>
                            `<span class="label seller">${seller}</span>`
                    )
                    .join('')
            }

            ${
                item.priority
                    ? `
                        <span class="label priority">
                            ${priorityStars}
                        </span>
                    `
                    : ''
            }

            ${boughtLabel}

        </div>


        <div class="modal-description">
            ${safeDescription}
        </div>


        <div class="modal-link">

            <a
                href="${item.link || '#'}"
                target="_blank"
                rel="noopener noreferrer">

                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round">

                    <path
                        d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
                    />

                    <polyline
                        points="15 3 21 3 21 9"
                    />

                    <line
                        x1="10"
                        y1="14"
                        x2="21"
                        y2="3"
                    />

                </svg>

                View product page

            </a>

        </div>
    `;


    // Thumbnail click handling
    const thumbs =
        modalContent.querySelectorAll('.thumb');

    const mainImg =
        modalContent.querySelector(
            '#modalMainImage img'
        );

    thumbs.forEach(thumb => {

        thumb.addEventListener(
            'click',
            () => {

                thumbs.forEach(t =>
                    t.classList.remove('active')
                );

                thumb.classList.add('active');

                const imgSrc =
                    thumb.querySelector('img').src;

                mainImg.src = imgSrc;
            }
        );

    });


    modalOverlay.classList.add('open');

    document.body.style.overflow =
        'hidden';
}


function closeModal() {

    modalOverlay.classList.remove('open');

    document.body.style.overflow =
        '';

    currentItemId = null;
}


// ----- load data from JSON --------------------------------------------

async function loadData() {

    try {

        const response =
            await fetch('data.json');

        if (!response.ok) {
            throw new Error(
                'Failed to load data.json'
            );
        }

        items =
            await response.json();


        // Normalize each item
        items.forEach((item, index) => {

            if (!item.id) {
                item.id = index + 1;
            }

            if (!item.images) {
                item.images = [];
            }

            if (!item.dateAdded) {
                item.dateAdded =
                    new Date()
                        .toISOString()
                        .split('T')[0];
            }

            if (item.bought === undefined) {
                item.bought = false;
            }

            if (!item.bought) {
                item.dateBought = null;
            }


            // Sellers
            if (!item.sellers) {
                item.sellers = [];
            }

            if (!Array.isArray(item.sellers)) {
                item.sellers = [item.sellers];
            }


            // Normalize price
            item.price =
                normalizePrice(item.price);


            // Images
            item.images =
                item.images.map(img =>
                    img.startsWith('http') ||
                    img.startsWith('data:')
                        ? img
                        : `images/${img}`
                );

        });


        // Apply category from URL
        applyCategoryFromURL();


        // Build filters
        buildFilterButtons(
            categoryFiltersContainer,
            'category',
            activeCategory
        );

        buildFilterButtons(
            sellerFiltersContainer,
            'sellers',
            activeSeller
        );


        // Initial render
        applyFiltersAndSort();

    } catch (error) {

        console.error(
            'Error loading data:',
            error
        );

        grid.innerHTML = `
            <div class="empty-state">
                ⚠️ Could not load items.
                Please check that data.json exists
                and images are in the "images" folder.
            </div>
        `;
    }
}


// ----- event listeners ------------------------------------------------

// Sort select
sortSelect.addEventListener(
    'change',
    () => {

        currentSort =
            sortSelect.value;

        applyFiltersAndSort();
    }
);


// Clear filters
clearFiltersBtn.addEventListener(
    'click',
    () => {

        // Reset category
        categoryFiltersContainer
            .querySelectorAll('.filter-btn')
            .forEach(b =>
                b.classList.remove('active')
            );

        const allCat =
            categoryFiltersContainer
                .querySelector(
                    '.filter-btn[data-value="all"]'
                );

        if (allCat) {
            allCat.classList.add('active');
        }

        activeCategory = 'all';

        updateCategoryInURL(
            activeCategory
        );


        // Reset seller
        sellerFiltersContainer
            .querySelectorAll('.filter-btn')
            .forEach(b =>
                b.classList.remove('active')
            );

        const allSeller =
            sellerFiltersContainer
                .querySelector(
                    '.filter-btn[data-value="all"]'
                );

        if (allSeller) {
            allSeller.classList.add('active');
        }

        activeSeller = 'all';


        // Reset sort
        sortSelect.value =
            'date-desc';

        currentSort =
            'date-desc';


        applyFiltersAndSort();
    }
);


// Modal close
modalClose.addEventListener(
    'click',
    closeModal
);


modalOverlay.addEventListener(
    'click',
    e => {

        if (e.target === modalOverlay) {
            closeModal();
        }

    }
);


document.addEventListener(
    'keydown',
    e => {

        if (e.key === 'Escape') {
            closeModal();
        }

    }
);


// ----- init -----------------------------------------------------------

document.addEventListener(
    'DOMContentLoaded',
    loadData
);
