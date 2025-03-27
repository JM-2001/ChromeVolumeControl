// Self-executing function to isolate variables from global scope and avoid conflicts
(function () {
  // Core audio processing variables
  let audioContext: AudioContext | null = null; // Web Audio API context for processing audio
  let gainNode: GainNode | null = null; // Node that controls volume level
  let mediaElements: HTMLMediaElement[] = []; // Tracked audio/video elements on the page
  let currentVolume: number = 100; // Current volume level (0-100)

  /**
   * Function isValidVolume() validates that a volume value is within acceptable range
   * @param volume - Value to check
   * @returns boolean - True if volume is a number between 0-100
   */
  function isValidVolume(value: any): boolean {
    return (
      typeof value === "number" && !isNaN(value) && value >= 0 && value <= 100
    );
  } // End of function isValidVolume()

  /**
   * Function initAudio() creates and initializes the Web Audio API context and gain node
   * Called when volume control is needed or media is detected
   */
  function initAudio(): void {
    // Skip if already initialized
    if (audioContext) return;

    try {
      // Create new audio context (the foundation of Web Audio API)
      audioContext = new AudioContext();

      // Create gain node that will control volume for all connected media
      gainNode = audioContext.createGain();
      gainNode.gain.value = 1.0; // Default = 100%

      // Connect gain node to audio output
      gainNode.connect(audioContext.destination);

      // Apply any previously set volume level
      setVolume(currentVolume);
      console.log("Audio context initialized");
    } catch (e) {
      console.error("Error initializing AudioContext:", e);
    }
  } // End of function initAudio()

  /**
   * Function setVolume() sets the volume for all connected audio elements
   * @param volumePercent - Volume level from 0-100
   */
  function setVolume(volumePercent: number): void {
    // Validate input
    if (!isValidVolume(volumePercent)) {
      console.error("Invalid volume value:", volumePercent);
      return;
    }

    // If audio system not initialized, just store the value for later
    if (!gainNode) {
      currentVolume = volumePercent;
      return;
    }

    // Convert percentage (0-100) to gain value (0-1)
    const gainValue = volumePercent / 100;
    gainNode.gain.value = gainValue;
    currentVolume = volumePercent;
    console.log(`Volume set to ${volumePercent}%`);
  } // End of function setVolume()

  /**
   * Function findAndConnectAudio() finds all audio/video elements and connects them to our gain node
   * This allows us to control their volume centrally
   */
  function findAndConnectAudio(): void {
    // Skip if audio system not initialized
    if (!audioContext || !gainNode) return;

    try {
      // Find all audio and video elements on the page
      const audioElements = Array.from(
        document.querySelectorAll("audio, video")
      ).filter((el) => el instanceof HTMLMediaElement) as HTMLMediaElement[];

      // Filter to only process elements we haven't seen before
      const newElements = audioElements.filter(
        (el) => !mediaElements.includes(el) && el.src !== ""
      );

      // Process each new media element
      newElements.forEach((element) => {
        try {
          // Double-check element type for safety
          if (!(element instanceof HTMLMediaElement)) {
            console.warn("Not a valid media element:", element);
            return;
          }

          // Verify element is still in DOM (could be removed during iteration)
          if (!document.contains(element)) {
            console.warn("Element not in DOM:", element);
            return;
          }

          // Connect the media element to our gain node for volume control
          const source = audioContext!.createMediaElementSource(element);
          source.connect(gainNode!);
          mediaElements.push(element);
          console.log("Connected audio element to gain node");
        } catch (e) {
          console.error("Error connecting audio element:", e);
        }
      });

      // Notify the extension if we found new audio elements
      if (newElements.length > 0) {
        safelyNotifyBackgroundScript("updateTabStatus", { hasAudio: true });
      }
    } catch (e) {
      console.error("Error in findAndConnectAudio:", e);
    }
  } // End of function findAndConnectAudio()

  /**
   * Function safelyNotifyBackgroundScript() safely sends messages to the extension background script
   * Includes error handling for common Chrome extension issues
   * @param action - Message action type
   * @param data - Additional data to send
   */
  function safelyNotifyBackgroundScript(action: string, data: any = {}) {
    try {
      if (typeof chrome !== "undefined" && chrome.runtime) {
        chrome.runtime.sendMessage({ action, ...data }, function (response) {
          if (chrome.runtime.lastError) {
            console.error("Error sending message:", chrome.runtime.lastError);
            return;
          }
          // Response handling is optional
        });
      }
    } catch (e) {
      console.error("Error in safelyNotifyBackgroundScript:", e);
    }
  } // End of function safelyNotifyBackgroundScript()

  /**
   * Function observeDOMChanges() sets up observer to watch for DOM changes that might add new media elements
   * This ensures we capture dynamically added audio/video elements
   */
  function observeDOMChanges(): void {
    try {
      // Create a mutation observer to monitor DOM changes
      const observer = new MutationObserver((mutations) => {
        let hasNewMedia = false;

        // Check each mutation for potential new media elements
        mutations.forEach((mutation) => {
          if (mutation.type === "childList") {
            const audioElements = Array.from(
              document.querySelectorAll("audio, video")
            ).filter(
              (el) => el instanceof HTMLMediaElement
            ) as HTMLMediaElement[];

            // Check if there are any media elements we haven't processed
            hasNewMedia = audioElements.some(
              (el) => !mediaElements.includes(el)
            );
          }
        });

        // If new media was found, connect it to our audio system
        if (hasNewMedia) {
          findAndConnectAudio();
        }
      });

      // Start observing the entire document for changes
      observer.observe(document.body, {
        childList: true, // Watch for added/removed elements
        subtree: true, // Watch the entire DOM tree
      });
    } catch (e) {
      console.error("Error setting up mutation observer:", e);
    }
  } // End of function observeDOMChanges()

  /**
   * Function requestInitialVolume() requests initial volume settings from the background script
   * This ensures the page respects user's previously set volume preferences
   */
  function requestInitialVolume(): void {
    try {
      if (typeof chrome !== "undefined" && chrome.runtime) {
        chrome.runtime.sendMessage(
          { action: "getAudioStatus" },
          function (response) {
            if (chrome.runtime.lastError) {
              console.error(
                "Error requesting volume:",
                chrome.runtime.lastError
              );
              return;
            }

            // Apply volume settings if available
            if (response && isValidVolume(response.volume)) {
              setVolume(response.volume);
              console.log(`Applied volume settings: ${response.volume}%`);
            }
          }
        );
      }
    } catch (e) {
      console.error("Error in requestInitialVolume:", e);
    }
  } // End of function requestInitialVolume()

  /**
   * Sets up message listener to receive commands from the extension popup and background script
   * This enables real-time control of audio on the page
   */
  try {
    if (
      typeof chrome !== "undefined" &&
      chrome.runtime &&
      chrome.runtime.onMessage
    ) {
      chrome.runtime.onMessage.addListener(function (
        request,
        sender,
        sendResponse
      ) {
        // Security check: Verify message is from our extension
        if (sender.id && sender.id !== chrome.runtime.id) {
          console.error("Message from unauthorized source:", sender.id);
          return false;
        }

        // Input validation
        if (!request || typeof request !== "object" || !request.action) {
          console.error("Invalid message format:", request);
          return false;
        }

        try {
          // Handle different message types
          switch (request.action) {
            case "getAudioStatus":
              // Prepare audio system and find media elements
              initAudio();
              findAndConnectAudio();

              // Check if any media is currently playing
              const anyMediaPlaying = mediaElements.some((el) => !el.paused);

              // Report current audio status
              sendResponse({
                hasAudio: mediaElements.length > 0,
                volume: currentVolume,
                isPlaying: anyMediaPlaying,
              });
              break;

            case "setVolume":
              // Validate volume parameter
              if (!isValidVolume(request.volume)) {
                console.error("Invalid volume in message:", request.volume);
                sendResponse({ success: false, error: "Invalid volume" });
                break;
              }

              // Initialize, find media, and apply new volume
              initAudio();
              findAndConnectAudio();
              setVolume(request.volume);
              sendResponse({ success: true, volume: currentVolume });
              break;

            case "toggleMute":
              // Validate mute parameter
              if (typeof request.muted !== "boolean") {
                console.error("Invalid muted state:", request.muted);
                sendResponse({ success: false, error: "Invalid muted state" });
                break;
              }

              // Initialize and prepare audio system
              initAudio();
              findAndConnectAudio();

              // Either mute by setting volume to 0, or restore previous volume
              if (request.muted) {
                setVolume(0);
              } else {
                const prevVol = isValidVolume(request.previousVolume)
                  ? request.previousVolume
                  : 100;
                setVolume(prevVol);
              }
              sendResponse({ success: true });
              break;

            case "playPauseAudio":
              // Find the first media element on the page
              const mediaEl = document.querySelector(
                "audio, video"
              ) as HTMLMediaElement;

              if (mediaEl && mediaEl instanceof HTMLMediaElement) {
                const wasPlaying = !mediaEl.paused;
                try {
                  // Toggle play/pause state
                  if (mediaEl.paused) {
                    // Play and handle async result
                    mediaEl
                      .play()
                      .then(() => {
                        sendResponse({
                          success: true,
                          isPlaying: true,
                        });
                      })
                      .catch((error) => {
                        console.error("Error playing media:", error);
                        sendResponse({
                          success: false,
                          error: String(error),
                        });
                      });
                  } else {
                    // Pause is synchronous
                    mediaEl.pause();
                    sendResponse({
                      success: true,
                      isPlaying: false,
                    });
                  }
                } catch (e) {
                  console.error("Error in playPause:", e);
                  sendResponse({
                    success: false,
                    error: String(e),
                  });
                }
                return true; // Keep message channel open for async response
              } else {
                sendResponse({
                  success: false,
                  error: "No valid media element found",
                });
              }
              break;

            default:
              console.warn("Unknown action:", request.action);
              sendResponse({ success: false, error: "Unknown action" });
          }
        } catch (e) {
          console.error("Error handling message:", e);
          sendResponse({ success: false, error: String(e) });
        }
        return true; // Keep message channel open for async responses
      });
    }
  } catch (e) {
    console.error("Error setting up message listener:", e);
  }

  /**
   * Function initialize() is the main initialization function
   * Sets up all required components and periodic checks
   */
  function initialize() {
    try {
      // Set up audio system
      initAudio();

      // Initial scan for media elements
      findAndConnectAudio();

      // Start watching for DOM changes
      observeDOMChanges();

      // Inform background script that content script is active
      safelyNotifyBackgroundScript("contentScriptReady");

      // Wait briefly before requesting stored volume settings
      // This delay helps ensure the background script is ready
      setTimeout(requestInitialVolume, 500);

      // Periodically check for new audio elements (backup for observer)
      setInterval(findAndConnectAudio, 5000);
    } catch (e) {
      console.error("Error in initialize:", e);
    }
  } // End of function initialize()

  /**
   * Global error handler
   * Specifically handles extension context invalidation errors
   * which occur when the extension is reloaded/updated
   */
  window.addEventListener("error", (event) => {
    if (
      event.error &&
      event.error.message &&
      event.error.message.includes("Extension context invalidated")
    ) {
      console.log(
        "Extension was reloaded - continuing with basic audio functionality"
      );
    }
  });

  // Start the content script
  initialize();
  console.log("Volume controller content script loaded");
})();
