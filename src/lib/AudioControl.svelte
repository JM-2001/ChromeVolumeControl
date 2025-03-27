<script lang="ts">
  // Import components and functions
  import expandIcon from "../assets/expand-down-svgrepo-com.svg";
  import { slide } from "svelte/transition";
  import { linear } from "svelte/easing";

  // Define component props that are passed from the parent component
  let {
    tabId,
    tabTitle,
    favIconUrl,
    tabVolume,
    tabMuted = false,
    previousVolume = 100,
    isPlaying = true,
  } = $props();

  // Define states from props
  let volumeVal = $state(tabVolume);
  let visible = $state(false);
  let muted = $state(tabMuted);
  let playing = $state(isPlaying);

  /**
   * Function isValidVolume() checks if a given value is a valid volume percentage.
   * @param volume - The volume value to validate
   * @returns boolean - True if volume is valid
   */
  function isValidVolume(volume: any): boolean {
    return (
      typeof volume === "number" &&
      !isNaN(volume) &&
      volume >= 0 &&
      volume <= 100
    );
  }

  /**
   * Function isValidTabId() checks if a given value is a valid Chrome tab ID.
   * @param tabId - The tab ID to validate
   * @returns boolean - True if tabId is valid
   */
  function isValidTabId(tabId: any): boolean {
    return typeof tabId === "number" && !isNaN(tabId) && tabId > 0;
  }

  /**
   * Function toggleControls() toggles the visibility of the audio controls.
   */
  function toggleControls() {
    visible = !visible;
  }

  /**
   * Function updateVolume() updates the volume of the audio in the tab and stores the new value. Furthermore, it
   * sends updated volume information to the content script and background script.
   * @param newVolume - The new volume value to set (0-100)
   */
  function updateVolume(newVolume: number) {
    // Validate input before proceeding
    if (!isValidVolume(newVolume)) {
      console.error("Invalid volume value:", newVolume);
      return;
    }

    if (!isValidTabId(tabId)) {
      console.error("Invalid tabId:", tabId);
      return;
    }

    volumeVal = newVolume;

    // Auto-update mute state based on volume level
    if (newVolume === 0) {
      muted = true;
    } else {
      muted = false;
    }

    // Store previous non-zero volume for unmute restoration
    if (newVolume > 0) {
      previousVolume = newVolume;
    }

    // Send message to content script and background script
    try {
      if (typeof chrome !== "undefined" && chrome.tabs) {
        // Update volume directly in the tab via content script
        chrome.tabs.sendMessage(
          tabId,
          {
            action: "setVolume",
            volume: newVolume,
          },
          function (response) {
            if (chrome.runtime.lastError) {
              console.error(
                "Error sending volume to tab:",
                chrome.runtime.lastError
              );
            }
          }
        );

        // Update state in background script for persistence
        chrome.runtime.sendMessage(
          {
            action: "updateTabVolume",
            tabId: tabId,
            volume: newVolume,
            muted: newVolume === 0,
            previousVolume: previousVolume,
          },
          function (response) {
            if (chrome.runtime.lastError) {
              console.error(
                "Error updating volume in background:",
                chrome.runtime.lastError
              );
            }
          }
        );
      }
    } catch (e) {
      console.error("Error in updateVolume:", e);
    }
  } // End of function updateVolume()

  /**
   * Function toggleMute() toggles the mute state of the audio in the tab and stores the new state. Furthermore, it
   * sends updated mute information to the content script and background script.
   */
  function toggleMute() {
    if (!isValidTabId(tabId)) {
      console.error("Invalid tabId:", tabId);
      return;
    }

    muted = !muted;

    if (muted) {
      // When muting, save current volume and set to 0
      if (volumeVal > 0) {
        previousVolume = volumeVal;
      }
      volumeVal = 0;
    } else {
      // When unmuting, restore previous volume
      volumeVal = previousVolume;
    }

    // Send message to content script
    try {
      if (typeof chrome !== "undefined" && chrome.tabs) {
        chrome.tabs.sendMessage(
          tabId,
          {
            action: "toggleMute",
            muted: muted,
            previousVolume: previousVolume,
          },
          function (response) {
            if (chrome.runtime.lastError) {
              console.error(
                "Error toggling mute in tab:",
                chrome.runtime.lastError
              );
            }
          }
        );

        // Update in background script
        chrome.runtime.sendMessage(
          {
            action: "updateTabVolume",
            tabId: tabId,
            volume: volumeVal,
            muted: muted,
            previousVolume: previousVolume,
          },
          function (response) {
            if (chrome.runtime.lastError) {
              console.error(
                "Error updating mute state in background:",
                chrome.runtime.lastError
              );
            }
          }
        );
      }
    } catch (e) {
      console.error("Error in toggleMute:", e);
    }
  } // End of function toggleMute()

  /**
   * Function resetVolume() resets the volume of the audio in the tab to 100% and stores the new value. Furthermore, it
   * sends updated volume information to the content script and background script.
   */
  function resetVolume() {
    if (!isValidTabId(tabId)) {
      console.error("Invalid tabId:", tabId);
      return;
    }

    volumeVal = 100;
    previousVolume = 100;
    muted = false;

    // Send message to content script
    try {
      if (typeof chrome !== "undefined" && chrome.tabs) {
        chrome.tabs.sendMessage(
          tabId,
          {
            action: "setVolume",
            volume: 100,
          },
          function (response) {
            if (chrome.runtime.lastError) {
              console.error(
                "Error resetting volume in tab:",
                chrome.runtime.lastError
              );
            }
          }
        );

        // Update in background script
        chrome.runtime.sendMessage(
          {
            action: "updateTabVolume",
            tabId: tabId,
            volume: 100,
            muted: false,
            previousVolume: 100,
          },
          function (response) {
            if (chrome.runtime.lastError) {
              console.error(
                "Error updating reset volume in background:",
                chrome.runtime.lastError
              );
            }
          }
        );
      }
    } catch (e) {
      console.error("Error in resetVolume:", e);
    }
  } // End of function resetVolume()

  /**
   * Function playPauseAudio() toggles the play/pause state of the audio in the tab and stores the new state. Furthermore, it
   * sends updated play/pause information to the content script.
   */
  function playPauseAudio() {
    if (!isValidTabId(tabId)) {
      console.error("Invalid tabId:", tabId);
      return;
    }

    try {
      if (typeof chrome !== "undefined" && chrome.tabs) {
        // Send message to content script
        chrome.tabs.sendMessage(
          tabId,
          {
            action: "playPauseAudio",
          },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error(
                "Error toggling play/pause:",
                chrome.runtime.lastError
              );
              return;
            }

            if (response && response.success) {
              // Use the returned state instead of just toggling
              playing = response.isPlaying;
            }
          }
        );
      }
    } catch (e) {
      console.error("Error in playPauseAudio:", e);
    }
  } // End of function playPauseAudio()

  // Define tick values
  const ticks = [0, 25, 50, 75, 100];
