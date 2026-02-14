// Default settings
const DEFAULT_SETTINGS = {
  enabled: true,
  inactiveTimeout: 30, // seconds (for testing)
  checkInterval: 5, // seconds
  excludePinned: false,
  excludeAudible: true,
  minTabs: 1 // minimum tabs to keep active
};

// Track tab activity
const tabLastActive = new Map();
let settings = { ...DEFAULT_SETTINGS };
let checkIntervalId = null;

// Initialize extension
async function init() {
  console.log('[Zen Tabs] Starting initialization...');

  await loadSettings();
  console.log('[Zen Tabs] Settings loaded:', settings);

  await initializeTabTracking();
  console.log('[Zen Tabs] Tab tracking initialized, tracking', tabLastActive.size, 'tabs');

  setupListeners();
  console.log('[Zen Tabs] Listeners setup complete');

  startCheckInterval();
  console.log('[Zen Tabs] Check interval started');

  console.log('[Zen Tabs] ✓ Extension ready!');
  console.log(`[Zen Tabs] Will suspend tabs after ${settings.inactiveTimeout} seconds of inactivity`);
}

// Load settings from storage
async function loadSettings() {
  try {
    const stored = await browser.storage.local.get('settings');
    if (stored.settings) {
      settings = { ...DEFAULT_SETTINGS, ...stored.settings };
    }
  } catch (e) {
    console.error('[Zen Tabs] Failed to load settings:', e);
  }
}

// Save settings to storage
async function saveSettings(newSettings) {
  settings = { ...settings, ...newSettings };
  await browser.storage.local.set({ settings });

  // Restart interval with new settings
  startCheckInterval();
}

// Initialize tracking for existing tabs
async function initializeTabTracking() {
  const tabs = await browser.tabs.query({});
  const now = Date.now();

  for (const tab of tabs) {
    if (tab.active) {
      tabLastActive.set(tab.id, now);
    } else {
      // Inactive tabs start with current time (fresh start)
      tabLastActive.set(tab.id, now);
    }
    console.log(`[Zen Tabs] Tracking tab ${tab.id}: "${tab.title?.substring(0, 30)}..." active=${tab.active}`);
  }
}

// Start the check interval using setInterval (more reliable than alarms for short intervals)
function startCheckInterval() {
  // Clear existing interval
  if (checkIntervalId) {
    clearInterval(checkIntervalId);
  }

  // Run check every N seconds
  checkIntervalId = setInterval(() => {
    checkAndDiscardInactiveTabs();
  }, settings.checkInterval * 1000);

  console.log(`[Zen Tabs] Check interval set to ${settings.checkInterval} seconds`);
}

// Setup event listeners
function setupListeners() {
  // Track tab activation
  browser.tabs.onActivated.addListener(handleTabActivated);

  // Track tab creation
  browser.tabs.onCreated.addListener(handleTabCreated);

  // Track tab updates (URL changes, audio state)
  browser.tabs.onUpdated.addListener(handleTabUpdated);

  // Clean up when tabs are removed
  browser.tabs.onRemoved.addListener(handleTabRemoved);

  // Listen for settings changes
  browser.storage.onChanged.addListener(handleStorageChanged);

  // Listen for messages from popup
  browser.runtime.onMessage.addListener(handleMessage);
}

// Handle new tab created
function handleTabCreated(tab) {
  tabLastActive.set(tab.id, Date.now());
  console.log(`[Zen Tabs] New tab created: ${tab.id}`);
}

// Handle tab activation
async function handleTabActivated(activeInfo) {
  const now = Date.now();
  tabLastActive.set(activeInfo.tabId, now);
  console.log(`[Zen Tabs] Tab ${activeInfo.tabId} activated`);
}

// Handle tab updates
function handleTabUpdated(tabId, changeInfo, tab) {
  // Reset timer if tab starts playing audio
  if (changeInfo.audible === true) {
    tabLastActive.set(tabId, Date.now());
    console.log(`[Zen Tabs] Tab ${tabId} playing audio, timer reset`);
  }

  // Reset timer on navigation
  if (changeInfo.url) {
    tabLastActive.set(tabId, Date.now());
    console.log(`[Zen Tabs] Tab ${tabId} navigated, timer reset`);
  }
}

// Handle tab removal
function handleTabRemoved(tabId) {
  tabLastActive.delete(tabId);
  console.log(`[Zen Tabs] Tab ${tabId} removed from tracking`);
}

// Handle storage changes
function handleStorageChanged(changes, area) {
  if (area === 'local' && changes.settings) {
    settings = { ...DEFAULT_SETTINGS, ...changes.settings.newValue };
    startCheckInterval();
    console.log('[Zen Tabs] Settings updated:', settings);
  }
}

