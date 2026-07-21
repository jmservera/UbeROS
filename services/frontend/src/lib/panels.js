import ROSLIB from 'roslib';
import { onRosStatus, startRos } from './ros.js';

// Panel content builders for the Golden Layout window manager.
// Each builder receives the panel's root HTML element and populates it.
// The simulator, terminal, and editor panels are iframes routed through the
// single proxy origin (I-05, I-12). The ROS status panel uses the shared
// rosbridge connection.

// Resolve a proxy-relative path to an absolute same-origin URL. Golden Layout
// pop-out windows start life as about:blank, so a root-relative iframe src like
// "/terminal/" has no origin to resolve against and renders empty (BR-002). An
// absolute URL renders live content whether the panel lives in the main canvas
// or a popped-out window.
function absoluteUrl(path) {
  return new URL(path, window.location.origin).href;
}

function makeIframe(src) {
  const frame = document.createElement('iframe');
  frame.className = 'panel-frame';
  frame.src = absoluteUrl(src);
  // No sandbox attribute: same-origin routing keeps code-server and noVNC
  // working (research RISK-8). allow clipboard for editor/terminal ergonomics.
  frame.setAttribute('allow', 'clipboard-read; clipboard-write');
  return frame;
}

// Panel registry (BR-001, BR-005, BR-009). Data-driven so the system menu can
// list, hide/show, reopen, and pop out panels without hard-coding each type,
// and so future panels plug in by adding an entry here.
export const PANEL_DEFS = {
  simulator: {
    componentType: 'simulator',
    title: 'Simulator',
    // Gazebo now streams SCENE STATE to the self-hosted gzweb client (Theme F);
    // the retired noVNC pixel stream is gone. The client connects to the
    // WebsocketServer through the proxy at /gzweb/ws/ (see the gazebo registry
    // entry's panelRoute + transport `gzweb`).
    url: '/gzweb/',
    popout: true,
    singleton: true,
  },
  terminal: {
    componentType: 'terminal',
    title: 'Terminal',
    url: '/terminal/',
    popout: true,
    singleton: false, // operators can spawn many independent PTYs (BR-003).
  },
  editor: {
    componentType: 'editor',
    title: 'Code Editor',
    url: '/editor/',
    popout: true,
    singleton: true,
  },
  'ros-status': {
    componentType: 'ros-status',
    title: 'ROS Status',
    // Native pop-out serializes the component config and rebuilds it via the
    // factory in the child window, so the non-iframe ROS Status panel pops out
    // and re-docks like the rest (FR-A3).
    popout: true,
    singleton: true,
  },
};

export function buildSimulatorPanel(el) {
  // gzweb scene-state client served under /gzweb/ (Theme F). Same-origin iframe
  // through the single proxy; the client opens the /gzweb/ws/ WebSocket itself.
  el.appendChild(makeIframe(PANEL_DEFS.simulator.url));
}

// --- Data-driven simulator panels (FR-A3) ------------------------------
// A simulator registry entry (from GET /control/simulators) maps to a Golden
// Layout panel whose stream URL is chosen by transport: `vnc` → noVNC iframe,
// `gzweb` → gzweb websocket client. Both are served under the entry's
// panelRoute through the single proxy origin, so the SPA needs no per-simulator
// code — adding a registry entry is enough to render its panel (NFR-MAINT-1).
const SIMULATOR_TRANSPORTS = {
  vnc: (route) => `${route}vnc.html?autoconnect=true&resize=scale`,
  gzweb: (route) => route,
};

// Resolve a registry entry to the absolute-safe, transport-specific stream path
// (still proxy-relative; makeIframe/absoluteUrl finalize the origin).
export function simulatorStreamUrl(entry) {
  const resolve = SIMULATOR_TRANSPORTS[entry?.transport];
  return resolve ? resolve(entry.panelRoute) : entry?.panelRoute;
}

// Build a Golden Layout panel definition from a simulator registry entry. The
// component type is namespaced (`sim:<id>`) so multiple simulators coexist
// without colliding with the built-in panels, and the launch wiring (Theme B)
// can register a factory per entry from this same shape.
export function simulatorPanelDef(entry) {
  return {
    componentType: `sim:${entry.id}`,
    title: entry.label,
    url: simulatorStreamUrl(entry),
    transport: entry.transport,
    popout: true,
    singleton: true,
  };
}

// Panel content builder for a data-driven simulator panel: an iframe to the
// entry's transport-resolved stream, routed through the single proxy origin.
export function buildSimulatorPanelForEntry(el, entry) {
  el.appendChild(makeIframe(simulatorStreamUrl(entry)));
}

// Resolve a stable tmux session id for a terminal panel and persist it in the
// Golden Layout component state. The id travels with the panel across docking,
// saved layouts, and pop-outs, so the /terminal/?arg=<id> connection always
// reattaches the same shell (preserving scrollback and running processes).
function terminalSession(container) {
  const existing = container?.initialState?.session;
  if (existing) return existing;
  const session = 't' + Math.random().toString(36).slice(2, 10);
  try {
    container?.setState?.({ ...(container.initialState ?? {}), session });
  } catch {
    /* setState may be unavailable in some contexts; the URL id still works. */
  }
  return session;
}