</script>

<div class="audio-controller">
  <!-- Audio Info -->
  <div class="audio-info">
    <div class="audio-name">
      <div class="tab-icon-container">
        <img src={favIconUrl} alt="Tab Icon" class="tab-icon" />
      </div>
      <h2>{tabTitle}</h2>
    </div>
    <button class="collapsible-btn" onclick={toggleControls} type="button">
      <img
        src={expandIcon}
        alt="Collapsible Icon"
        class="collapsible-icon"
        class:rotated={visible}
      />
    </button>
  </div>
  <!-- Audio Controls -->
  {#if visible}
    <div
      class="audio-controls"
      transition:slide={{ duration: 300, easing: linear }}
    >
      <form>
        <div class="form-group">
          <input
            type="range"
            list="volume-ticks"
            min="0"
            max="100"
            class="volume-range"
            value={volumeVal}
            oninput={(e) =>
              updateVolume(parseInt((e.target as HTMLInputElement).value))}
          />
          <datalist id="volume-ticks">
            <option value="0"></option>
            <option value="25"></option>
            <option value="50"></option>
            <option value="75"></option>
            <option value="100"></option>
          </datalist>
          <div class="ticks-container">
            {#each ticks as tick}
              <div class="tick">
                <span class="tick-label">{tick}</span>
              </div>
            {/each}
          </div>
        </div>

        <div class="form-group-grid">
          <button class="button" type="button" onclick={toggleMute}>
            {muted ? "Unmute" : "Mute"}
          </button>
          <button class="button" type="button" onclick={resetVolume}>
            Reset Volume
          </button>
          <button class="button" type="button" onclick={playPauseAudio}>
            {playing ? "Pause" : "Play"}
          </button>
        </div>
      </form>
    </div>
  {/if}
  <!-- Audio Volume Info -->
  <div class="volume-info">
    <p>Volume: {volumeVal}%</p>
  </div>
</div>

<style>
  .rotated {
    transform: rotate(180deg);
  }
</style>
