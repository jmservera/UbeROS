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
    PANEL_DEFS,
    LAYOUT_PRESETS,
    LAYOUTS,
    popoutUrl,
  } from './lib/panels.js';
  import { getConfig, getServices, restartService } from './lib/control.js';

  const LAYOUT_KEY = 'uberos.layout.v1';

  // BroadcastChannel keeps pop-out windows and the main canvas in sync.
  // Closing a pop-out sends browser state only; it never stops a workload (S5).
  const channel =
    typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel('uberos-panels')
      : null;

  let container;
  let layout;

  // --- System menu state (reactive) --------------------------------------
  // Panels that can be hidden/shown and reopened from the menu (BR-001/005).
  const panelDefs = Object.values(PANEL_DEFS);
  const singletonPanels = panelDefs.filter((d) => d.singleton);
  const popoutPanels = panelDefs.filter((d) => d.popout);
  let openCounts = {}; // componentType -> count of open instances
  let activeMenu = null; // 'panels' | 'layouts' | 'services' | null
  let authEnabled = false;
  let services = []; // [{ name, state, health }]
  let serviceBusy = null;
  let statusMsg = '';
  let statusTimer;

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

  function saveLayout(gl) {
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(gl.saveLayout()));
    } catch {
      /* localStorage may be unavailable; ignore for Init */
    }
  }

  // --- Golden Layout traversal helpers ------------------------------------
  function forEachComponent(fn) {
    const root = layout?.rootItem;
    if (!root) return;
    const stack = [root];
    while (stack.length) {
      const item = stack.pop();
      if (item && typeof item.componentType === 'string') fn(item);
      for (const child of item?.contentItems ?? []) stack.push(child);
    }
  }

  // Recompute which panels are open so the menu reflects current state.
  function refreshOpenPanels() {
    const counts = {};
    forEachComponent((c) => {
      counts[c.componentType] = (counts[c.componentType] ?? 0) + 1;
    });
    openCounts = counts;
  }

  function firstComponent(type) {
    let found = null;
    forEachComponent((c) => {
      if (!found && c.componentType === type) found = c;
    });
    return found;
  }

  // --- Menu actions -------------------------------------------------------
  // Hide/show a singleton panel; reopening restores a working panel (BR-001/005).
  function togglePanel(type) {
    const existing = firstComponent(type);
    if (existing) {
      existing.close();
    } else {
      layout.addComponent(type, undefined, PANEL_DEFS[type].title);
    }
    refreshOpenPanels();
    closeMenu();
  }

  // Spawn a new independent terminal PTY (BR-003). Each iframe to /terminal/
  // opens its own shell; drag it to dock/undock, or pop it out (BR-004).
  function addTerminal() {
    const n = (openCounts.terminal ?? 0) + 1;
    layout.addComponent('terminal', undefined, `Terminal ${n}`);
    refreshOpenPanels();
    flash(`Added Terminal ${n}`);
    closeMenu();
  }

  // Apply one of the four predefined layouts (BR-006).
  function applyPreset(key) {
    const preset = LAYOUTS[key];
    if (!preset) return;
    layout.loadLayout(JSON.parse(JSON.stringify(preset)));
    refreshOpenPanels();
    closeMenu();
  }

  // Pop a panel out into its own browser window with live content (BR-002).
  function popout(type) {
    const url = popoutUrl(type);
    if (url) window.open(url, '_blank', 'noopener');
    closeMenu();
  }

  async function refreshServices() {
    services = await getServices();
  }

  // Reset/restart an individual service without a full stack restart (BR-007).
  async function restart(name) {
    serviceBusy = name;
    try {
      await restartService(name);
      flash(`Restarting ${name}…`);
    } catch {
      flash(`Failed to restart ${name}`);
    } finally {
      serviceBusy = null;
      setTimeout(refreshServices, 2500);
    }
  }

  // Logout clears stored credentials and forces re-authentication (BR-008).
  function logout() {
    window.location.href = '/logout';
  }

  function flash(msg) {
    statusMsg = msg;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => (statusMsg = ''), 4000);
  }

  function toggleMenu(name) {
    activeMenu = activeMenu === name ? null : name;
    if (activeMenu === 'services') refreshServices();
  }

  function closeMenu() {
    activeMenu = null;
  }

  function onWindowClick(event) {
    if (!event.target.closest?.('.uberos-menubar')) closeMenu();
  }

  onMount(() => {
    layout = new GoldenLayout(container);

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
    refreshOpenPanels();

    // Persist layout changes and keep the menu's open/closed state in sync.
    layout.on('stateChanged', () => {
      saveLayout(layout);
      refreshOpenPanels();
    });

    // Notify other windows when a panel pops out (multi-screen use, J3).
    layout.on('itemCreated', (item) => {
      channel?.postMessage({ type: 'panel-created', panel: item.target?.type });
    });

    // Discover whether auth is enabled (controls Logout visibility) and the
    // set of services the menu may reset.
    getConfig().then((cfg) => {
      authEnabled = cfg.auth && cfg.auth !== 'off' && cfg.auth !== 'none';
    });

    const onResize = () => layout.updateSize();
    window.addEventListener('resize', onResize);
    window.addEventListener('click', onWindowClick, true);

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
      window.removeEventListener('click', onWindowClick, true);
      container.removeEventListener('mousedown', startDrag, true);
      container.removeEventListener('touchstart', startDrag, true);
      endDrag();
      clearTimeout(statusTimer);
      channel?.close();
      layout.destroy();
    };
  });
</script>

