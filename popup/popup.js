// DOM elements
const elements = {
  totalTabs: document.getElementById('totalTabs'),
  activeTabs: document.getElementById('activeTabs'),
  discardedTabs: document.getElementById('discardedTabs'),
  enabled: document.getElementById('enabled'),
  timeout: document.getElementById('timeout'),
  excludePinned: document.getElementById('excludePinned'),
  excludeAudible: document.getElementById('excludeAudible'),
  discardBtn: document.getElementById('discardBtn'),
  status: document.getElementById('status')
};

// Initialize popup
async function init() {
  await loadStats();
  await loadSettings();
  setupListeners();
}

// Load statistics
async function loadStats() {
  const stats = await browser.runtime.sendMessage({ type: 'getStats' });
  elements.totalTabs.textContent = stats.total;
  elements.activeTabs.textContent = stats.active;
  elements.discardedTabs.textContent = stats.discarded;
}

// Load settings
async function loadSettings() {
  const settings = await browser.runtime.sendMessage({ type: 'getSettings' });
  elements.enabled.checked = settings.enabled;
  elements.timeout.value = settings.inactiveTimeout;
  elements.excludePinned.checked = settings.excludePinned;
  elements.excludeAudible.checked = settings.excludeAudible;
}

// Save settings
async function saveSettings() {
  const settings = {
    enabled: elements.enabled.checked,
    inactiveTimeout: parseInt(elements.timeout.value, 10) || 30,
    excludePinned: elements.excludePinned.checked,
    excludeAudible: elements.excludeAudible.checked
  };

  await browser.runtime.sendMessage({ type: 'saveSettings', settings });
}

// Show status message
function showStatus(message, type = 'success') {
  elements.status.textContent = message;
  elements.status.className = `status ${type}`;

  setTimeout(() => {
    elements.status.className = 'status';
  }, 3000);
}

// Setup event listeners
function setupListeners() {
  // Auto-save on change
  elements.enabled.addEventListener('change', saveSettings);
  elements.timeout.addEventListener('change', saveSettings);
  elements.excludePinned.addEventListener('change', saveSettings);
  elements.excludeAudible.addEventListener('change', saveSettings);

  // Discard now button
  elements.discardBtn.addEventListener('click', async () => {
    const result = await browser.runtime.sendMessage({ type: 'discardNow' });
    showStatus(`Suspended ${result.discarded} tab(s)`);
    await loadStats();
  });
}

// Start
init();
