// UbeROS gzweb client configuration (PRD Theme F, FR-F2).
//
// The WebSocket URL is CONFIG-INJECTED (not hard-coded to :9002) so the client
// always connects through the single proxy origin. By default it resolves to
// the SAME ORIGIN as the page at the `/gzweb/ws/` path, which nginx proxy_passes
// to the gazebo container's WebsocketServer (gazebo:9002). This keeps the client
// working unchanged behind the proxy whether served over ws:// or wss:// — the
// scheme is derived from the page protocol.
//
// To point the client at a different endpoint (e.g. a remote Gazebo during
// development), override window.GZWEB_WS_URL before app.js runs, or replace this
// file at deploy time. Do NOT hard-code host:port here — that would bypass the
// proxy (INV-04).
(function () {
  var scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  window.GZWEB_WS_URL =
    window.GZWEB_WS_URL ||
    scheme + '//' + window.location.host + '/gzweb/ws/';

  // Default world name used for the initial scene request + pose subscription.
  // Matches simulation/worlds/uberos_default.sdf (<world name="uberos_default">).
  window.GZWEB_WORLD = window.GZWEB_WORLD || 'uberos_default';
})();