<div class="uberos-shell">
  <header class="uberos-titlebar">
    <span class="brand">UberOS</span>
    <span class="tagline">ROS in your browser</span>

    <nav class="uberos-menubar" aria-label="Workspace menu">
      <!-- Panels: hide/show and reopen any panel, add terminals (BR-001/003/005). -->
      <div class="menu-group">
        <button
          class="menu-button"
          class:open={activeMenu === 'panels'}
          aria-haspopup="true"
          aria-expanded={activeMenu === 'panels'}
          on:click|stopPropagation={() => toggleMenu('panels')}
        >Panels ▾</button>
        {#if activeMenu === 'panels'}
          <div class="menu-dropdown" role="menu">
            <p class="menu-heading">Windows</p>
            {#each singletonPanels as def}
              <button class="menu-item" role="menuitemcheckbox" aria-checked={(openCounts[def.componentType] ?? 0) > 0} on:click={() => togglePanel(def.componentType)}>
                <span class="check">{(openCounts[def.componentType] ?? 0) > 0 ? '☑' : '☐'}</span>
                {def.title}
              </button>
            {/each}
            <button class="menu-item" role="menuitem" on:click={addTerminal}>
              <span class="check">＋</span> Add terminal
              {#if (openCounts.terminal ?? 0) > 0}<span class="badge">{openCounts.terminal}</span>{/if}
            </button>
            <p class="menu-heading">Pop out (new window)</p>
            {#each popoutPanels as def}
              <button class="menu-item" role="menuitem" on:click={() => popout(def.componentType)}>
                <span class="check">⇗</span> {def.title}
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Layouts: four predefined presets (BR-006). -->
      <div class="menu-group">
        <button
          class="menu-button"
          class:open={activeMenu === 'layouts'}
          aria-haspopup="true"
          aria-expanded={activeMenu === 'layouts'}
          on:click|stopPropagation={() => toggleMenu('layouts')}
        >Layouts ▾</button>
        {#if activeMenu === 'layouts'}
          <div class="menu-dropdown" role="menu">
            {#each LAYOUT_PRESETS as preset}
              <button class="menu-item" role="menuitem" on:click={() => applyPreset(preset.key)}>{preset.label}</button>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Services: reset/restart an individual service (BR-007). -->
      <div class="menu-group">
        <button
          class="menu-button"
          class:open={activeMenu === 'services'}
          aria-haspopup="true"
          aria-expanded={activeMenu === 'services'}
          on:click|stopPropagation={() => toggleMenu('services')}
        >Services ▾</button>
        {#if activeMenu === 'services'}
          <div class="menu-dropdown wide" role="menu">
            <p class="menu-heading">Reset a service</p>
            {#if services.length === 0}
              <p class="menu-empty">Loading services…</p>
            {/if}
            {#each services as svc}
              <div class="menu-service">
                <span class="status-dot {svc.health === 'healthy' ? 'ok' : svc.health === 'unhealthy' ? 'err' : 'warn'}"></span>
                <span class="svc-name">{svc.name}</span>
                <button class="svc-reset" disabled={serviceBusy === svc.name} on:click={() => restart(svc.name)}>
                  {serviceBusy === svc.name ? '…' : 'Reset'}
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <span class="menu-spacer"></span>
      {#if statusMsg}<span class="menu-status" role="status">{statusMsg}</span>{/if}
      {#if authEnabled}
        <button class="menu-button logout" on:click={logout}>Logout</button>
      {/if}
    </nav>
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
    align-items: center;
    gap: 0.75rem;
    padding: 0.35rem 0.9rem;
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

  .uberos-menubar {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin-left: 1rem;
    flex: 1;
  }

  .menu-group {
    position: relative;
  }

  .menu-button {
    background: transparent;
    color: var(--uberos-text);
    border: 1px solid transparent;
    border-radius: 4px;
    padding: 0.25rem 0.6rem;
    font-size: 0.82rem;
    cursor: pointer;
  }

  .menu-button:hover,
  .menu-button.open {
    background: #313244;
    border-color: #45475a;
  }

  .menu-button.logout {
    color: var(--uberos-warn);
  }

  .menu-spacer {
    flex: 1;
  }

  .menu-status {
    color: var(--uberos-muted);
    font-size: 0.78rem;
    margin-right: 0.5rem;
  }

  .menu-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    min-width: 12rem;
    background: var(--uberos-panel);
    border: 1px solid #45475a;
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
    padding: 0.3rem;
    z-index: 50;
  }

  .menu-dropdown.wide {
    min-width: 15rem;
  }

  .menu-heading {
    margin: 0.3rem 0.4rem 0.15rem;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--uberos-muted);
  }

  .menu-empty {
    margin: 0.3rem 0.4rem;
    font-size: 0.78rem;
    color: var(--uberos-muted);
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    width: 100%;
    text-align: left;
    background: transparent;
    color: var(--uberos-text);
    border: 0;
    border-radius: 4px;
    padding: 0.35rem 0.5rem;
    font-size: 0.82rem;
    cursor: pointer;
  }

  .menu-item:hover {
    background: #313244;
  }

  .menu-item .check {
    width: 1.1rem;
    display: inline-block;
    text-align: center;
  }

  .menu-item .badge {
    margin-left: auto;
    background: #45475a;
    border-radius: 999px;
    padding: 0 0.4rem;
    font-size: 0.7rem;
  }

  .menu-service {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0.5rem;
  }

  .menu-service .svc-name {
    flex: 1;
    font-size: 0.82rem;
  }

  .svc-reset {
    background: #313244;
    color: var(--uberos-text);
    border: 1px solid #45475a;
    border-radius: 4px;
    padding: 0.15rem 0.6rem;
    font-size: 0.76rem;
    cursor: pointer;
  }

  .svc-reset:hover:not(:disabled) {
    background: #45475a;
  }

  .svc-reset:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .uberos-canvas {
    position: relative;
    flex: 1;
    min-height: 0;
  }
</style>
