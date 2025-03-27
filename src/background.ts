// Track tabs known to be playing audio
const audibleTabs = new Set<number>(); // Set of tab IDs currently playing audio

// Track message queues for tabs that aren't ready yet
const messageQueues: Map<number, Array<any>> = new Map(); // Queue of pending messages by tab ID
const MAX_RETRIES = 3; // Maximum number of retry attempts for message sending
const MAX_QUEUE_SIZE = 50; // Maximum pending messages per tab to prevent memory issues

/**
 * Interface TabVolumeData defines the volume settings for a tab
 * Contains all volume-related properties that need to be tracked and persisted
 */
interface TabVolumeData {
  volume: number; // Current volume level (0-100)
  previousVolume: number; // Volume before muting (to restore when unmuted)
  muted: boolean; // Whether the tab is currently muted
  hasAudio: boolean; // Whether the tab has audio capability
  isPlaying?: boolean; // Whether audio is currently playing (optional)
  tabUrl?: string; // URL of the tab for persisting settings across sessions
}

// Store volume settings by tab ID for active tabs
const tabVolumeSettings: Map<number, TabVolumeData> = new Map();
// Store URL to volume mapping for persistence across tab reloads
const urlVolumeSettings: Map<string, TabVolumeData> = new Map();

// Load saved volume settings from storage when extension starts
chrome.storage.local.get(null, (items) => {
  if (chrome.runtime.lastError) {
    console.error("Error loading storage:", chrome.runtime.lastError);
    return;
  }

  try {
    // Process tab-specific volume settings
    Object.keys(items).forEach((key) => {
      if (key.startsWith("tab-volume-")) {
        const tabId = parseInt(key.replace("tab-volume-", ""));
        if (!isNaN(tabId) && tabId > 0) {
          tabVolumeSettings.set(tabId, validateVolumeData(items[key]));
        }
      }

      // Process URL-specific volume settings (persists across sessions)
      if (key.startsWith("url-volume-")) {
        const url = key.replace("url-volume-", "");
        if (url) {
          urlVolumeSettings.set(url, validateVolumeData(items[key]));
        }
      }
    });
  } catch (e) {
    console.error("Error processing stored settings:", e);
  }
});

/**
 * Function validateVolumeData() ensures volume data has all required properties with valid values
 * @param data - Raw data object to validate
 * @returns TabVolumeData - Cleaned data with defaults for missing/invalid properties
 */
function validateVolumeData(data: any): TabVolumeData {
  const defaultData = getDefaultVolumeData();

  if (!data || typeof data !== "object") {
    return defaultData;
  }

  return {
    volume: isValidVolume(data.volume) ? data.volume : defaultData.volume,
    previousVolume: isValidVolume(data.previousVolume)
      ? data.previousVolume
      : defaultData.previousVolume,
    muted: typeof data.muted === "boolean" ? data.muted : defaultData.muted,
    hasAudio:
      typeof data.hasAudio === "boolean" ? data.hasAudio : defaultData.hasAudio,
    isPlaying: typeof data.isPlaying === "boolean" ? data.isPlaying : undefined,
    tabUrl: typeof data.tabUrl === "string" ? data.tabUrl : undefined,
  };
} // End of function validateVolumeData()

/**
 * Function isValidVolume() checks if a volume value is within acceptable range
 * @param volume - Value to check
 * @returns boolean - True if volume is a number between 0-100
 */
function isValidVolume(volume: any): boolean {
  return (
    typeof volume === "number" && !isNaN(volume) && volume >= 0 && volume <= 100
  );
} // End of function isValidVolume()

/**
 * Function saveTabVolume() persists volume settings for a tab to local storage
 * This enables settings to be remembered between browser sessions
 * @param tabId - Chrome tab identifier
 * @param volumeData - Volume settings to save
 * @param tabUrl - Optional URL for URL-based persistence
 */
