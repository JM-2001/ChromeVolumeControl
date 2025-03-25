<script lang="ts">
  import audioSrc from "../assets/AMONGUS.mp3";
  import tempImg from "../assets/svelte.svg";
  import expandIcon from "../assets/expand-down-svgrepo-com.svg";
  import { slide } from "svelte/transition";
  import { linear } from "svelte/easing";

  // Define audio tab interface
  interface AudioTab {
    tabId: number;
    tabTitle: string;
    favIconUrl: string;
    tabVolume: number;
  }

  let { tabId, tabTitle, favIconUrl, tabVolume }: AudioTab = $props();

  let volumeVal = $state(tabVolume);
  let visible = $state(false);
  let muted = $state(false);
  let previousVolume = $state(tabVolume);

  /**
   * Functions
   */
  function toggleControls() {
    visible = !visible;
  }

  function updateVolume(newVolume: number) {
    volumeVal = newVolume;

    // If muted and user changes volume, unmute
    if (muted && newVolume > 0) {
      muted = false;
    }

    // Store previous volume if it's greater than 0
    if (newVolume > 0) {
      previousVolume = newVolume;
    }
  }

  function toggleMute() {
    muted = !muted;

    if (muted) {
      // When muting, save current volume and set slider to 0
      if (volumeVal > 0) {
        previousVolume = volumeVal;
      }
      volumeVal = 0;
    } else {
      // When unmuting, restore previous volume
      volumeVal = previousVolume;
    }
  }

  function resetVolume() {
    volumeVal = 100;
    previousVolume = 100;
    muted = false;
  }

  function playPauseAudio() {}

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
            Play
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