export function buildTerminalPanel(el, container) {
  const session = terminalSession(container);
  el.appendChild(
    makeIframe(`${PANEL_DEFS.terminal.url}?arg=${encodeURIComponent(session)}`)
  );
}

export function buildEditorPanel(el) {
  el.appendChild(makeIframe(PANEL_DEFS.editor.url));
}

// Returns a cleanup function that removes the onRosStatus listener and
// unsubscribes the active /rosout topic. The caller (GL unbind handler) must
// invoke it when the panel is torn down — e.g. on pop-out or dock-back — to
// prevent listener/subscription accumulation across rebuilds (FR-A3).
export function buildRosStatusPanel(el) {
  const body = document.createElement('div');
  body.className = 'panel-body';

  const header = document.createElement('div');
  header.innerHTML =
    '<span class="status-dot warn"></span><strong>ROS bridge</strong>: <span id="ros-state">connecting…</span>';

  const nodesTitle = document.createElement('p');
  nodesTitle.innerHTML = '<strong>Nodes</strong>';
  const nodesList = document.createElement('pre');
  nodesList.className = 'log-line';
  nodesList.textContent = '(waiting for connection)';

  const logTitle = document.createElement('p');
  logTitle.innerHTML = '<strong>/rosout</strong> (last lines)';
  const logView = document.createElement('div');

  body.append(header, nodesTitle, nodesList, logTitle, logView);
  el.appendChild(body);

  startRos();

  const dot = header.querySelector('.status-dot');
  const stateText = header.querySelector('#ros-state');
  const logLines = [];

  // Track the active /rosout subscription so we can unsubscribe it when the
  // connection drops and reconnects, and when the panel is destroyed.
  let currentRosout = null;

  const unsubStatus = onRosStatus(({ status, ros }) => {
    stateText.textContent = status;
    dot.className = 'status-dot ' + (status === 'connected' ? 'ok' : status === 'error' || status === 'closed' ? 'err' : 'warn');

    if (status === 'connected' && ros) {
      // Drop any previous /rosout subscription before creating a new one to
      // avoid duplicate message handlers when the bridge reconnects.
      if (currentRosout) {
        currentRosout.unsubscribe();
        currentRosout = null;
      }

      ros.getNodes(
        (nodes) => {
          nodesList.textContent = nodes.length ? nodes.join('\n') : '(none)';
        },
        () => {
          nodesList.textContent = '(node query failed)';
        }
      );

      const rosout = new ROSLIB.Topic({
        ros,
        name: '/rosout',
        messageType: 'rcl_interfaces/msg/Log',
      });
      rosout.subscribe((msg) => {
        logLines.push(`[${msg.name || '?'}] ${msg.msg || ''}`);
        while (logLines.length > 20) logLines.shift();
        logView.innerHTML = logLines
          .map((l) => `<p class="log-line">${escapeHtml(l)}</p>`)
          .join('');
      });
      currentRosout = rosout;
    }
  });

  return () => {
    unsubStatus();
    if (currentRosout) {
      currentRosout.unsubscribe();
      currentRosout = null;
    }
  };
}

// Small helpers -----------------------------------------------------------

function escapeHtml(s) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
}

function comp(type, width) {
  const def = PANEL_DEFS[type];
  const node = { type: 'component', componentType: type, title: def.title };
  if (width) node.width = width;
  return node;
}

// Four predefined layouts the operator can apply from the menu (BR-006):
// default (four equal), simulator enlarged, code editor enlarged, terminal
// enlarged. Each preset is a full Golden Layout config passed to loadLayout().
export const LAYOUTS = {
  default: {
    root: {
      type: 'row',
      content: [
        {
          type: 'column',
          width: 50,
          content: [comp('simulator'), comp('terminal')],
        },
        {
          type: 'column',
          width: 50,
          content: [comp('editor'), comp('ros-status')],
        },
      ],
    },
  },
  simulator: {
    root: {
      type: 'row',
      content: [
        comp('simulator', 70),
        {
          type: 'column',
          width: 30,
          content: [comp('editor'), comp('terminal'), comp('ros-status')],
        },
      ],
    },
  },
  editor: {
    root: {
      type: 'row',
      content: [
        comp('editor', 70),
        {
          type: 'column',
          width: 30,
          content: [comp('simulator'), comp('terminal'), comp('ros-status')],
        },
      ],
    },
  },
  terminal: {
    root: {
      type: 'row',
      content: [
        comp('terminal', 70),
        {
          type: 'column',
          width: 30,
          content: [comp('simulator'), comp('editor'), comp('ros-status')],
        },
      ],
    },
  },
};

// Menu-facing preset list (BR-006).
export const LAYOUT_PRESETS = [
  { key: 'default', label: 'Default — four equal panels' },
  { key: 'simulator', label: 'Simulator enlarged' },
  { key: 'editor', label: 'Code editor enlarged' },
  { key: 'terminal', label: 'Terminal enlarged' },
];

// Default first-launch layout: four equal panels (F-16, BR-006).
export const defaultLayout = LAYOUTS.default;