function saveTabVolume(
  tabId: number,
  volumeData: TabVolumeData,
  tabUrl?: string
): void {
  if (!isValidTabId(tabId)) {
    console.error("Invalid tabId for saving:", tabId);
    return;
  }

  try {
    // Save by tab ID for active session
    const key = `tab-volume-${tabId}`;
    chrome.storage.local.set({ [key]: volumeData }, () => {
      if (chrome.runtime.lastError) {
        console.error("Error saving tab volume:", chrome.runtime.lastError);
      }
    });

    // Also save by URL if available (for persistence across sessions)
    if (tabUrl) {
      volumeData.tabUrl = tabUrl;
      const urlKey = `url-volume-${tabUrl}`;
      chrome.storage.local.set({ [urlKey]: volumeData }, () => {
        if (chrome.runtime.lastError) {
          console.error("Error saving URL volume:", chrome.runtime.lastError);
        }
      });
      urlVolumeSettings.set(tabUrl, volumeData);
    }
  } catch (e) {
    console.error("Error in saveTabVolume:", e);
  }
} // End of function saveTabVolume()

/**
 * Function isValidTabId() validates that a tab ID is a positive number
 * @param tabId - The tab ID to validate
 * @returns boolean - True if tabId is valid
 */
function isValidTabId(tabId: any): boolean {
  return typeof tabId === "number" && !isNaN(tabId) && tabId > 0;
} // End of function isValidTabId()

/**
 * Function getDefaultVolumeData() returns standard default volume settings
 * Used when no settings are available for a tab
 * @returns TabVolumeData - Default volume settings
 */
function getDefaultVolumeData(): TabVolumeData {
  return {
    volume: 100, // 100% volume by default
    previousVolume: 100, // 100% previous volume by default
    muted: false, // Not muted by default
    hasAudio: true, // Assume tab has audio capabilities
  };
} // End of function getDefaultVolumeData()

/**
 * Function getVolumeDataForTab() retrieves volume settings for a tab
 * Tries tab ID first, then URL, then defaults
 * @param tabId - Chrome tab identifier
 * @param tabUrl - Optional URL to check for saved settings
 * @returns TabVolumeData - Volume settings for the tab
 */
function getVolumeDataForTab(tabId: number, tabUrl?: string): TabVolumeData {
  if (!isValidTabId(tabId)) {
    console.warn("Invalid tabId in getVolumeDataForTab:", tabId);
    return getDefaultVolumeData();
  }

  try {
    // First try by tab ID (for active session)
    if (tabVolumeSettings.has(tabId)) {
      return tabVolumeSettings.get(tabId)!;
    }

    // Then try by URL if available (for persistence across sessions)
    if (tabUrl && urlVolumeSettings.has(tabUrl)) {
      const data = urlVolumeSettings.get(tabUrl)!;
      tabVolumeSettings.set(tabId, data); // Cache for future use
      saveTabVolume(tabId, data, tabUrl); // Update storage with new tab ID
      return data;
    }
  } catch (e) {
    console.error("Error in getVolumeDataForTab:", e);
  }

  // Default if nothing found
  return getDefaultVolumeData();
} // End of function getVolumeDataForTab()

/**
 * Function sendMessageToTab() sends a message to a tab with retry logic
 * Messages that fail are queued for retry
 * @param tabId - Chrome tab identifier
 * @param message - Message to send
 * @param retryCount - Current retry attempt count
 */
