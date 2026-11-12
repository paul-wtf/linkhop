<script lang="ts">
  // svelte-check only types components that have a script block.
</script>

<svg
  class="wallpaper"
  viewBox="0 0 1600 900"
  preserveAspectRatio="xMidYMax slice"
  aria-hidden="true"
>
  <g class="moon">
    <circle cx="1190" cy="300" r="110" />
    <circle cx="1190" cy="300" r="72" />
  </g>
  <path class="ridge r1" d="M0 560 L140 480 L300 545 L470 430 L640 530 L820 455 L990 540 L1160 470 L1330 550 L1470 500 L1600 555 L1600 900 L0 900 Z" />
  <path class="ridge r2" d="M0 640 L180 560 L340 625 L520 540 L720 630 L900 560 L1090 645 L1280 575 L1440 640 L1600 590 L1600 900 L0 900 Z" />
  <path class="ridge r3" d="M0 730 L200 655 L380 715 L580 640 L790 725 L1000 660 L1210 730 L1420 670 L1600 720 L1600 900 L0 900 Z" />
  <path class="ridge r4" d="M0 810 L240 750 L460 800 L700 740 L950 805 L1200 750 L1430 800 L1600 765 L1600 900 L0 900 Z" />
</svg>

<style>
  /* Never combine with box-shadow: 0 0 0 100vmax. It breaks tile
     rasterization in Chromium on full-page renders. */
  .wallpaper {
    position: fixed;
    inset: 0;
    z-index: -1;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  .moon circle {
    fill: var(--moon, var(--accent));
    opacity: var(--moon-outer);
    transition: fill var(--dur-slow) var(--ease-out);
  }
  .moon circle + circle { opacity: var(--moon-inner); }
  .r1 { fill: var(--ridge-1); opacity: 0.55; }
  .r2 { fill: var(--ridge-2); opacity: 0.8; }
  .r3 { fill: var(--ridge-3); }
  .r4 { fill: var(--ridge-4); }
</style>
