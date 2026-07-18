---
title: Apache Guacamole vs. noVNC for the UberOS Simulator Stream
description: Research-only comparison of Apache Guacamole and noVNC for streaming the Gazebo simulator GUI, focused on streaming performance and smoothness including GPU impact.
author: jmservera
ms.date: 07/18/2026
ms.topic: concept
---

# Apache Guacamole vs. noVNC for the UberOS Simulator Stream

> **Note:** This document fulfills business requirement [BR-011][brd] and is **research-only**. Implementation is explicitly out of scope. Any adoption of Apache Guacamole is deferred to a separately approved future improvement.

## Table of Contents

- [Summary and Recommendation](#summary-and-recommendation)
- [How the Current noVNC Path Works](#how-the-current-novnc-path-works)
- [How Guacamole Would Work](#how-guacamole-would-work)
- [Comparison](#comparison)
- [GPU Impact](#gpu-impact)
- [Recommendation and Rationale](#recommendation-and-rationale)
- [References](#references)

## Summary and Recommendation

For the current UberOS Init topology, **keep noVNC** as the simulator GUI transport. noVNC fits the single-Nginx-ingress invariant (INV-04) with a thin `x11vnc → websockify` sidecar that shares the simulator network namespace, adds no servlet container or extra stateful daemon, and streams the software-rendered Gazebo framebuffer acceptably over a WebSocket.[^novnc-repo][^proxy-conf] Apache Guacamole can deliver smoother interaction for full desktops through richer RDP codecs, but its advantage depends on a codec-capable remote-desktop server (RDP), not on the VNC path UberOS uses today, and it introduces a `guacd` daemon plus a Java web application that add architecture and maintenance weight without changing the fundamental limit: neither client performs server-side GPU **video** encoding of the Gazebo stream in the current design.[^guac-arch][^rfb] Guacamole remains a credible **future improvement** only if UberOS later needs multi-desktop gateway features or an RDP-based, hardware-encoded pipeline; that decision should be made and approved separately.

## How the Current noVNC Path Works

UberOS streams the simulator GUI through a minimal VNC-over-WebSocket chain that stays entirely behind the single reverse proxy (INV-04, WP-13):[^proxy-conf][^vnc-entry]

1. The **simulator** service runs Gazebo against an `Xvfb` virtual framebuffer on display `:99`, using software rendering (Mesa) by default and exposing the X11 socket through the shared `x11-socket` volume.[^compose]
2. The **vnc** sidecar joins the simulator's network namespace (`network_mode: service:simulator`) and mounts the same X11 socket. `openbox` maps and maximizes the Gazebo Qt window so it fills the framebuffer, and `x11vnc` exports display `:99` on `localhost:5900`.[^vnc-entry]
3. `websockify` serves the noVNC static client and bridges the browser WebSocket on `:6080` to the VNC TCP socket on `:5900`.[^vnc-entry][^novnc-repo]
4. Nginx proxies `/novnc` to `simulator:6080`, upgrading the connection to a WebSocket and disabling response buffering (`proxy_buffering off`) so frames are not held back.[^proxy-conf]
5. The frontend SPA embeds the noVNC client in an iframe panel, sharing the single proxy origin with the other panels (I-12).[^brd]

The wire protocol is standard RFB (VNC). `x11vnc` negotiates encodings such as Tight, ZRLE, and hextile; it does **not** implement a hardware video codec. Frame updates are region-based image deltas, compressed with zlib/JPEG (Tight), so smoothness degrades when large screen regions change every frame — for example, a continuously animating 3D scene or a fast camera orbit.[^rfb][^novnc-repo]

## How Guacamole Would Work

Apache Guacamole is a clientless remote-desktop **gateway** rather than a single VNC bridge. Its architecture has three moving parts:[^guac-arch]

- **Guacamole client** — JavaScript served to the browser. It speaks only the *Guacamole protocol* (a remote-display and event-transport protocol), not RDP or VNC directly.[^guac-arch]
- **Web application** — a Java servlet application (typically deployed in Apache Tomcat) that serves the client, handles authentication, and tunnels the Guacamole protocol between the browser (over WebSocket or an HTTP fallback) and `guacd`.[^guac-arch]
- **guacd** — a native daemon that dynamically loads protocol *client plugins* (RDP, VNC, SSH, Telnet, Kubernetes) and translates between the remote-desktop protocol and the Guacamole protocol.[^guac-arch]

To reuse the existing UberOS display, Guacamole would connect through its **VNC client plugin** to the same `x11vnc` server on `:5900`. In that configuration the codec ceiling is identical to noVNC's — it is still RFB image deltas from `x11vnc`, now translated an extra hop through `guacd` into the Guacamole protocol.[^guac-arch][^rfb] Guacamole's genuine smoothness advantage appears only with its **RDP** plugin, which requires an RDP server (for example `xrdp`) in front of the simulator display and can use richer RDP codecs. That is a materially larger change than the current sidecar: an added RDP server, the `guacd` daemon, a Tomcat/Java web application, and a Guacamole authentication and connection store.[^guac-arch]

## Comparison

The table below compares the two options for the UberOS use case: streaming a single software-rendered Gazebo GUI to a browser panel behind one Nginx proxy.

| Dimension | noVNC (current) | Apache Guacamole |
|-----------|-----------------|------------------|
| Streaming smoothness / latency | Good for mostly-static or slowly-changing scenes; image-delta encoding stutters on full-frame 3D motion.[^rfb] | Same as noVNC when using the VNC plugin against `x11vnc`; smoother only with an added RDP server and RDP codecs.[^guac-arch] |
| Protocol / codec efficiency | RFB with Tight/ZRLE/hextile; JPEG and (client-side) H.264 decode are supported by noVNC, but `x11vnc` does not emit H.264.[^novnc-repo][^rfb] | Guacamole protocol over WebSocket; efficiency of the *underlying* stream is bounded by the chosen plugin (VNC = same as noVNC; RDP = richer codecs).[^guac-arch] |
| GPU / hardware-accel impact | No server-side GPU video encode; GPU overlay only accelerates Gazebo rendering, not the stream.[^gpu-override][^rfb] | Same for the VNC plugin; RDP can carry hardware-friendlier codecs but still no GPU **encode** of the framebuffer in a standard `xrdp`/`guacd` setup.[^guac-arch] |
| CPU / bandwidth | Low, fixed footprint: one `x11vnc` + one `websockify` process.[^vnc-entry] | Higher baseline: `guacd` + Java/Tomcat web app + (for the smoother RDP path) an RDP server, each consuming CPU and memory.[^guac-arch] |
| Architecture complexity | Minimal: two processes in one sidecar image sharing the simulator namespace.[^vnc-entry][^compose] | Multi-component: servlet container, `guacd`, protocol plugins, and a connection/credential store.[^guac-arch] |
| Single-proxy fit (INV-04) | Native: one `location /novnc` block proxies to the sidecar.[^proxy-conf] | Requires proxying the Guacamole web app plus its WebSocket tunnel; workable under Nginx but more routing surface.[^guac-arch][^proxy-adr] |
| WebSocket routing | Single WebSocket upgrade already configured and proven.[^proxy-conf] | WebSocket tunnel plus an HTTP long-poll fallback path to account for.[^guac-arch] |
| Auth integration | Deferred to the proxy `auth_basic` gate (ADR-005); no app-level accounts.[^proxy-adr] | Brings its own extensible auth layer (database, LDAP, OIDC), which overlaps and can conflict with the proxy gate.[^guac-arch] |
| Multi-user path | Multiple browsers can attach to the shared `x11vnc` session; no per-user isolation.[^vnc-entry] | Designed as a multi-connection gateway with per-user connections and access control — a real advantage if UberOS becomes multi-user.[^guac-arch] |
| Maintenance | Small surface: Ubuntu packages `x11vnc`, `novnc`, `websockify`.[^vnc-dockerfile] | Larger surface: Guacamole web app + `guacd` + plugins + servlet container, each versioned and patched independently.[^guac-arch] |

## GPU Impact

The GPU discussion must separate **rendering** from **stream encoding**, because they are different pipeline stages:

- **Rendering (Gazebo → framebuffer).** By default UberOS renders in software with Mesa (`LIBGL_ALWAYS_SOFTWARE=1`). The optional GPU overlay clears that flag and reserves an NVIDIA device so Gazebo renders on the GPU, raising simulation frame rate and visual fidelity in the `:99` framebuffer.[^compose][^gpu-override] This benefits **both** noVNC and Guacamole equally, because it happens before either client reads the framebuffer.
- **Stream encoding (framebuffer → browser).** This is where a "hardware video codec" would matter, and it is where neither option helps in the current design. VNC/RFB has no hardware video codec: `x11vnc` produces zlib/JPEG image deltas on the CPU, so a faster GPU does not reduce stream bandwidth or eliminate motion stutter.[^rfb][^novnc-repo] noVNC 1.7.0 can *decode* H.264 in the browser, but only if the VNC server *encodes* H.264, which `x11vnc` does not.[^novnc-repo] Guacamole's VNC plugin inherits the same limit. Guacamole's RDP plugin can carry richer, more motion-friendly codecs, but a standard `guacd` + `xrdp` deployment still encodes on the CPU and does not perform GPU-accelerated NVENC/VA-API video encoding of the desktop out of the box.[^guac-arch]

The practical conclusion: the GPU overlay improves what UberOS renders, but neither client turns the GPU into a video encoder for the stream. A genuinely GPU-encoded pipeline would require a different transport (for example a WebRTC path with server-side NVENC), which is beyond the scope of both options and beyond BR-011.

## Recommendation and Rationale

**Recommendation: keep noVNC for this iteration; do not adopt Apache Guacamole now.**

Rationale:

- **Best fit for the invariants.** noVNC's `x11vnc → websockify` sidecar maps cleanly onto the single-ingress topology (INV-04) and the existing `/novnc` WebSocket route, with no new stateful services.[^proxy-conf][^vnc-entry]
- **No streaming advantage on the current path.** Guacamole connected via its VNC plugin to the same `x11vnc` server has the same codec ceiling as noVNC; its smoothness edge only materializes with an added RDP server and RDP codecs — a far larger change that BR-011 defers.[^guac-arch][^rfb]
- **Lower complexity and maintenance.** noVNC is two processes in one image; Guacamole adds a Java servlet container, the `guacd` daemon, protocol plugins, and its own auth/connection store, all of which must be secured, proxied, and patched.[^guac-arch][^vnc-dockerfile]
- **GPU reality is unchanged.** The GPU overlay accelerates Gazebo rendering for both options; neither performs server-side GPU video encoding of the stream, so switching clients does not unlock hardware-encoded smoothness.[^gpu-override][^rfb]

> **Future improvement (separately approved).** Revisit Apache Guacamole only if UberOS gains one of these needs and the change is approved on its own: (1) a true **multi-user** gateway with per-user connections and access control, (2) a smoother **RDP-based** pipeline that justifies running an RDP server plus `guacd`, or (3) consolidation of multiple remote-desktop or SSH targets behind one gateway. Even then, evaluate a **WebRTC + server-side GPU encode** path in the same review, since that — not a client swap — is what would deliver GPU-accelerated stream smoothness. This document does not recommend implementing Guacamole now.

## References

[^brd]: UberOS Workspace Management BRD, requirement BR-011 (research-only Guacamole vs. noVNC comparison) and invariant I-12 (shared iframe origin): [`docs/brds/uberos-workspace-management-brd.md`](../brds/uberos-workspace-management-brd.md).

[^proxy-conf]: UberOS reverse-proxy configuration, `location /novnc` WebSocket upgrade with `proxy_buffering off`, proxying to `simulator:6080`: [`services/proxy/nginx.conf`](../../services/proxy/nginx.conf).

[^proxy-adr]: ADR-002 Reverse Proxy (Nginx as the single ingress) and ADR-005 (Nginx `auth_basic` as the Init auth gate): [`docs/decisions/ADR-002-proxy.md`](../decisions/ADR-002-proxy.md).

[^vnc-entry]: UberOS VNC sidecar entrypoint: `openbox`, `x11vnc -display :99 -rfbport 5900`, and `websockify --web /usr/share/novnc/ 6080 localhost:5900`: [`services/vnc/entrypoint.sh`](../../services/vnc/entrypoint.sh).

[^vnc-dockerfile]: UberOS VNC sidecar image installing `x11vnc`, `novnc`, `websockify`, and `openbox` on Ubuntu 24.04: [`services/vnc/Dockerfile`](../../services/vnc/Dockerfile).

[^compose]: UberOS Compose definition: simulator `Xvfb` display `:99`, `LIBGL_ALWAYS_SOFTWARE` default, shared `x11-socket` volume, and the vnc sidecar sharing the simulator network namespace: [`compose.yaml`](../../compose.yaml).

[^gpu-override]: UberOS GPU acceleration overlay clearing `LIBGL_ALWAYS_SOFTWARE` and reserving an NVIDIA device for Gazebo rendering: [`compose.override.gpu.yaml`](../../compose.override.gpu.yaml).

[^guac-arch]: Apache Guacamole implementation and architecture: the JavaScript client speaks only the Guacamole protocol; the Java web application tunnels it; `guacd` loads protocol client plugins (RDP, VNC, SSH) and translates between them. Apache Software Foundation, accessed 2026-07-18: <https://guacamole.apache.org/doc/gug/guacamole-architecture.html>.

[^novnc-repo]: noVNC (release 1.7.0, April 2026) supported VNC encodings — raw, copyrect, rre, hextile, tight, tightPNG, ZRLE, JPEG, H.264 — and its requirement for a WebSocket transport (websockify). `novnc/noVNC` README, accessed 2026-07-18: <https://github.com/novnc/noVNC>.

[^rfb]: The Remote Framebuffer (RFB) protocol used by VNC transports region-based pixel updates with encodings such as Raw, CopyRect, Tight, and ZRLE and defines no hardware video codec; `x11vnc` emits CPU-compressed image deltas. RFB protocol specification (RFC 6143): <https://datatracker.ietf.org/doc/html/rfc6143>.