function sendMessageToTab(tabId: number, message: any, retryCount = 0) {
  if (!isValidTabId(tabId)) {
    console.error("Invalid tabId for sending message:", tabId);
    return;
  }

  if (!message || typeof message !== "object" || !message.action) {
    console.error("Invalid message format:", message);
    return;
  }

  if (retryCount >= MAX_RETRIES) {
    console.log(`Max retries reached for tab ${tabId}, giving up.`);
    return;
  }

  try {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        console.log(
          `Error sending message to tab ${tabId}: ${chrome.runtime.lastError.message}`
        );

        // Add message to queue for retry
        if (!messageQueues.has(tabId)) {
          messageQueues.set(tabId, []);
        }

        const queue = messageQueues.get(tabId)!;
        if (queue.length < MAX_QUEUE_SIZE) {
          queue.push({
            message,
            retryCount: retryCount + 1,
            time: Date.now(),
          });
        } else {
          console.warn(`Message queue overflow for tab ${tabId}`);
        }

        return;
      }

      // Message sent successfully
      console.log(`Message sent successfully to tab ${tabId}`);
    });
  } catch (error) {
    console.error(`Error sending message to tab ${tabId}:`, error);
  }
} // End of function sendMessageToTab()

/**
 * Function processMessageQueue() processes pending messages for a tab
 * Called periodically and when tab status changes
 * @param tabId - Chrome tab identifier
 */
function processMessageQueue(tabId: number) {
  if (!isValidTabId(tabId) || !messageQueues.has(tabId)) return;

  const queue = messageQueues.get(tabId)!;
  if (queue.length === 0) return;

  try {
    // Process each message in the queue
    const currentTime = Date.now();
    const messagesToProcess = [...queue].slice(0, MAX_QUEUE_SIZE);
    messageQueues.set(tabId, []);

    messagesToProcess.forEach((item) => {
      // Validate message structure
      if (
        !item.message ||
        typeof item.message !== "object" ||
        !item.message.action
      ) {
        console.error("Invalid queued message:", item.message);
        return;
      }

      // Only retry messages that aren't too old (60 seconds max)
      if (currentTime - item.time >= 1000 && currentTime - item.time < 60000) {
        sendMessageToTab(tabId, item.message, item.retryCount);
      } else if (currentTime - item.time < 1000) {
        // Too recent, put back in queue if there's space
        const currentQueue = messageQueues.get(tabId)!;
        if (currentQueue.length < MAX_QUEUE_SIZE) {
          currentQueue.push(item);
        } else {
          console.warn("Message queue overflow for tab", tabId);
        }
      } else {
        console.warn("Discarding old message for tab", tabId);
      }
    });
  } catch (e) {
    console.error("Error processing message queue:", e);
  }
} // End of function processMessageQueue()

// Process message queues every 2 seconds to handle retries
setInterval(() => {
  try {
    messageQueues.forEach((queue, tabId) => {
      processMessageQueue(tabId);
    });
  } catch (e) {
    console.error("Error in message queue interval:", e);
  }
}, 2000);

/**
 * Function applyVolumeToTab() sends volume settings to a tab's content script
 * @param tabId - Chrome tab identifier
 * @param volumeData - Volume settings to apply
 */
function applyVolumeToTab(tabId: number, volumeData: TabVolumeData): void {
  if (!isValidTabId(tabId)) {
    console.error("Invalid tabId for applying volume:", tabId);
    return;
  }

  try {
    const message = {
      action: volumeData.muted ? "toggleMute" : "setVolume",
      volume: volumeData.volume,
      muted: volumeData.muted,
      previousVolume: volumeData.previousVolume,
    };

    sendMessageToTab(tabId, message);
  } catch (e) {
    console.error("Error in applyVolumeToTab:", e);
  }
} // End of function applyVolumeToTab()

