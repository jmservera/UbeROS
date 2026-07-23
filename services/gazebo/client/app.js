// UbeROS minimal gzweb client (PRD Theme F, FR-F2/FR-F3).
//
// WHAT THIS IS
// A dependency-free, self-hosted client that connects to the Gazebo
// gz-launch WebsocketServer THROUGH THE PROXY (window.GZWEB_WS_URL, default the
// same-origin /gzweb/ws/) and drives the documented handshake: request the
// world list + scene, then subscribe to the pose stream. It proves the
// scene-state path works end to end and renders a live status + frame readout
// inside the Golden Layout panel iframe.
//
// PROTOCOL (from gz-launch WebsocketServer.hh)
// Every message — request and response — is a single frame whose first three
// comma-separated fields are text and whose remainder is a serialized protobuf
// gz.msgs payload:
//     operation , topic_name , message_type , <protobuf bytes>
// Requests used here: `worlds`, `scene`, `sub` (subscribe to a topic). Responses
// arrive as binary frames; this client parses the TEXT header (op/topic/type)
// and counts throughput. It intentionally does NOT decode the protobuf payload.
//
// FOLLOW-UP (NOT DONE HERE — offline/no-bundler constraint)
// Full 3D rendering requires two libraries this static, build-less page cannot
// fetch offline: `protobufjs` (to decode the payloads returned by the `protos`
// op) and `three` (to draw the scene). The maintained way to get both plus the
// scene reconstruction logic is the `gazebo-web/gzweb` NPM library (`SceneManager`).
// To finish FR-F3 rendering, a follow-up must:
//   1. Add a small build step (or vendored bundle) that ships `gzweb` +
//      `three` + `protobufjs` as static assets served under /gzweb/.
//   2. Instantiate gzweb `SceneManager`, point it at window.GZWEB_WS_URL, and
//      mount its Three.js canvas into #scene (replacing the placeholder text).
//   3. Request `protos` on connect and hand frames to SceneManager for decode.
// The connection/handshake/proxy wiring below is reusable as-is by that work.

(function () {
  'use strict';

  var WS_URL = window.GZWEB_WS_URL;
  var WORLD = window.GZWEB_WORLD || 'uberos_default';

  var dot = document.getElementById('dot');
  var stateEl = document.getElementById('state');
  var streamStatusEl = document.getElementById('stream-status');
  var rateEl = document.getElementById('rate');
  var countEl = document.getElementById('count');
  var framesEl = document.getElementById('frames');

  var total = 0;
  var windowCount = 0;
  var lastFrames = [];
  var ws = null;
  var reconnectTimer = null;

  function setState(text, cls) {
    stateEl.textContent = text;
    if (streamStatusEl) streamStatusEl.textContent = text;
    dot.className = 'dot' + (cls ? ' ' + cls : '');
  }

  // Build a WebsocketServer request frame: "op,topic,type," + optional payload.
  function frame(op, topic, type) {
    return op + ',' + (topic || '') + ',' + (type || '') + ',';
  }

  // Parse the comma-separated text header from an incoming frame. The payload
  // after the 3rd comma is opaque protobuf and is left undecoded.
  function parseHeader(text) {
    var parts = [];
    var start = 0;
    for (var i = 0; i < text.length && parts.length < 3; i++) {
      if (text.charCodeAt(i) === 44 /* comma */) {
        parts.push(text.slice(start, i));
        start = i + 1;
      }
    }
    return { op: parts[0] || '', topic: parts[1] || '', type: parts[2] || '' };
  }

  function logFrame(h) {
    var label = h.op + (h.topic ? ' ' + h.topic : '') + (h.type ? ' [' + h.type + ']' : '');
    lastFrames.unshift(label);
    if (lastFrames.length > 40) lastFrames.pop();
    framesEl.textContent = lastFrames.join('\n');
  }

  function onOpen() {
    setState('connected', 'ok');
    // Documented handshake: enumerate worlds, request the scene graph, and
    // subscribe to the pose stream so live scene-state frames flow.
    send(frame('worlds'));
    send(frame('scene', WORLD));
    send(frame('sub', '/world/' + WORLD + '/pose/info'));
    send(frame('sub', '/world/' + WORLD + '/dynamic_pose/info'));
  }

  function send(f) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(f);
  }

  function onMessage(ev) {
    total++;
    windowCount++;
    countEl.textContent = String(total);

    var data = ev.data;
    if (data instanceof ArrayBuffer) {
      // Decode only the leading bytes needed for the text header (payload may be
      // large binary protobuf; avoid decoding the whole blob every frame).
      var head = new Uint8Array(data, 0, Math.min(data.byteLength, 256));
      logFrame(parseHeader(bytesToLatin1(head)));
    } else if (typeof data === 'string') {
      logFrame(parseHeader(data));
    }
  }

  function bytesToLatin1(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return s;
  }

  function onCloseOrError() {
    setState('disconnected — retrying…', 'err');
    scheduleReconnect();
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      connect();
    }, 2000);
  }

  function connect() {
    setState('connecting…', '');
    try {
      ws = new WebSocket(WS_URL);
      ws.binaryType = 'arraybuffer';
      ws.onopen = onOpen;
      ws.onmessage = onMessage;
      ws.onclose = onCloseOrError;
      ws.onerror = onCloseOrError;
    } catch (e) {
      onCloseOrError();
    }
  }

  // Live throughput meter (messages/second), sampled once per second.
  setInterval(function () {
    rateEl.textContent = String(windowCount);
    windowCount = 0;
  }, 1000);

  connect();
})();
