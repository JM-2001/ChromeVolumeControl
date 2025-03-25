<script lang="ts">
  import TitleComp from "./lib/TitleComp.svelte";
  import AudioControl from "./lib/AudioControl.svelte";
  import LoadingContainer from "./lib/LoadingContainer.svelte";
  import NoAudioContainer from "./lib/NoAudioContainer.svelte";
  import { onMount, onDestroy } from "svelte";

  // Define audio tab interface
  interface AudioTab {
    id: number;
    title: string;
    favIconUrl: string;
    volume: number;
  }

  // State for audio tabs
  let audioTabs = $state<AudioTab[]>([]);
  let loadingTabs = $state(true);

  onMount(() => {
    // For development without Chrome API
    loadingTabs = false;

    // Mock data for development
    audioTabs = [
      {
        id: 1,
        title: "AMONGUS.mp3",
        favIconUrl: "/src/assets/svelte.svg",
        volume: 100,
      },
      {
        id: 2,
        title: "YouTube Music",
        favIconUrl: "https://www.youtube.com/favicon.ico",
        volume: 50,
      },
    ];
  });
</script>

<main>
  <div>
    <TitleComp />
  </div>
  <div class="audio-controllers-container">
    {#if loadingTabs}
      <LoadingContainer />
    {:else if audioTabs.length > 0}
      {#each audioTabs as tab (tab.id)}
        <AudioControl
          tabId={tab.id}
          tabTitle={tab.title}
          favIconUrl={tab.favIconUrl}
          tabVolume={tab.volume}
        />
      {/each}
    {:else}
      <NoAudioContainer />
    {/if}
  </div>
</main>