// Handle messages from popup
async function handleMessage(message, sender, sendResponse) {
  console.log('[Zen Tabs] Message received:', message.type);

  switch (message.type) {
    case 'getSettings':
      return settings;

    case 'saveSettings':
      await saveSettings(message.settings);
      return { success: true };

    case 'getStats':
      return await getStats();

    case 'discardNow':
      const discarded = await forceDiscardInactiveTabs();
      return { discarded };

    }
}

// Check if tab should be excluded from discarding
function shouldExclude(tab) {
  // Never discard active tab
  if (tab.active) return true;

  // Already discarded
  if (tab.discarded) return true;

  // Pinned tabs (if setting enabled)
  if (settings.excludePinned && tab.pinned) return true;

  // Audible tabs (if setting enabled)
  if (settings.excludeAudible && tab.audible) return true;

  // System pages
  if (tab.url?.startsWith('about:') ||
      tab.url?.startsWith('moz-extension:') ||
      tab.url?.startsWith('chrome:')) {
    return true;
  }

  return false;
}

// Main function to check and discard inactive tabs
async function checkAndDiscardInactiveTabs() {
  if (!settings.enabled) {
    return 0;
  }

  const tabs = await browser.tabs.query({});
  const now = Date.now();
  const timeoutMs = settings.inactiveTimeout * 1000;
  let discardedCount = 0;

  // Count stats
  const activeTabs = tabs.filter(t => !t.discarded);
  const alreadyDiscarded = tabs.filter(t => t.discarded).length;
  const activeTabCount = tabs.filter(t => t.active).length;

  console.log(`[Zen Tabs] Checking ${tabs.length} tabs (${alreadyDiscarded} already discarded, ${activeTabCount} active/focused)`);

  for (const tab of tabs) {
    // Skip active tab (current tab)
    if (tab.active) continue;

    // Skip already discarded
    if (tab.discarded) continue;

    // Skip pinned (if setting enabled)
    if (settings.excludePinned && tab.pinned) {
      console.log(`[Zen Tabs] Skip pinned: "${tab.title?.substring(0, 25)}"`);
      continue;
    }

    // Skip audible (playing audio)
    if (settings.excludeAudible && tab.audible) {
      console.log(`[Zen Tabs] Skip audible: "${tab.title?.substring(0, 25)}"`);
      continue;
    }

    // Skip system pages (can't discard these)
    if (tab.url?.startsWith('about:') || tab.url?.startsWith('moz-extension:') || tab.url?.startsWith('chrome:')) {
      continue;
    }

    let lastActive = tabLastActive.get(tab.id);

    // If not tracked, start tracking with old timestamp (so it can be discarded)
    if (!lastActive) {
      lastActive = now - (timeoutMs + 1000); // Already past timeout
      tabLastActive.set(tab.id, lastActive);
      console.log(`[Zen Tabs] Started tracking (as old): "${tab.title?.substring(0, 25)}"`);
    }

    const inactiveFor = now - lastActive;
    const inactiveSeconds = Math.round(inactiveFor / 1000);

    console.log(`[Zen Tabs] "${tab.title?.substring(0, 25)}" inactive ${inactiveSeconds}s / ${settings.inactiveTimeout}s`);

    if (inactiveFor > timeoutMs) {
      // Keep minimum number of active tabs
      if (activeTabs.length - discardedCount <= settings.minTabs) {
        console.log(`[Zen Tabs] Keeping minimum ${settings.minTabs} active tab(s)`);
        break;
      }

      try {
        // Discard the tab (unload from memory)
        await browser.tabs.discard(tab.id);
        discardedCount++;
        console.log(`[Zen Tabs] ✓ DISCARDED: "${tab.title}"`);
      } catch (error) {
        console.error(`[Zen Tabs] ✗ Failed to discard tab ${tab.id}:`, error.message);
      }
    }
  }

  return discardedCount;
}

// Force discard (from popup button) - ignores timeout, discards all eligible
async function forceDiscardInactiveTabs() {
  const tabs = await browser.tabs.query({});
  let discardedCount = 0;

  console.log(`[Zen Tabs] Force discarding inactive tabs...`);

  for (const tab of tabs) {
    if (shouldExclude(tab)) {
      continue;
    }

    try {
      await browser.tabs.discard(tab.id);
      discardedCount++;
      console.log(`[Zen Tabs] ✓ Force discarded: "${tab.title}"`);
    } catch (error) {
      console.error(`[Zen Tabs] ✗ Failed to discard:`, error);
    }
  }

  return discardedCount;
}

// Get statistics for popup
async function getStats() {
  const tabs = await browser.tabs.query({});
  const discarded = tabs.filter(t => t.discarded).length;
  const active = tabs.length - discarded;

  return {
    total: tabs.length,
    active,
    discarded,
    enabled: settings.enabled
  };
}

// Start the extension
init();
