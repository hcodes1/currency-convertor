const converterForm = document.getElementById("converter-form");
const fromCurrency = document.getElementById("from-currency");
const toCurrency = document.getElementById("to-currency");
const amountInput = document.getElementById("amount");
const resultDiv = document.getElementById("result");
const loadingSpinner = document.getElementById("loading");
const errorMessage = document.getElementById("error-message");
const cacheStatus = document.getElementById("cache-status");
const cacheMessage = document.getElementById("cache-message");

// Register Service Worker for offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(registration => {
        console.log('Service Worker registered successfully:', registration);
      })
      .catch(error => {
        console.error('Service Worker registration failed:', error);
      });
  });
}

// Cache configuration
const CACHE_KEY = 'exchangeRateCache';
const CACHE_DURATION = 1000 * 60 * 30; // 30 minutes
const HISTORY_KEY = 'conversionHistory';
const MAX_HISTORY_ITEMS = 5;

// Currency formatting configuration
const CURRENCY_FORMATS = {
    USD: { locale: 'en-US', currency: 'USD', decimals: 2 },
    EUR: { locale: 'de-DE', currency: 'EUR', decimals: 2 },
    JPY: { locale: 'ja-JP', currency: 'JPY', decimals: 0 },
    GBP: { locale: 'en-GB', currency: 'GBP', decimals: 2 },
    CNY: { locale: 'zh-CN', currency: 'CNY', decimals: 2 },
    // Default format for other currencies
    DEFAULT: { locale: 'en-US', decimals: 2 }
};

// Network status tracking
let isOnline = navigator.onLine;

// Helper function for currency formatting
function formatCurrency(amount, currencyCode) {
    const format = CURRENCY_FORMATS[currencyCode] || CURRENCY_FORMATS.DEFAULT;
    
    try {
        // Try to use Intl formatter first
        return new Intl.NumberFormat(format.locale, {
            style: 'currency',
            currency: currencyCode,
            minimumFractionDigits: format.decimals,
            maximumFractionDigits: format.decimals
        }).format(amount);
    } catch (error) {
        // Fallback formatting
        const formatted = amount.toFixed(format.decimals);
        return `${currencyCode} ${formatted}`;
    }
}

// History management functions
function addToHistory(amount, fromCurrency, toCurrency, result) {
    let history = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    
    const newEntry = {
        id: Date.now(),
        amount,
        fromCurrency,
        toCurrency,
        result,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    
    // Add to beginning of array
    history.unshift(newEntry);
    
    // Keep only the most recent items
    history = history.slice(0, MAX_HISTORY_ITEMS);
    
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    console.log('Added to history. Total items:', history.length); // Debug
    displayHistory();
}

function getHistory() {
    const history = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    console.log('Retrieved history:', history); // Debug
    return history;
}

function clearHistory() {
    localStorage.removeItem(HISTORY_KEY);
    console.log('History cleared'); // Debug
    displayHistory();
}

function displayHistory() {
    const historySection = document.getElementById('history-section');
    const historyList = document.getElementById('history-list');
    const history = getHistory();
    
    console.log('Displaying history with', history.length, 'items'); // Debug
    
    if (history.length === 0) {
        historySection.classList.add('hidden');
        console.log('History section hidden'); // Debug
        return;
    }
    
    historySection.classList.remove('hidden');
    historyList.innerHTML = history.map(item => `
        <div class="history-item" onclick="repeatConversion(${item.amount}, '${item.fromCurrency}', '${item.toCurrency}')">
            <span class="history-item-text">${item.amount} ${item.fromCurrency} → ${item.toCurrency}</span>
            <span class="history-item-time">${item.timestamp}</span>
        </div>
    `).join('');
    console.log('History list updated with', history.length, 'items'); // Debug
}

function repeatConversion(amount, fromCurr, toCurr) {
    amountInput.value = amount;
    
    // Set the currency values
    let fromSelect = document.getElementById('from-currency');
    let toSelect = document.getElementById('to-currency');
    fromSelect.value = fromCurr;
    toSelect.value = toCurr;
    
    console.log('Repeated conversion:', amount, fromCurr, toCurr); // Debug
}

// Theme management
const themeSwitch = document.getElementById('theme-switch');
const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');

// Load saved theme or use system preference
const savedTheme = localStorage.getItem('theme');
if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
} else {
    const systemTheme = prefersDarkScheme.matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', systemTheme);
}