// Listen for tab updates to detect audio
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!isValidTabId(tabId)) {
    return;
  }

  try {
    if (changeInfo.status === "complete") {
      // Tab is fully loaded, process any queued messages after a short delay
      setTimeout(() => {
        processMessageQueue(tabId);
      }, 1000);
    }

    if (changeInfo.audible !== undefined) {
      // Tab started or stopped playing audio
      console.log(`Tab ${tabId} audible: ${changeInfo.audible}`);

      if (changeInfo.audible) {
        audibleTabs.add(tabId);

        // Initialize volume data if not present, checking URL first
        const volumeData = getVolumeDataForTab(tabId, tab.url);
        volumeData.hasAudio = true;

        tabVolumeSettings.set(tabId, volumeData);
        saveTabVolume(tabId, volumeData, tab.url);

        // Apply the volume setting to the tab with a delay
        setTimeout(() => {
          applyVolumeToTab(tabId, volumeData);
        }, 1000);
      } else {
        audibleTabs.delete(tabId);
      }

      // Notify popup if it's open
      try {
        chrome.runtime.sendMessage(
          {
            action: "tabAudibleChanged",
            tabId,
            audible: changeInfo.audible,
            tab,
          },
          () => {
            // Ignore any errors
            if (chrome.runtime.lastError) return;
          }
        );
      } catch (error) {
        console.error("Error notifying popup:", error);
      }
    }

    // If the URL changed, check if we have settings for it
    if (changeInfo.url && tab.id) {
      const newUrl = changeInfo.url;
      if (urlVolumeSettings.has(newUrl)) {
        const volumeData = urlVolumeSettings.get(newUrl)!;
        tabVolumeSettings.set(tab.id, volumeData);

        // If the tab is audible, apply the volume
        if (tab.audible) {
          setTimeout(() => {
            applyVolumeToTab(tab.id!, volumeData);
          }, 1000);
        }
      }
    }
  } catch (e) {
    console.error("Error in tabs.onUpdated handler:", e);
  }
});

