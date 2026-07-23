// UbeROS gzweb 3D client (PRD Theme F, FR-F3).
//
// WHAT THIS IS
// A minimal single-page client that RENDERS the headless Gazebo simulation in
// the browser using the gazebo-web `gzweb` SceneManager. The scene state
// (models, lights, poses) is streamed as protobuf over a WebSocket from the
// gz-launch WebsocketServer and reconstructed client-side with Three.js — no
// server GL, no VNC, no pixel scraping. This replaces the earlier handshake-
// only readout: SceneManager owns the protobuf decode (protobufjs), the scene
// graph, and the render loop.
//
// PROXY WIRING (unchanged, INV-04)
// The WebSocket endpoint is config-injected via window.GZWEB_WS_URL and defaults
// to the SAME-ORIGIN /gzweb/ws/ path, so the client always talks THROUGH the
// single proxy. config.js (imported below for its side effects) derives that
// URL from the page origin; it must run before SceneManager reads the global.
//
// HOW SceneManager IS DRIVEN (see gazebo-web/gzweb)
//   - `new SceneManager({ elementId, websocketUrl })` would auto-connect, but we
//     construct WITHOUT a url and call connect() ourselves so we can RETRY while
//     the on-demand gazebo container is down (the socket 502s until it is up).
//   - on 'connected' SceneManager mounts its Three.js <canvas> into #scene;
//   - on 'ready' it auto-requests worlds/scene/protos, subscribes to the pose +
//     scene topics, and runs its own requestAnimationFrame loop.
// We layer a lightweight status overlay, reconnect, and resize handling on top.

import './config.js';
import { SceneManager } from 'gzweb';

const WS_URL = window.GZWEB_WS_URL;

const dot = document.getElementById('dot');
const stateEl = document.getElementById('state');
const metaEl = document.getElementById('meta');
const sceneEl = document.getElementById('scene');

function setState(text, cls) {
  stateEl.textContent = text;
  dot.className = 'dot' + (cls ? ' ' + cls : '');
}

// Construct without a websocketUrl so nothing connects until connect() below;
// this lets us reconnect on our own schedule while gazebo is starting up.
const sceneManager = new SceneManager({ elementId: 'scene' });

let lastAttempt = 0;
let reconnectTimer = null;

function connect() {
  lastAttempt = Date.now();
  setState('connecting…', '');
  try {
    sceneManager.connect(WS_URL);
  } catch (e) {
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(function () {
    reconnectTimer = null;
    // Drop the previous canvas + subscriptions before reconnecting so a fresh
    // connect() re-mounts a single renderer (disconnect() removes the canvas).
    try {
      sceneManager.disconnect();
    } catch (e) {
      /* ignore — nothing to clean up on the first attempt */
    }
    connect();
  }, 2000);
}

// Poll the SceneManager connection status once per second to drive the overlay
// and trigger reconnects (gazebo is on-demand; the socket 502s until it is up).
setInterval(function () {
  const status = sceneManager.getConnectionStatus();
  if (status === 'ready' || status === 'connected') {
    setState('connected', 'ok');
    const n = sceneManager.getModels().length;
    metaEl.textContent = n + (n === 1 ? ' model' : ' models');
  } else if (Date.now() - lastAttempt < 2500) {
    // Give the in-flight attempt time to complete before reporting failure.
    setState('connecting…', '');
  } else {
    setState('disconnected — retrying…', 'err');
    metaEl.textContent = '';
    scheduleReconnect();
  }
}, 1000);

// Keep the Three.js renderer sized to the panel. Golden Layout resizes the
// iframe on drag/dock, and the initial layout may settle after first paint.
if (window.ResizeObserver) {
  new ResizeObserver(function () {
    sceneManager.resize();
  }).observe(sceneEl);
}
window.addEventListener('resize', function () {
  sceneManager.resize();
});

connect();