// Theme toggle handler
themeSwitch.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
});

// Watch for system theme changes
prefersDarkScheme.addEventListener('change', (e) => {
    if (!localStorage.getItem('theme')) {
        const systemTheme = e.matches ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', systemTheme);
    }
});

// Initialize UI
loadingSpinner.classList.add('hidden');
errorMessage.classList.add('hidden');

// Display any existing history
displayHistory();

// Real-time input validation
amountInput.addEventListener('input', function(e) {
    const value = e.target.value;
    if (value === '') {
        clearError();
        return;
    }
    
    if (/[^0-9.]/.test(value)) {
        showError("Please enter numbers only");
        e.target.value = value.replace(/[^0-9.]/g, '');
    } else if ((value.match(/\./g) || []).length > 1) {
        showError("Please enter a valid number");
        e.target.value = value.substring(0, value.lastIndexOf('.'));
    } else {
        clearError();
    }
});

window.addEventListener("load", fetchCurrencies);
converterForm.addEventListener("submit", convertCurrency);

// Clear history button
document.getElementById('clear-history').addEventListener('click', clearHistory);

// Network status handling
window.addEventListener('online', function() {
    isOnline = true;
    const offlineIndicator = document.getElementById('offline-indicator');
    offlineIndicator.classList.add('hidden');
    updateCacheStatus('Online mode');
    cacheStatus.classList.remove('offline');
});

window.addEventListener('offline', function() {
    isOnline = false;
    const offlineIndicator = document.getElementById('offline-indicator');
    offlineIndicator.classList.remove('hidden');
    updateCacheStatus('Offline mode - Using cached rates');
    cacheStatus.classList.add('offline');
});

// Helper functions for UI state
function showLoading() {
    console.log('Showing loading spinner...'); // Debug log
    loadingSpinner.style.display = 'flex';
    loadingSpinner.style.opacity = '1';
    loadingSpinner.style.visibility = 'visible';
    loadingSpinner.classList.remove('hidden');
    clearError();
    resultDiv.textContent = '';
    console.log('Loading spinner element:', loadingSpinner); // Debug element
    console.log('Loading spinner classes:', loadingSpinner.className); // Debug classes
}

function updateCacheStatus(message, isCached = false) {
    cacheStatus.classList.remove('hidden');
    cacheMessage.textContent = message;
    if (isCached) {
        cacheStatus.classList.add('cached');
    } else {
        cacheStatus.classList.remove('cached');
    }
}

function hideLoading() {
    console.log('Hiding loading spinner...'); // Debug log
    loadingSpinner.classList.add('hidden');
    console.log('Loading spinner classes after hide:', loadingSpinner.className); // Debug classes
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
    resultDiv.textContent = '';
    amountInput.classList.add('error');
    console.log('Error shown:', message); // Debug log
}

function clearError() {
    errorMessage.classList.add('hidden');
    amountInput.classList.remove('error');
}

// Cache management functions
function getCachedData(key) {
    const cached = localStorage.getItem(key);
    if (!cached) return null;

    const { timestamp, data } = JSON.parse(cached);
    const age = Date.now() - timestamp;
    
    if (age > CACHE_DURATION) {
        localStorage.removeItem(key);
        return null;
    }

    // Calculate time ago for display
    const minutesAgo = Math.floor(age / 60000);
    if (minutesAgo < 1) {
        updateCacheStatus('Using live rates', false);
    } else if (minutesAgo === 1) {
        updateCacheStatus('Rates updated 1 minute ago', true);
    } else {
        updateCacheStatus(`Rates updated ${minutesAgo} minutes ago`, true);
    }

    return data;
}