// Listen for tab removal to clean up resources
chrome.tabs.onRemoved.addListener((tabId) => {
  if (!isValidTabId(tabId)) {
    return;
  }

  try {
    audibleTabs.delete(tabId);
    tabVolumeSettings.delete(tabId);
    messageQueues.delete(tabId);
  } catch (e) {
    console.error("Error in tabs.onRemoved handler:", e);
  }
});

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Add origin validation for security
  if (sender.id && sender.id !== chrome.runtime.id) {
    console.error("Message from unauthorized source:", sender.id);
    return false;
  }

  // Validate message structure
  if (!message || typeof message !== "object" || !message.action) {
    console.error("Invalid message format:", message);
    return false;
  }

  try {
    // Content script reports it's ready
    if (message.action === "contentScriptReady" && sender.tab?.id) {
      const tabId = sender.tab.id;

      if (!isValidTabId(tabId)) {
        console.error("Invalid tabId in contentScriptReady:", tabId);
        sendResponse({ success: false, error: "Invalid tabId" });
        return true;
      }

      console.log(`Content script ready in tab ${tabId}`);

      // Process any queued messages for this tab
      processMessageQueue(tabId);

      sendResponse({ success: true });
      return true;
    }

    // Handle request for tabs with audio
    if (message.action === "getAudibleTabs") {
      // Get all tabs that we're tracking
      const trackedTabIds = new Set([
        ...audibleTabs,
        ...tabVolumeSettings.keys(),
      ]);

      chrome.tabs.query({}, (tabs) => {
        try {
          // Filter to include tabs we're tracking with audio
          const relevantTabs = tabs.filter(
            (tab) =>
              tab.id &&
              isValidTabId(tab.id) &&
              (audibleTabs.has(tab.id) ||
                (tabVolumeSettings.has(tab.id) &&
                  tabVolumeSettings.get(tab.id)!.hasAudio) ||
                (tab.url && urlVolumeSettings.has(tab.url)))
          );

          // Add volume settings to tab data
          const tabsWithVolume = relevantTabs.map((tab) => {
            const volumeData = getVolumeDataForTab(tab.id!, tab.url);
            return {
              ...tab,
              volumeData,
            };
          });

          sendResponse({ tabs: tabsWithVolume });
        } catch (e) {
          console.error("Error processing getAudibleTabs:", e);
          sendResponse({ tabs: [], error: String(e) });
        }
      });
      return true; // For async response
    }

    // Handle volume update request from popup
    if (message.action === "updateTabVolume") {
      const { tabId, volume, muted, previousVolume } = message;

      // Validate inputs
      if (!isValidTabId(tabId)) {
        console.error("Invalid tabId in updateTabVolume:", tabId);
        sendResponse({ success: false, error: "Invalid tabId" });
        return true;
      }

      if (volume !== undefined && !isValidVolume(volume)) {
        console.error("Invalid volume in updateTabVolume:", volume);
        sendResponse({ success: false, error: "Invalid volume" });
        return true;
      }

      if (previousVolume !== undefined && !isValidVolume(previousVolume)) {
        console.error(
          "Invalid previousVolume in updateTabVolume:",
          previousVolume
        );
        sendResponse({ success: false, error: "Invalid previousVolume" });
        return true;
      }

      if (muted !== undefined && typeof muted !== "boolean") {
        console.error("Invalid muted state in updateTabVolume:", muted);
        sendResponse({ success: false, error: "Invalid muted state" });
        return true;
      }

      // Get current tab info for URL
      chrome.tabs.get(tabId, (tab) => {
        try {
          if (chrome.runtime.lastError) {
            console.error("Error getting tab info:", chrome.runtime.lastError);
            sendResponse({
              success: false,
              error: chrome.runtime.lastError.message,
            });
            return;
          }

          const volumeData = getVolumeDataForTab(tabId, tab.url);

          // Update volume settings with new values
          const newVolumeData: TabVolumeData = {
            ...volumeData,
            volume: volume !== undefined ? volume : volumeData.volume,
            muted: muted !== undefined ? muted : volumeData.muted,
            previousVolume:
              previousVolume !== undefined
                ? previousVolume
                : volumeData.previousVolume,
            hasAudio: true,
          };

          tabVolumeSettings.set(tabId, newVolumeData);
          saveTabVolume(tabId, newVolumeData, tab.url);

          // Apply the new settings
          applyVolumeToTab(tabId, newVolumeData);

          // Respond immediately to prevent message channel error
          sendResponse({ success: true });
        } catch (e) {
          console.error("Error in updateTabVolume:", e);
          sendResponse({ success: false, error: String(e) });
        }
      });
      return true; // For async response
    }

    // Handle audio status request from content script
    if (message.action === "getAudioStatus" && sender.tab?.id) {
      const tabId = sender.tab.id;

      if (!isValidTabId(tabId)) {
        console.error("Invalid tabId in getAudioStatus:", tabId);
        sendResponse({ success: false, error: "Invalid tabId" });
        return true;
      }

      const tabUrl = sender.tab.url;

      // Get volume data for this tab
      const volumeData = getVolumeDataForTab(tabId, tabUrl);

      // Send the volume data back to the content script
      sendResponse({
        volume: volumeData.volume,
        muted: volumeData.muted,
        previousVolume: volumeData.previousVolume,
      });

      return true; // For async response
    }

    // Handle content script reporting audio status
    if (message.action === "updateTabStatus" && sender.tab?.id) {
      const tabId = sender.tab.id;

      if (!isValidTabId(tabId)) {
        console.error("Invalid tabId in updateTabStatus:", tabId);
        sendResponse({ success: false, error: "Invalid tabId" });
        return true;
      }

      const tabUrl = sender.tab.url;

      // Validate hasAudio
      if (typeof message.hasAudio !== "boolean") {
        console.error("Invalid hasAudio value:", message.hasAudio);
        sendResponse({ success: false, error: "Invalid hasAudio value" });
        return true;
      }

      // Get or create volume data
      const volumeData = getVolumeDataForTab(tabId, tabUrl);
      volumeData.hasAudio = message.hasAudio;

      // Save updated data
      tabVolumeSettings.set(tabId, volumeData);
      saveTabVolume(tabId, volumeData, tabUrl);

      sendResponse({ success: true });
      return true;
    }
  } catch (e) {
    console.error("Error handling message:", e);
    sendResponse({ success: false, error: String(e) });
  }

  // If we get here, no handler matched
  sendResponse({ success: false, error: "Unknown action" });
  return true;
});

console.log("Volume controller background script initialized");
