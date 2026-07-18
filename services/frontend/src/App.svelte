<script>
  import { onMount } from 'svelte';
  import { GoldenLayout, LayoutConfig } from 'golden-layout';
  import 'golden-layout/dist/css/goldenlayout-base.css';
  import 'golden-layout/dist/css/themes/goldenlayout-dark-theme.css';
  import {
    buildSimulatorPanel,
    buildTerminalPanel,
    buildEditorPanel,
    buildRosStatusPanel,
    defaultLayout,
  } from './lib/panels.js';

  const LAYOUT_KEY = 'uberos.layout.v1';

  // BroadcastChannel keeps pop-out windows and the main canvas in sync.
  // Closing a pop-out sends browser state only; it never stops a workload (S5).
  const channel =
    typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel('uberos-panels')
      : null;

  let container;

  const factories = {
    simulator: buildSimulatorPanel,
    terminal: buildTerminalPanel,
    editor: buildEditorPanel,
    'ros-status': buildRosStatusPanel,
  };

  function loadSavedLayout() {
    try {
      const raw = localStorage.getItem(LAYOUT_KEY);
      if (!raw) return null;
      const resolved = JSON.parse(raw);
      // A persisted layout with no panels is useless and would render a blank
      // canvas; treat it as absent so the default layout is restored.
      if (!resolved?.root?.content?.length) return null;
      // saveLayout() returns a ResolvedLayoutConfig; loadLayout() expects a
      // (non-resolved) LayoutConfig. Passing the resolved form straight back
      // crashes Golden Layout ("trimStart is not a function") and wipes the
      // canvas, so convert it first.
      return LayoutConfig.fromResolved(resolved);
    } catch {
      return null;
    }
  }

  function clearSavedLayout() {
    try {
      localStorage.removeItem(LAYOUT_KEY);
    } catch {
      /* ignore */
    }
  }

  function saveLayout(layout) {
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout.saveLayout()));
    } catch {
      /* localStorage may be unavailable; ignore for Init */
    }
  }

  onMount(() => {
    const layout = new GoldenLayout(container);

    for (const [type, build] of Object.entries(factories)) {
      layout.registerComponentFactoryFunction(type, (componentContainer) => {
        build(componentContainer.element);
      });
    }

    const saved = loadSavedLayout();
    try {
      layout.loadLayout(saved ?? defaultLayout);
    } catch {
      // A corrupt saved layout can throw during resolution; drop it and fall
      // back to the default so the user always sees their panels.
      clearSavedLayout();
      layout.loadLayout(defaultLayout);
    }

    // Persist layout changes so a refresh restores the canvas (spec §9).
    layout.on('stateChanged', () => saveLayout(layout));

    // Notify other windows when a panel pops out (multi-screen use, J3).
    layout.on('itemCreated', (item) => {
      channel?.postMessage({ type: 'panel-created', panel: item.target?.type });
    });

    const onResize = () => layout.updateSize();
    window.addEventListener('resize', onResize);

    // Golden Layout drives splitter resizes and tab reorders by listening for
    // mousemove/touchmove on `document`. When the cursor crosses one of the
    // panel iframes (noVNC / terminal / code-server), the iframe captures those
    // events and the drag stalls the moment the splitter overlaps the iframe.
    // Marking the shell as "dragging" disables pointer events on the iframes
    // (see app.css) so the drag keeps tracking until the button is released.
    const DRAG_HANDLE = '.lm_splitter, .lm_tab';
    const endDrag = () => document.body.classList.remove('uberos-dragging');
    const startDrag = (event) => {
      if (!event.target.closest?.(DRAG_HANDLE)) return;
      document.body.classList.add('uberos-dragging');
      window.addEventListener('mouseup', endDrag, { once: true });
      window.addEventListener('touchend', endDrag, { once: true });
    };
    container.addEventListener('mousedown', startDrag, true);
    container.addEventListener('touchstart', startDrag, true);

    return () => {
      window.removeEventListener('resize', onResize);
      container.removeEventListener('mousedown', startDrag, true);
      container.removeEventListener('touchstart', startDrag, true);
      endDrag();
      channel?.close();
      layout.destroy();
    };
  });
</script>

<div class="uberos-shell">
  <header class="uberos-titlebar">
    <span class="brand">UberOS</span>
    <span class="tagline">ROS in your browser</span>
  </header>
  <div class="uberos-canvas" bind:this={container}></div>
</div>

<style>
  .uberos-shell {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .uberos-titlebar {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    padding: 0.4rem 0.9rem;
    background: var(--uberos-panel);
    border-bottom: 1px solid #313244;
  }

  .brand {
    font-weight: 700;
    color: var(--uberos-accent);
    letter-spacing: 0.03em;
  }

  .tagline {
    color: var(--uberos-muted);
    font-size: 0.8rem;
  }

  .uberos-canvas {
    position: relative;
    flex: 1;
    min-height: 0;
  }
</style>