// Return full cached entry (timestamp + data)
function getCachedEntry(key) {
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    return JSON.parse(cached); // { timestamp, data }
}

function setCacheData(key, data) {
    const cacheData = {
        timestamp: Date.now(),
        data: data
    };
    localStorage.setItem(key, JSON.stringify(cacheData));
}

// Helper function to create a delay
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchCurrencies() {
    try {
        console.log('Starting fetchCurrencies'); // Debug log
        showLoading();
        
        // Add shorter delay to keep UI responsive while still showing loading state
        await delay(800);  // 0.8 second delay
        
        // Check cache first
        const cachedCurrencies = getCachedData('currencies');
        if (cachedCurrencies) {
            console.log('Using cached currencies'); // Debug log
            populateCurrencyDropdowns(cachedCurrencies);
            hideLoading();
            return;
        }

        const response = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
        if (!response.ok) {
            throw new Error('Failed to fetch currencies');
        }

        const data = await response.json();
        const currencyOptions = Object.keys(data.rates);
        
        // Cache the currencies
        setCacheData('currencies', currencyOptions);
        
        populateCurrencyDropdowns(currencyOptions);
    } catch (error) {
        showError('Failed to load currencies. Please try again later.');
        console.error('Currency fetch error:', error);
    } finally {
        hideLoading();
    }
}

function populateCurrencyDropdowns(currencies) {
    // Clear existing options
    fromCurrency.innerHTML = '';
    toCurrency.innerHTML = '';

    currencies.forEach((currency) => {
        const option1 = document.createElement("option");
        option1.value = currency;
        option1.textContent = currency;
        fromCurrency.appendChild(option1);

        const option2 = document.createElement("option");
        option2.value = currency;
        option2.textContent = currency;
        toCurrency.appendChild(option2);
    });
}

