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
  } from './lib/panels.js';
  import { getConfig, getServices, restartService, getSettings, saveSettings } from './lib/control.js';

  const LAYOUT_KEY = 'uberos.layout.v1';
  const LAYOUT_KEYS = Object.keys(LAYOUTS);

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
  // Terminal docking affinity policy (FR-B4). When on, terminals group only
  // with terminals and every other panel stays solo; Theme C wires this to the
  // system config dialog's terminal-affinity toggle.
  let terminalAffinity = true;
  let authEnabled = false;
  let services = []; // [{ name, state, health }]
  let serviceBusy = null;
  let statusMsg = '';
  let statusTimer;

  // --- System configuration dialog (Theme C) -----------------------------
  // Settings persist server-side via the control service (FR-C2). The draft is
  // an editable copy shown in the dialog; Save validates it (FR-C3), persists
  // it, and applies live effects (terminal affinity FR-C5, theme).
  const SETTINGS_DEFAULTS = {
    defaultLayout: 'default',
    simulatorAdapter: 'Intel',
    theme: 'dark',
    terminalAffinity: true,
  };
  let showConfig = false; // dialog visibility (FR-C1)
  let authMode = 'off'; // current proxy auth mode (read-only display)
  let settings = { ...SETTINGS_DEFAULTS }; // persisted settings
  let draft = { ...SETTINGS_DEFAULTS }; // editable copy while dialog is open
  let settingsUser = 'default'; // reserved key for future per-user scoping (FR-C4)
  let configError = '';

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

  // --- Golden Layout header buttons --------------------------------------
  // Golden Layout offers no API for custom header buttons, so we inject our own
  // into each stack's control strip (.lm_controls, the right-aligned cluster
  // that also holds maximise/close). Putting them there keeps them clickable
  // and clear of the tabs. One button:
  //   +  add a terminal beside the current one (terminal stacks only, BR-003)
  // Pop-out is handled by Golden Layout's native header icon (FR-A1), not a
  // custom button.
  const ADD_BTN_CLASS = 'uberos-add-terminal';
  const COLLAPSE_BTN_CLASS = 'uberos-collapse';
  let injectScheduled = false;

  function eachStack(fn) {
    const seen = new Set();
    forEachComponent((c) => {
      const stack = c.parent;
      if (stack && !seen.has(stack)) {
        seen.add(stack);
        fn(stack);
      }
    });
  }

  function makeHeaderButton(cls, glyph, label, onClick) {
    const btn = document.createElement('button');
    btn.className = `uberos-hdr-btn ${cls}`;
    btn.type = 'button';
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.textContent = glyph;
    // Stop mousedown so Golden Layout does not treat the press as a tab drag.
    btn.addEventListener('mousedown', (e) => e.stopPropagation());
    btn.addEventListener('click', onClick);
    return btn;
  }

  function injectHeaderButtons() {
    if (!layout?.rootItem) return;
    eachStack((stack) => {
      const header = stack.element?.querySelector(':scope > .lm_header');
      const controls = header?.querySelector(':scope > .lm_controls');
      if (!controls) return;
      const items = stack.contentItems ?? [];
      const hasTerminal = items.some((ci) => ci.componentType === 'terminal');
      const terminalOnly =
        items.length > 0 &&
        items.every((ci) => ci.componentType === 'terminal');
      // With affinity on, the new-terminal + shows only on terminal-only stacks
      // (FR-B3); with affinity off, any stack containing a terminal shows it.
      const showAdd = terminalAffinity ? terminalOnly : hasTerminal;

      if (showAdd && !controls.querySelector('.' + ADD_BTN_CLASS)) {
        controls.appendChild(
          makeHeaderButton(ADD_BTN_CLASS, '＋', 'New terminal', (e) => {
            e.stopPropagation();
            const live = (stack.contentItems ?? []).find(
              (ci) => ci.componentType === 'terminal'
            );
            addTerminal(live);
          })
        );
      }

      // Every panel is collapsible to its header/tab bar (FR-F1). The control
      // hides the panel body via a CSS class and restores it to the previous
      // size on expand; the workload keeps running (the iframe stays mounted)
      // and no content is lost.
      if (!controls.querySelector('.' + COLLAPSE_BTN_CLASS)) {
        const collapsed = stack.element?.classList.contains('uberos-collapsed');
        controls.appendChild(
          makeHeaderButton(
            COLLAPSE_BTN_CLASS,
            collapsed ? '⊞' : '⊟',
            collapsed ? 'Expand panel' : 'Collapse panel',
            (e) => {
              e.stopPropagation();
              toggleCollapse(stack);
            }
          )
        );
      }
    });
  }

  // Collapse a stack to just its header/tab bar, or restore it (FR-F1). Uses a
  // CSS class so no Golden Layout size state is lost — expanding removes the
  // class and the stack returns to exactly its previous size. The panel body
  // (iframe) stays mounted, so the workload keeps running and content is kept.
  function toggleCollapse(stack) {
    const el = stack?.element;
    if (!el) return;
    const collapsed = el.classList.toggle('uberos-collapsed');
    const btn = el.querySelector(':scope > .lm_header .' + COLLAPSE_BTN_CLASS);
    if (btn) {
      btn.textContent = collapsed ? '⊞' : '⊟';
      btn.title = collapsed ? 'Expand panel' : 'Collapse panel';
      btn.setAttribute('aria-label', btn.title);
    }
    layout?.updateSize();
  }

  // Golden Layout rebuilds headers on structural changes, wiping injected
  // buttons. Re-inject on the next frame so the DOM has settled first.
  function scheduleInject() {
    if (injectScheduled) return;
    injectScheduled = true;
    requestAnimationFrame(() => {
      injectScheduled = false;
      injectHeaderButtons();
    });
  }

  // Re-enable Golden Layout's native pop-out (FR-A1): the header pop-out icon
  // MOVES the panel into its own window (the original leaves the canvas). With
  // popInOnClose, closing that window auto-docks the panel back to its origin
  // (FR-A2). The earlier blank-window bug is avoided by the sub-window guard in
  // onMount (skip loadLayout when isSubWindow, FR-A5); terminals keep their
  // shell because the tmux session id travels in component state (FR-A4).
  function withNativePopout(cfg) {
    if (cfg)
      cfg.settings = {
        ...(cfg.settings ?? {}),
        showPopoutIcon: true,
        popInOnClose: true,
      };
    return cfg;
  }

  // --- Terminal docking affinity (FR-B1..FR-B4) --------------------------
  // Golden Layout v2 has no built-in per-type drop constraint, so affinity is
  // enforced right after a drop: only terminals may share a stack (with other
  // terminals); every other panel type stays solo. When a drop creates a stack
  // that mixes types, the just-dropped item is ejected into its own sibling
  // stack, so the canvas never rests in a mixed state (BR-TD-1/BR-TD-2). The
  // moved terminal keeps its shell because the tmux session id rides in
  // component state (NFR-1). The policy is toggleable via `terminalAffinity`.
  let enforcingAffinity = false;

  // Relocate a component out of its current (violating) stack into a new
  // sibling stack, preserving its component state (e.g. a terminal session id).
  function ejectItem(item) {
    const stack = item?.parent;
    const parent = stack?.parent;
    if (!stack || !parent || typeof parent.addItem !== 'function') return;
    const resolved = item.toConfig();
    const cfg = {
      type: 'component',
      componentType: resolved.componentType ?? item.componentType,
      title: resolved.title ?? item.title,
      componentState: resolved.componentState,
    };
    const index = parent.contentItems.indexOf(stack);
    item.remove();
    parent.addItem(cfg, index < 0 ? undefined : index + 1);
  }

  // On drop, if the dropped item now sits in a type-mixed stack, move it out so
  // the affinity policy holds (FR-B1/B2). Guarded against re-entrancy.
  function enforceTerminalAffinity(item) {
    if (!terminalAffinity || enforcingAffinity || !item) return;
    const items = item.parent?.contentItems ?? [];
    if (items.length < 2) return;
    const conflict =
      item.componentType === 'terminal'
        ? items.some((ci) => ci.componentType !== 'terminal')
        : items.some((ci) => ci !== item); // non-terminals must stay solo
    if (!conflict) return;
    enforcingAffinity = true;
    try {
      ejectItem(item);
    } finally {
      enforcingAffinity = false;
      scheduleInject();
    }
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
  // Focusing an existing terminal first makes Golden Layout dock the new tab
  // into that terminal's stack (FocusedItem is GL's first add-location
  // selector), so it appears next to the current one rather than at random.
  function addTerminal(nearItem) {
    const target = nearItem ?? firstComponent('terminal');
    target?.focus?.();
    const n = (openCounts.terminal ?? 0) + 1;
    // Give the terminal a stable tmux session id so it keeps its shell/history
    // when popped out, docked, or reloaded (see terminalSession in panels.js).
    const session = 't' + Math.random().toString(36).slice(2, 10);
    layout.addComponent('terminal', { session }, `Terminal ${n}`);
    refreshOpenPanels();
    flash(`Added Terminal ${n}`);
    closeMenu();
  }

  // Apply one of the four predefined layouts (BR-006).
  function applyPreset(key) {
    const preset = LAYOUTS[key];
    if (!preset) return;
    layout.loadLayout(withNativePopout(JSON.parse(JSON.stringify(preset))));
    refreshOpenPanels();
    closeMenu();
  }

  // Pop a panel out using Golden Layout's native pop-out, which MOVES the panel
  // into its own window (the original leaves the canvas, FR-A1) and docks it
  // back when the window closes (FR-A2). Live content is preserved — a terminal
  // reconnects to the same tmux session carried in its component state (FR-A4).
  function popout(type) {
    firstComponent(type)?.popout?.();
    closeMenu();
  }

  // Apply the selected theme by toggling a data-theme attribute the global CSS
  // keys off (dark is the default palette; light overrides the CSS variables).
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
  }

  // Load persisted settings at boot and apply their live effects (FR-C2/FR-C5).
  async function loadSettings() {
    const store = await getSettings();
    settingsUser = store.user ?? 'default';
    settings = { ...SETTINGS_DEFAULTS, ...(store.settings ?? {}) };
    terminalAffinity = settings.terminalAffinity; // FR-C5: real end-to-end effect
    applyTheme(settings.theme);
    scheduleInject();
  }

  function openConfig() {
    draft = { ...settings };
    configError = '';
    showConfig = true;
    closeMenu();
  }

  function closeConfig() {
    showConfig = false;
  }

  // Validate the draft before saving (FR-C3). Server-side validation is the
  // source of truth; this gives immediate, friendly feedback.
  function validateDraft() {
    if (!LAYOUT_KEYS.includes(draft.defaultLayout)) return 'Pick a valid default layout.';
    if (!['dark', 'light'].includes(draft.theme)) return 'Pick a valid theme.';
    if ((draft.simulatorAdapter ?? '').trim().length > 64)
      return 'Simulator adapter name is too long (max 64 chars).';
    return '';
  }

  async function saveConfig() {
    const err = validateDraft();
    if (err) {
      configError = err;
      return;
    }
    const next = {
      defaultLayout: draft.defaultLayout,
      simulatorAdapter: (draft.simulatorAdapter ?? '').trim(),
      theme: draft.theme,
      terminalAffinity: !!draft.terminalAffinity,
    };
    try {
      const store = await saveSettings(next, settingsUser);
      settings = { ...SETTINGS_DEFAULTS, ...(store.settings ?? next) };
      flash('Configuration saved');
    } catch {
      // Control plane unreachable: keep the values locally so the UI still
      // reflects the change this session; they just won't survive a restart.
      settings = { ...next };
      flash('Saved locally; server persistence failed');
    }
    terminalAffinity = settings.terminalAffinity; // FR-C5
    applyTheme(settings.theme);
    scheduleInject();
    showConfig = false;
  }

  // Reset the draft to built-in defaults (FR-C6); Save persists them.
  function resetConfig() {
    draft = { ...SETTINGS_DEFAULTS };
    configError = '';
  }

  // Apply the chosen default layout to the canvas immediately for a visible
  // effect (it also persists on Save and seeds the next fresh load).
  function applyDefaultLayout() {
    applyPreset(draft.defaultLayout);
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
        build(componentContainer.element, componentContainer);
      });
    }

    // A popped-out panel loads this same app in a subwindow. Golden Layout
    // auto-loads the popped component's config there, so we must NOT restore
    // the saved/default layout (that would clobber the pop-out, BR-002) nor
    // persist its state back over the main window (S5).
    const isSub = layout.isSubWindow;
    if (isSub) document.body.classList.add('uberos-subwindow');

    if (!isSub) {
      const saved = loadSavedLayout();
      try {
        layout.loadLayout(withNativePopout(saved ?? defaultLayout));
      } catch {
        // A corrupt saved layout can throw during resolution; drop it and fall
        // back to the default so the user always sees their panels.
        clearSavedLayout();
        layout.loadLayout(withNativePopout(defaultLayout));
      }
    }
    refreshOpenPanels();
    scheduleInject();

    // Persist layout changes and keep the menu's open/closed state in sync.
    layout.on('stateChanged', () => {
      if (!isSub) saveLayout(layout);
      refreshOpenPanels();
      scheduleInject();
    });

    // Notify other windows when a panel pops out (multi-screen use, J3).
    layout.on('itemCreated', (item) => {
      channel?.postMessage({ type: 'panel-created', panel: item.target?.type });
      scheduleInject();
    });

    // Enforce terminal docking affinity after a drop (FR-B1/B2). GL v2 has no
    // native per-type drop constraint, so mixed stacks are corrected post-drop.
    layout.on('itemDropped', (item) => enforceTerminalAffinity(item));

    // Discover whether auth is enabled (controls Logout visibility) and the
    // set of services the menu may reset.
    getConfig().then((cfg) => {
      authMode = cfg.auth ?? 'off';
      authEnabled = cfg.auth && cfg.auth !== 'off' && cfg.auth !== 'none';
    });

    // Load persisted system settings and apply their effects (Theme C). Skip in
    // pop-out sub-windows, which only render a single detached panel.
    if (!isSub) loadSettings();

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
    <span class="brand">UbeROS</span>
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

      <!-- Configuration: open the system settings dialog (FR-C1). -->
      <button
        class="menu-button"
        class:open={showConfig}
        on:click|stopPropagation={openConfig}
      >Configuration</button>

      <span class="menu-spacer"></span>
      {#if statusMsg}<span class="menu-status" role="status">{statusMsg}</span>{/if}
      {#if authEnabled}
        <button class="menu-button logout" on:click={logout}>Logout</button>
      {/if}
    </nav>
  </header>
  <div class="uberos-canvas" bind:this={container}></div>

  <!-- System configuration dialog (Theme C, FR-C1..FR-C6). -->
  {#if showConfig}
    <div class="uberos-modal-backdrop" role="presentation" on:click|self={closeConfig}>
      <div class="uberos-modal" role="dialog" aria-modal="true" aria-label="System configuration">
        <header class="modal-head">
          <h2>System configuration</h2>
          <button class="modal-close" aria-label="Close" on:click={closeConfig}>✕</button>
        </header>
        <div class="modal-body">
          <p class="modal-group">Workspace</p>
          <label class="cfg-row">
            <span class="cfg-label">Default layout</span>
            <span class="cfg-control">
              <select bind:value={draft.defaultLayout}>
                {#each LAYOUT_PRESETS as preset}
                  <option value={preset.key}>{preset.label}</option>
                {/each}
              </select>
              <button class="cfg-apply" type="button" on:click={applyDefaultLayout}>Apply now</button>
            </span>
          </label>
          <label class="cfg-row">
            <span class="cfg-label">Theme</span>
            <select bind:value={draft.theme}>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </label>

          <p class="modal-group">Docking</p>
          <label class="cfg-row cfg-check">
            <input type="checkbox" bind:checked={draft.terminalAffinity} />
            <span class="cfg-label">Terminal docking affinity — terminals group only with terminals</span>
          </label>

          <p class="modal-group">Simulator</p>
          <label class="cfg-row">
            <span class="cfg-label">GPU adapter (WSL)</span>
            <input type="text" bind:value={draft.simulatorAdapter} maxlength="64" placeholder="Intel" />
          </label>
          <p class="cfg-hint">Applied at container start via <code>UBEROS_WSL_ADAPTER</code>; restart the simulator to take effect.</p>

          <p class="modal-group">Security</p>
          <div class="cfg-row">
            <span class="cfg-label">Proxy auth mode</span>
            <span class="cfg-readonly">{authMode}</span>
          </div>

          {#if configError}<p class="cfg-error" role="alert">{configError}</p>{/if}
        </div>
        <footer class="modal-foot">
          <button class="btn-reset" type="button" on:click={resetConfig}>Reset to defaults</button>
          <span class="foot-spacer"></span>
          <button class="btn-cancel" type="button" on:click={closeConfig}>Cancel</button>
          <button class="btn-save" type="button" on:click={saveConfig}>Save</button>
        </footer>
      </div>
    </div>
  {/if}
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

  /* System configuration dialog (Theme C). */
  .uberos-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .uberos-modal {
    width: min(30rem, calc(100vw - 2rem));
    max-height: calc(100vh - 2rem);
    display: flex;
    flex-direction: column;
    background: var(--uberos-panel);
    border: 1px solid #45475a;
    border-radius: 8px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
    overflow: hidden;
  }

  .modal-head {
    display: flex;
    align-items: center;
    padding: 0.6rem 0.9rem;
    border-bottom: 1px solid #313244;
  }

  .modal-head h2 {
    margin: 0;
    font-size: 0.95rem;
    flex: 1;
  }

  .modal-close {
    background: transparent;
    border: 0;
    color: var(--uberos-muted);
    font-size: 1rem;
    cursor: pointer;
  }

  .modal-close:hover {
    color: var(--uberos-text);
  }

  .modal-body {
    padding: 0.5rem 0.9rem 0.9rem;
    overflow: auto;
  }

  .modal-group {
    margin: 0.8rem 0 0.3rem;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--uberos-muted);
  }

  .cfg-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.3rem 0;
    font-size: 0.83rem;
  }

  .cfg-label {
    flex: 1;
  }

  .cfg-check {
    align-items: flex-start;
  }

  .cfg-control {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .uberos-modal select,
  .uberos-modal input[type='text'] {
    background: var(--uberos-bg);
    color: var(--uberos-text);
    border: 1px solid #45475a;
    border-radius: 4px;
    padding: 0.2rem 0.4rem;
    font-size: 0.82rem;
  }

  .cfg-apply {
    background: #313244;
    color: var(--uberos-text);
    border: 1px solid #45475a;
    border-radius: 4px;
    padding: 0.15rem 0.5rem;
    font-size: 0.76rem;
    cursor: pointer;
  }

  .cfg-apply:hover {
    background: #45475a;
  }

  .cfg-readonly {
    color: var(--uberos-muted);
    font-family: "Cascadia Code", "Consolas", monospace;
  }

  .cfg-hint {
    margin: 0.2rem 0 0;
    font-size: 0.72rem;
    color: var(--uberos-muted);
  }

  .cfg-hint code {
    font-size: 0.7rem;
  }

  .cfg-error {
    margin: 0.5rem 0 0;
    color: var(--uberos-err);
    font-size: 0.78rem;
  }

  .modal-foot {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 0.9rem;
    border-top: 1px solid #313244;
  }

  .foot-spacer {
    flex: 1;
  }

  .btn-reset,
  .btn-cancel,
  .btn-save {
    border-radius: 4px;
    padding: 0.3rem 0.8rem;
    font-size: 0.8rem;
    cursor: pointer;
    border: 1px solid #45475a;
  }

  .btn-reset {
    background: transparent;
    color: var(--uberos-warn);
  }

  .btn-cancel {
    background: transparent;
    color: var(--uberos-text);
  }

  .btn-save {
    background: var(--uberos-accent);
    color: #11111b;
    border-color: var(--uberos-accent);
    font-weight: 600;
  }

  .btn-reset:hover,
  .btn-cancel:hover {
    background: #313244;
  }
</style>
