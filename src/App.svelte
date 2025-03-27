<script lang="ts">
  // Import components and functions
  import TitleComp from "./lib/TitleComp.svelte";
  import AudioControl from "./lib/AudioControl.svelte";
  import LoadingContainer from "./lib/LoadingContainer.svelte";
  import NoAudioContainer from "./lib/NoAudioContainer.svelte";
  import { onMount, onDestroy } from "svelte";

  /**
   * Define types for Chrome tabs with audio and their volume settings
   */
  interface AudioTab {
    id: number; // Chrome tab ID
    title: string; // Tab title
    favIconUrl: string; // Tab favicon URL
    volumeData: TabVolumeData; // Volume settings for this tab
  }

  interface TabVolumeData {
    volume: number; // Current volume (0-100)
    previousVolume: number; // Volume before muting (to restore when unmuted)
    muted: boolean; // Whether tab is muted
    isPlaying?: boolean; // Whether audio is currently playing
  }

  // State for audio tabs and loading status
  let audioTabs = $state<AudioTab[]>([]);
  let loadingTabs = $state(true);

  /**
   * Function loadAudibleTabs() fetches all tabs that have audio playing
   */
  function loadAudibleTabs() {
    // Check if Chrome extension APIs are available
    if (typeof chrome !== "undefined" && chrome.runtime) {
      // Request audible tabs from the background script
      chrome.runtime.sendMessage({ action: "getAudibleTabs" }, (response) => {
        if (response && response.tabs) {
          // Transform raw tab data into our AudioTab format with proper defaults
          audioTabs = response.tabs.map((tab) => ({
            id: tab.id || 0,
            title: tab.title || "Unknown Tab",
            favIconUrl: tab.favIconUrl || "/src/assets/icon-48.png",
            volumeData: tab.volumeData || {
              volume: 100,
              previousVolume: 100,
              muted: false,
              isPlaying: true,
            },
          }));
        }
        // Update loading state when complete
        loadingTabs = false;
      });
    } else {
      // For development without Chrome API - provide mock data
      loadingTabs = false;

      audioTabs = [
        {
          id: 1,
          title: "AMONGUS.mp3",
          favIconUrl: "/src/assets/svelte.svg",
          volumeData: {
            volume: 100,
            previousVolume: 100,
            muted: false,
          },
        },
        {
          id: 2,
          title: "YouTube Music",
          favIconUrl: "https://www.youtube.com/favicon.ico",
          volumeData: {
            volume: 50,
            previousVolume: 100,
            muted: false,
          },
        },
      ];
    }
  }

  onMount(() => {
    // Initial load of audible tabs when component mounts
    loadAudibleTabs();

    // Set up listener for real-time audio changes in tabs
    if (typeof chrome !== "undefined" && chrome.runtime) {
      chrome.runtime.onMessage.addListener((message) => {
        if (message.action === "tabAudibleChanged") {
          // When a tab's audio state changes, refresh our list
          loadAudibleTabs();
        }
      });
    }
  });
</script>

<main>
  <div>
    <!-- App title component -->
    <TitleComp />
  </div>
  <div class="audio-controllers-container">
    {#if loadingTabs}
      <!-- Show loading spinner while fetching tab data -->
      <LoadingContainer />
    {:else if audioTabs.length > 0}
      <!-- Render volume controls for each audio tab -->
      {#each audioTabs as tab (tab.id)}
        <AudioControl
          tabId={tab.id}
          tabTitle={tab.title}
          favIconUrl={tab.favIconUrl}
          tabVolume={tab.volumeData.volume}
          tabMuted={tab.volumeData.muted}
          previousVolume={tab.volumeData.previousVolume}
          isPlaying={tab.volumeData.isPlaying ?? true}
        />
      {/each}
    {:else}
      <!-- Show message when no audio tabs are detected -->
      <NoAudioContainer />
    {/if}
  </div>
</main>