async function convertCurrency(e) {
    e.preventDefault();

    try {
        // Input validation
        const inputValue = amountInput.value.trim();
        const hasSpecialChars = /[^0-9.]/.test(inputValue);
        const amount = parseFloat(inputValue);
        const fromCurrencyValue = fromCurrency.value;
        const toCurrencyValue = toCurrency.value;

        // Comprehensive input validation
        if (inputValue === '') {
            showError("Please enter an amount to convert");
            return;
        }
        if (hasSpecialChars) {
            showError("Special characters or letters are not allowed");
            return;
        }
        if (isNaN(amount)) {
            showError("Please enter a valid number");
            return;
        }
        if (amount < 0) {
            showError("Amount cannot be negative");
            return;
        }
        if (amount === 0) {
            showError("Amount must be greater than zero");
            return;
        }
        if (amount > 999999999) {
            showError("Amount is too large. Please enter a smaller number");
            return;
        }
        if (fromCurrencyValue === toCurrencyValue) {
            showError("Please select different currencies to convert");
            return;
        }

        showLoading();
        console.log('Converting currency...');
        
        // Add shorter delay to keep UI responsive
        await delay(800);  // 0.8 second delay

        // First check if we're offline
        if (!isOnline) {
            console.log('Operating in offline mode');
        }

        // Check cache for exchange rates
        const cacheKey = `rates_${fromCurrencyValue}`;
        const cachedEntry = getCachedEntry(cacheKey); // { timestamp, data }
        const cachedRates = cachedEntry ? cachedEntry.data : null;
        
        let rate;
        let fetchedAt = new Date().toLocaleString();
        let source = 'live';

        if (cachedRates && cachedRates[toCurrencyValue]) {
            console.log('Using cached rates');
            rate = cachedRates[toCurrencyValue];
            source = 'cache';
            if (cachedEntry && cachedEntry.timestamp) {
                fetchedAt = new Date(cachedEntry.timestamp).toLocaleString();
            }
            if (!isOnline) {
                updateCacheStatus('Offline - Using cached rates', true);
            }
        } else if (!isOnline) {
            // Try to find conversion in history when offline
            let foundInHistory = false;
            const history = getHistory();
            
            for (let item of history) {
                if (item.fromCurrency === fromCurrencyValue && item.toCurrency === toCurrencyValue) {
                    rate = item.result / item.amount;
                    fetchedAt = item.timestamp || fetchedAt;
                    source = 'history';
                    foundInHistory = true;
                    console.log('Using conversion rate from history');
                    updateCacheStatus('Offline - Using rate from history', true);
                    break;
                }
            }
            
            if (!foundInHistory) {
                showError('No cached rates available. Make a conversion while online first, or reconnect to the internet.');
                return;
            }
        } else {
            try {
                // Fetch fresh rates if not in cache and we're online
                const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${fromCurrencyValue}`);
                if (!response.ok) {
                    throw new Error('Failed to fetch exchange rates');
                }

                const data = await response.json();
                rate = data.rates[toCurrencyValue];

                // Cache the new rates
                setCacheData(cacheKey, data.rates);
                updateCacheStatus('Rates updated just now', false);
                fetchedAt = new Date().toLocaleString();
                source = 'api';
            } catch (error) {
                if (!isOnline) {
                    showError('Lost internet connection. Using cached rates if available.');
                    return;
                }
                throw error;
            }
        }

        // Build and show result with details toggle
        const converted = amount * rate;
        const formattedOriginal = formatCurrency(amount, fromCurrencyValue);
        const formattedConverted = formatCurrency(converted, toCurrencyValue);
        const rawRateStr = Number(rate).toFixed(6);

        resultDiv.innerHTML = `
            <div class="conversion-result">
                <div class="amount-display highlight">${formattedConverted}</div>
                <button class="details-toggle" aria-expanded="false">Details</button>
                <div class="rate-details hidden">
                    <div>Original: <strong>${formattedOriginal}</strong></div>
                    <div>Raw rate: <strong>${rawRateStr}</strong></div>
                    <div>Source: <strong>${source}</strong></div>
                    <div>Fetched: <strong>${fetchedAt}</strong></div>
                </div>
            </div>
        `;

        // Attach toggle handler
        const detailsBtn = resultDiv.querySelector('.details-toggle');
        const detailsDiv = resultDiv.querySelector('.rate-details');
        if (detailsBtn && detailsDiv) {
            // Ensure ARIA and initial state
            detailsBtn.setAttribute('aria-expanded', 'false');
            detailsDiv.setAttribute('aria-hidden', 'true');

            const toggleFn = () => {
                const expanded = detailsBtn.getAttribute('aria-expanded') === 'true';
                detailsBtn.setAttribute('aria-expanded', String(!expanded));
                detailsDiv.classList.toggle('hidden');
                detailsDiv.setAttribute('aria-hidden', String(expanded));
                detailsBtn.textContent = expanded ? 'Details' : 'Hide details';
            };

            detailsBtn.addEventListener('click', toggleFn);

            // UX: auto-open the details on first successful conversion so users discover it
            try {
                const seen = localStorage.getItem('detailsSeen');
                if (!seen) {
                    // briefly add a visual hint class then open
                    detailsBtn.classList.add('hint');
                    // open after a short delay so the user can see the result first
                    setTimeout(() => {
                        // open details
                        if (detailsDiv.classList.contains('hidden')) {
                            toggleFn();
                        }
                        // remove the hint class shortly after
                        setTimeout(() => detailsBtn.classList.remove('hint'), 1200);
                        localStorage.setItem('detailsSeen', '1');
                    }, 450);
                }
            } catch (err) {
                // ignore storage errors
                console.warn('Could not access localStorage for detailsSeen', err);
            }
        }

        // Save the conversion to history (helpful for offline fallback)
        addToHistory(amount, fromCurrencyValue, toCurrencyValue, converted);
        
    } catch (error) {
        console.error('Conversion error:', error);
        if (!isOnline) {
            showError('You are offline. Please check your internet connection or use cached rates.');
        } else {
            showError('Failed to convert currency. Please try again later.');
        }
    } finally {
        hideLoading();
    }
}