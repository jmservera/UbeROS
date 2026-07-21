---
title: Gazebo GPU Acceleration on WSL2 Intel — Research Spike
description: GPU passthrough for Gazebo on WSL2 Intel works (Mesa D3D12/dozen, accelerated), but interactive rendering through the headless Xvfb + x11vnc screen-scrape pipeline is ~20x slower than software llvmpipe. This spike locates the bottleneck (per-frame GPU-to-CPU framebuffer readback forced by VNC screen-scraping, compounded by damage-less polling) and recommends keeping software rendering for the interactive display while reserving the GPU for compute.
author: jmservera
ms.date: 07/19/2026
ms.topic: concept
---

# Gazebo GPU Acceleration on WSL2 Intel — Research Spike

This spike addresses **FR-E1, FR-E2, and FR-E3** from the
[Workspace Enhancements PRD](../prds/uberos-workspace-enhancements.md) (goal
**G-006**): determine why Gazebo renders with the software `llvmpipe` driver on
WSL2 with an Intel Iris Xe iGPU — even though the D3D12 GPU passthrough overlay
([`compose.override.wsl.yaml`](../../compose.override.wsl.yaml)) is loaded and
compute passthrough over `/dev/dxg` works — then produce a reproducible path to
GPU-accelerated rendering or a documented blocker with a recommended
alternative.

> **Spike status — updated with live results (2026-07-19).** GPU passthrough is
> confirmed **working**: with the WSL overlay, `glxinfo -B` on `:99` reports the
> Intel Iris Xe through Mesa's D3D12 (dozen) driver with `Accelerated: yes` and
> `direct rendering: Yes`. The original "falls back to llvmpipe" question is
> **resolved** — that earlier fallback was a missing-driver / loader-path issue,
> not a fundamental block. **A new problem surfaced, though:** with the GPU
> active, browser mouse-to-screen latency jumps from ~1 s (llvmpipe) to **20 s+**,
> making the simulator unusable. The spike's focus therefore shifts from "can we
> reach the GPU?" (yes) to "why is the GPU path slower through VNC, and where is
> the bottleneck?" — see
> [Update: GPU renders but interactive latency regresses](#update-gpu-renders-but-interactive-latency-regresses).

## Table of Contents

- [Update: GPU Renders but Interactive Latency Regresses](#update-gpu-renders-but-interactive-latency-regresses)
  - [The Rendering to Display Pipeline](#the-rendering-to-display-pipeline)
  - [Where Is the Bottleneck?](#where-is-the-bottleneck)
  - [Confirming the Diagnosis](#confirming-the-diagnosis-isolate-each-stage)
- [Recommendation](#recommendation)
- [Background: Enabling GPU Passthrough (resolved: works)](#background-enabling-gpu-passthrough-resolved-works)
- [Problem Statement](#problem-statement)
- [Why Compute Works but Render Does Not](#why-compute-works-but-render-does-not)
- [Root-Cause Hypothesis](#root-cause-hypothesis)
- [Diagnosis Method (Reproducible Checklist)](#diagnosis-method-reproducible-checklist)
- [Candidate Reproducible Paths](#candidate-reproducible-paths)
- [Overlay Change (WSL-only, Additive)](#overlay-change-wsl-only-additive)
- [Acceptance-Criteria Mapping](#acceptance-criteria-mapping)
- [Cross-references](#cross-references)
- [References](#references)

## Update: GPU Renders but Interactive Latency Regresses

The GPU overlay achieves its original goal — Gazebo renders on the Intel iGPU —
but the interactive experience through the browser gets **dramatically worse**,
not better:

| Render path | `glxinfo -B` renderer | `Accelerated` | Mouse-to-screen latency | Usable? |
|---|---|---|---|---|
| Software (base) | `llvmpipe (LLVM 20.1.2, 256 bits)` | no | ~1 s | Slow but workable |
| GPU (WSL overlay) | `D3D12 (Intel(R) Iris(R) Xe Graphics)` | yes | **20 s+** | No |

Both runs report the same GL 3.3 / GLSL 3.30 level; the GPU run additionally
shows ~16 GB usable video memory and `direct rendering: Yes`. So the GPU is
genuinely rendering — the regression is **not** a rendering-capability problem.
It is a **data-movement** problem in how rendered frames reach the browser.

### The Rendering to Display Pipeline

```text
gz sim (ogre2) ──renders──▶ Xvfb :99 framebuffer ──scraped by──▶ x11vnc ──▶ websockify ──▶ noVNC ──▶ browser
   (GPU or llvmpipe)         (system RAM, 1920x1080)  (-noshm, XGetImage)     └──────── identical in both modes ────────┘
```

Two facts from [`services/simulator/entrypoint.sh`](../../services/simulator/entrypoint.sh)
and [`services/vnc/entrypoint.sh`](../../services/vnc/entrypoint.sh) are decisive:

1. **The display is a headless Xvfb software framebuffer in system RAM**
   (`Xvfb :99 -screen 0 1920x1080x24 +extension GLX`). Nothing scans out to a
   real GPU display; the pixels only matter once they land in that CPU-side
   framebuffer.
2. **x11vnc scrapes that framebuffer** (`-noshm`, so it reads pixels over the X
   protocol with `XGetImage`) and streams them via websockify/noVNC. This entire
   VNC path is **byte-for-byte identical** whether Gazebo rendered on the GPU or
   on llvmpipe.

### Where Is the Bottleneck?

**Logical isolation first.** The only thing that changes between the fast (1 s)
and slow (20 s) configurations is `GALLIUM_DRIVER=d3d12` plus the GPU device. The
x11vnc → websockify → noVNC → browser path, the resolution, the scene, and the
network are all constant. Since VNC is constant **and** performs acceptably with
llvmpipe, **VNC/noVNC is not the differential bottleneck.** The regression lives
entirely in the render → framebuffer stage.

**Root cause: per-frame GPU-to-CPU framebuffer readback.** With llvmpipe, ogre2
renders *directly into the Xvfb framebuffer in system RAM* — the exact memory
x11vnc scrapes — so there is no transfer. With the D3D12 driver, ogre2 renders
into a **GPU-side surface**, and every frame must then be **read back from GPU
memory into the X11 system-memory framebuffer** so x11vnc can scrape it (a
`glReadPixels` / present-to-pixmap copy). On WSL2 that readback crosses the
paravirtualized GPU boundary (`/dev/dxg` → the host Windows D3D12 runtime), which
is slow and effectively synchronous. Paid **every frame**, it stalls the whole
pipeline — the 20 s lag. In short: **drawing on the GPU is fast, but getting each
finished frame back out of the GPU and into the CPU framebuffer that VNC scrapes
is pathologically slow.** The headless-Xvfb + screen-scrape architecture forces
exactly the one operation (GPU→CPU readback) that WSL2's dozen driver is worst at.

**Compounding factor — damage-less full-screen polling.** x11vnc normally uses
the X `DAMAGE` extension to learn which small regions changed and read back only
those. Core X11 (software) drawing generates `DAMAGE`; GPU/GLX rendering into the
Xvfb drawable often updates pixels *without* producing X `DAMAGE` events, so
x11vnc cannot tell what changed and falls back to polling the **entire**
1920×1080 screen — and each poll now triggers a **full-frame** GPU→CPU readback.
Full-screen readback every cycle multiplies the cost above.

**Why "unified memory: yes" doesn't rescue it.** The Iris Xe shares system RAM,
so one might expect readback to be free. It is not: the dozen driver still
performs a driver-level copy with tiling/format conversion and a synchronous
round-trip through the host D3D12 runtime. It is a logical copy across the
virtualization boundary, not a zero-copy memory mapping.

**Answer to "is the GPU making VNC worse, or is the render engine slower?":**
neither the VNC encoder nor the raw render is the culprit. The render engine is
*faster* on the GPU; VNC is unchanged. The bottleneck is the **readback + scrape**
stage between them — moving each rendered frame from GPU memory into the
CPU-side Xvfb framebuffer — which only exists on the GPU path and is punishingly
slow across WSL2's dozen boundary.

### Confirming the Diagnosis (isolate each stage)

Run these on the WSL2 host with the GPU overlay up, to convert the analysis into
measured fact:

| # | Measurement | Command (in `simulator`) | If the bottleneck is readback… |
|---|---|---|---|
| 1 | Raw GL render rate | `env vblank_mode=0 glxgears` or `GALLIUM_HUD=fps` on `gz sim` | Very high FPS on GPU → drawing is *not* the problem |
| 2 | CPU profile during interaction | `top -bn1` in `simulator` **and** `vnc` | Xvfb / x11vnc CPU pegged (copy/scrape); `gz sim` GPU mostly idle-waiting |
| 3 | Readback cost | a `glReadPixels` micro-benchmark at 1920×1080, GPU vs llvmpipe | GPU readback orders of magnitude slower |
| 4 | Damage vs polling | run x11vnc with `-noxdamage` on **llvmpipe**; if it becomes as slow as GPU, polling+readback is confirmed | llvmpipe + `-noxdamage` regresses → mechanism confirmed |
| 5 | Resolution sensitivity | drop Xvfb to `1280x720`, retest GPU latency | Latency scales with pixel count → per-frame full-screen readback |
| 6 | Bypass VNC | compare `gz sim` GUI FPS locally (`GALLIUM_HUD`) vs VNC-observed FPS | Large gap → the loss is in readback/scrape, not render or VNC |

Expected outcome: (1) shows GPU render is fast, (2)/(6) show the time is spent in
Xvfb/x11vnc pixel movement, and (4)/(5) confirm the damage-less full-screen
readback mechanism — pinpointing the bottleneck as **readback + scrape**, not the
render engine and not VNC encoding. The full **Recommendation** follows.

## Background: Enabling GPU Passthrough (resolved: works)

The sections below were the **original** spike: determining whether the GPU could
be reached at all. That question is now **answered — yes** (see the Update above);
the earlier `llvmpipe` fallback was a driver / loader-path issue, since resolved.
They are retained as the reproducible passthrough-enablement reference and stay
useful if a future image or host regresses to software rendering. Note the
performance finding above **supersedes** the old recommendation to chase the GPU
render path for the interactive VNC view.

## Problem Statement

On the primary WSL2 host (Windows 11, Docker Desktop WSL2 backend, Intel Iris Xe
iGPU), Gazebo (`gz sim`) renders through the software `llvmpipe` rasterizer
instead of the GPU. This happens **despite** the WSL overlay already providing
the full D3D12 passthrough contract described in
[doc 03](03-intel-openvino-research.md):

- `/dev/dxg` is passed into the `simulator` container.
- `/usr/lib/wsl` is mounted read-only and `/usr/lib/wsl/lib` is on
  `LD_LIBRARY_PATH`.
- `GALLIUM_DRIVER=d3d12` selects the Mesa D3D12 (dozen) Gallium driver.
- `LIBGL_ALWAYS_SOFTWARE` is cleared (empty) so software rendering is not forced.
- `MESA_D3D12_DEFAULT_ADAPTER_NAME` selects the Intel adapter.

The paradox that frames this spike: **compute workloads succeed over the same
`/dev/dxg` passthrough** (for example oneAPI / Level Zero embeddings run on the
iGPU), yet the **graphics/GL render path falls back to software**. That
asymmetry is the key clue — it points away from "the device is not passed
through" (compute proves it is) and toward "the GL render engine Gazebo uses is
not fully served by the D3D12 Gallium driver on WSL2."

Concretely, the failure signature to confirm is `glxinfo -B` reporting the
renderer as `llvmpipe` (software) rather than a Mesa D3D12 device naming the
Intel adapter, while `gz sim` still runs (slowly) because software rendering
always succeeds.

## Why Compute Works but Render Does Not

WSL2 exposes the GPU as the DirectX kernel device `/dev/dxg` with the Windows
user-mode driver under `/usr/lib/wsl/lib`
([doc 03](03-intel-openvino-research.md), "WSL2 (Windows): /dev/dxg not
/dev/dri"). Two very different software stacks sit on top of that single device:

| Path | Stack on WSL2 | Reaches `/dev/dxg` via | Failure mode here |
|---|---|---|---|
| **Compute** (oneAPI, Level Zero, OpenCL) | Intel Level Zero / oneAPI runtime | `libze_intel_gpu` / `libze_loader` in `/usr/lib/wsl/lib` | **Works** — never touches the GL render path |
| **Graphics** (Gazebo → OGRE → OpenGL) | Mesa `d3d12` (dozen) Gallium driver | `libdxcore` → `/dev/dxg` → Windows D3D12 UMD | **Falls back to `llvmpipe`** when the GL feature level the engine needs exceeds what dozen exposes, or when `d3d12_dri.so` / the WSL libs are not actually on the loader path *inside the rendering container* |

Because the two stacks are independent, "compute works" does **not** imply "GL
works." Compute reaching the GPU only proves `/dev/dxg` passthrough and the WSL
driver libs are healthy; it says nothing about whether Mesa's dozen driver can
satisfy the OpenGL version and features Gazebo's default renderer demands.

## Root-Cause Hypothesis

Gazebo Ionic/Harmonic (`gz sim`) defaults to the **`ogre2`** render engine.
`ogre2` (OGRE-Next) targets a modern GL 3.3+ core profile and uses features such
as compute shaders, texture arrays, and UBO/SSBO paths that assume a fairly
complete desktop-GL implementation. Mesa's **`d3d12` (dozen)** Gallium driver on
WSL2 is a newer, less complete GL frontend than native `iris`; on the Iris Xe
under WSL2 it may not advertise the exact GL version/feature set `ogre2` probes
for at context creation. When `ogre2`'s context/feature check fails, Mesa (or
OGRE) silently falls back to the software `llvmpipe` path rather than erroring —
which is exactly the observed symptom.

Primary hypothesis (ranked):

1. **`ogre2` GL feature requirements exceed dozen's WSL2 coverage.** The GL 3.3+
   / compute-capable context `ogre2` wants is not fully exposed by `d3d12_dri.so`
   for the Iris Xe on WSL2, so rendering drops to `llvmpipe`.
2. **Loader/driver placement in the rendering container.** The container that
   *actually renders* is `simulator` (it runs Xvfb `:99` and `gz sim`; the `vnc`
   sidecar only shares the network namespace and streams the framebuffer — it
   does not render). If `d3d12_dri.so` is missing from the simulator image's
   Mesa, or `/usr/lib/wsl/lib` is not effectively on the loader path at
   `gz sim` launch, dozen is never selected and `llvmpipe` is used regardless of
   env.
3. **`MESA_GL_VERSION_OVERRIDE=3.3` interaction.** The base image sets
   `MESA_GL_VERSION_OVERRIDE=3.3` / `MESA_GLSL_VERSION_OVERRIDE=330` for the
   software path. On the dozen driver this override can *cap* or confuse the
   reported GL version and may need to be raised or cleared for the D3D12 path.

Hypotheses (2) and (3) are quick to confirm/reject with the checklist below;
(1) is the substantive root cause and drives the candidate fixes.

## Diagnosis Method (Reproducible Checklist)

Run these on the real WSL2 host after starting the stack with the WSL overlay:

```bash
docker compose -f compose.yaml -f compose.override.wsl.yaml up -d
```

All commands target the **`simulator`** container because that is where Xvfb
`:99` and `gz sim` run and therefore where rendering must be accelerated. Run a
subset against `vnc` only to prove the sidecar does **not** need the GPU.

| # | Command | What it checks | Expected / interpretation |
|---|---|---|---|
| 1 | `docker compose exec simulator ls -l /dev/dxg` | Device passthrough | Node present → `/dev/dxg` is passed in. Absent → overlay not loaded or WSL kernel too old (`wsl --update`). |
| 2 | `docker compose exec simulator sh -lc 'ls -l /usr/lib/wsl/lib \| grep -Ei "dxcore\|d3d12"'` | WSL driver libs mounted | `libdxcore.so`, `libd3d12core.so` present → the Windows UMD is available to the container. |
| 3 | `docker compose exec simulator sh -lc 'echo "$LD_LIBRARY_PATH"'` | Loader path | Must contain `/usr/lib/wsl/lib`. If ROS `setup.bash` replaced (not appended) it, dozen can't find `libdxcore` and falls back. |
| 4 | `docker compose exec simulator sh -lc 'find / -name "d3d12_dri.so" 2>/dev/null'` | Mesa D3D12 driver present in image | A hit (e.g. under `/usr/lib/x86_64-linux-gnu/dri/`) → dozen is installable. **No hit → root cause is a missing driver**; rendering *must* fall back to `llvmpipe` until the image ships Mesa's D3D12 Gallium driver. |
| 5 | `docker compose exec simulator sh -lc 'ldconfig -p \| grep -Ei "dxcore\|d3d12\|gallium"'` | Loader can resolve the D3D12 libs | The dozen dependencies resolve → the driver can load at runtime. |
| 6 | `docker compose exec simulator sh -lc 'glxinfo -B'` | **The headline test** — actual GL renderer on `:99` | Success = "Device: … (D3D12)" / an Intel adapter string. **Failure = `llvmpipe`** (software). This is the pass/fail signal for FR-E2. |
| 7 | `docker compose exec simulator sh -lc 'GALLIUM_DRIVER=d3d12 LIBGL_ALWAYS_SOFTWARE=0 glxinfo -B'` | Force dozen explicitly | If this shows the Intel adapter but step 6 did not, an env/loader-path issue (hypothesis 2/3) is the cause, not driver absence. |
| 8 | `docker compose exec simulator sh -lc 'MESA_GL_VERSION_OVERRIDE=4.6 MESA_GLSL_VERSION_OVERRIDE=460 glxinfo -B \| grep -i "opengl version"'` | GL level reachable via dozen | Records the GL version dozen actually exposes; compare against `ogre2`'s 3.3+/compute needs (hypothesis 1/3). |
| 9 | `docker compose exec simulator sh -lc 'gz sim --version'` | Gazebo release | Confirms Ionic/Harmonic and thus that `ogre2` is the default engine. |
| 10 | `docker compose exec simulator sh -lc 'command -v vulkaninfo && vulkaninfo \| grep -Ei "deviceName\|driverName"'` | Vulkan availability (dozen's sibling / OGRE Vulkan) | If a real Vulkan device (not `llvmpipe`) appears, the Vulkan render path (candidate b) is viable. Missing `vulkaninfo` → `vulkan-tools` not in the image. |
| 11 | `docker compose exec simulator sh -lc 'ls -l /tmp/.X11-unix; xdpyinfo -display :99 \| head'` | The Xvfb `:99` server the GUI uses | Confirms the same display the renderer targets; rules out a second, un-accelerated X server. |
| 12 | `docker compose exec vnc sh -lc 'ls -l /dev/dxg 2>&1; echo ---; glxinfo -B 2>&1 \| head'` | Prove the sidecar does **not** render | `vnc` need not see `/dev/dxg`; it only streams `:99`. Confirms GPU work belongs to `simulator`, not `vnc`. |

Record for FR-E1: the **renderer string** (step 6), whether **`d3d12_dri.so` is
present** (step 4), whether **`/usr/lib/wsl/lib` is on `LD_LIBRARY_PATH`**
(step 3), the **GL version** dozen exposes (step 8), and whether a real
**Vulkan** device exists (step 10).

## Candidate Reproducible Paths

Ranked by likelihood of success and lowest risk on this host. Each is
WSL-only and additive; none touches the native-Linux/Intel or NVIDIA overlays.

### (a) Force the `ogre1` render engine — recommended first try

Gazebo can render with the older **`ogre`** (OGRE 1.x) engine, whose GL
requirements are markedly lower than `ogre2`'s and far more likely to be
satisfied by Mesa's dozen driver on WSL2.

- **How:** launch Gazebo with `--render-engine ogre` instead of the default
  `ogre2`, or set the engine via the WSL overlay (staged as commented guidance
  in [`compose.override.wsl.yaml`](../../compose.override.wsl.yaml)).
- **Trade-offs:** `ogre1` has lower visual fidelity (no PBR, fewer modern
  shading features) and some newer sensor/GUI features assume `ogre2`. For a
  development/simulation workspace this is an acceptable trade to get off
  software rendering. **Lowest risk, highest chance of immediately clearing
  `llvmpipe`.**

### (b) Vulkan-based rendering

If step 10 shows a real Vulkan device, OGRE-Next can target Vulkan, and Mesa's
dozen path may expose a more complete Vulkan surface than GL on WSL2.

- **How:** ensure `vulkan-tools` + the WSL ICD are present and select the
  Vulkan render backend where the Gazebo/OGRE build supports it.
- **Trade-offs:** most involved option; depends on the OGRE-Next build's Vulkan
  support and adds image packages. Higher payoff (modern rendering) but higher
  integration risk. Pursue only if (a) is insufficient and step 10 is positive.

### (c) `MESA_GL_VERSION_OVERRIDE` bump

The base image pins `MESA_GL_VERSION_OVERRIDE=3.3` / `330` for the software
path. On dozen this can *cap* the reported GL version below what the driver
actually supports, or confuse `ogre2`'s probe.

- **How:** on the WSL overlay, raise the override (e.g. `4.6` / `460`) or clear
  it so dozen reports its native GL level; re-run step 6.
- **Trade-offs:** cheap to try and fully reversible, but an override only
  changes the *reported* version — it cannot add features dozen lacks. If the
  real limitation is missing GL/compute capability, this alone will not stop the
  `llvmpipe` fallback. Best used **in combination with (a)**.

## Recommendation

**Keep software (`llvmpipe`) rendering as the default for the interactive
simulator display on WSL2; do not use GPU rendering for the VNC-scraped view.**
The GPU overlay reaches the iGPU, but in this headless-Xvfb + x11vnc screen-scrape
architecture it is *counterproductive*: the mandatory per-frame GPU→CPU readback
across the WSL2 dozen boundary makes the browser view ~20× slower than software.
For an interactive, screen-scraped display, llvmpipe — which renders straight into
the CPU framebuffer that VNC reads — is the correct choice.

Reserve the GPU for the workloads it actually helps:

1. **Compute** (oneAPI / Level Zero over `/dev/dxg`) — already working and
   unaffected by this finding; keep using the GPU there.
2. **A future GPU-encoded streaming path** — the *only* way GPU rendering helps a
   remote view is to avoid the raw pixel readback by encoding on the GPU and
   streaming compressed frames. Options, in rough order of effort:
   - **VirtualGL + TurboVNC**: VirtualGL does an optimized asynchronous PBO
     readback and fast JPEG; it can help, but on WSL2 dozen the readback still
     crosses the paravirt boundary — measure before adopting.
   - **Hardware-encoded streaming (Intel VA-API H.264/AV1) + WebRTC** (for
     example Selkies-GStreamer, or KasmVNC with GPU): the GPU renders *and*
     encodes, so no full-frame CPU readback happens. This is how GPU cloud
     desktops work and is the robust long-term answer, at the cost of replacing
     x11vnc with a streaming stack.

**Interim mitigations if GPU rendering must be used for the sim view:**

- Lower the Xvfb resolution (for example `1280x720`) to shrink per-frame readback.
- Enable MIT-SHM (share the IPC namespace so x11vnc can drop `-noshm`) to speed
  the CPU-side copy — this reduces scrape cost but does **not** remove the GPU→CPU
  readback.
- Confirm/repair `DAMAGE` so x11vnc reads only changed regions instead of polling
  full-screen (measurement #4).

**Net:** the WSL2 GPU overlay is validated as *functional* (FR-E2 met — the GPU
renders), but for the browser-delivered simulator it is **not recommended**;
software rendering stays the default, and true GPU-accelerated remote rendering is
a larger, separate initiative (GPU-side encode + stream), not a compose-overlay
toggle. If GPU-accelerated Gazebo is needed with a *local* display, a
**native-Linux Intel host via
[`compose.override.intel.yaml`](../../compose.override.intel.yaml)** (`/dev/dri` +
`iris`, scanning out to a real display) avoids the readback problem entirely.

> The `ogre1` / GL-override notes in [Candidate Reproducible Paths](#candidate-reproducible-paths)
> remain valid **only** for the (now-resolved) question of reaching the GPU at
> all. They do not address the readback latency and should not be adopted to
> "fix" the interactive view — software rendering is the fix there.

## Overlay Change (WSL-only, Additive)

Per **FR-E3**, any implementation must not regress the native-Linux/Intel or
NVIDIA overlays. The only file this spike changes is
[`compose.override.wsl.yaml`](../../compose.override.wsl.yaml), and the change is
**commented-out guidance only** (no behavioral change until an operator opts in):

- A commented block documenting the `ogre1` fallback — how to force
  `--render-engine ogre` (or set it via env) as the recommended first remediation.
- A note that raising/clearing `MESA_GL_VERSION_OVERRIDE` on this overlay can be
  combined with the `ogre1` fallback.

No other overlay file is touched. Because the guidance is commented, base
`docker compose config` for `base + intel + wsl + nvidia` remains valid (NFR-4),
and non-WSL hosts are entirely unaffected.

## Acceptance-Criteria Mapping

| Requirement | Acceptance | How this spike satisfies it |
|---|---|---|
| **FR-E1** GPU diagnosis | Write-up records renderer used, driver present, GL/Vulkan level | Checklist steps 3, 4, 6, 8, 10 capture the renderer string, `d3d12_dri.so` presence, `LD_LIBRARY_PATH`, GL version, and Vulkan device |
| **FR-E2** GPU path or blocker | `glxinfo -B` reports the Intel adapter, or blocker documented | **Met** — GPU passthrough confirmed working (D3D12 Intel Iris Xe, accelerated). A separate performance blocker is documented for the VNC-scraped view (per-frame readback) with the recommended alternative (software rendering now; GPU-encode streaming later) |
| **FR-E3** Overlay implementation | Native-Linux/NVIDIA overlays unaffected | Only `compose.override.wsl.yaml` changes, and only as commented, opt-in guidance |
| **NFR-5** Performance | Renderer != `llvmpipe` (if feasible) | **Not feasible for the interactive VNC view** — GPU rendering regresses browser latency ~20x due to per-frame GPU→CPU readback; software `llvmpipe` is the correct default here. GPU perf wins only via a future GPU-encode streaming path or a native-Linux local display |
| **NFR-4** Compatibility | `docker compose config` valid for base+intel+wsl+nvidia | Overlay change is comments only; compose stays valid |

**Definition of success (revised):** GPU *reachability* is proven — under
`compose.override.wsl.yaml`, `docker compose exec simulator glxinfo -B` reports the
Intel adapter through Mesa's D3D12 driver (not `llvmpipe`). But the *interactive*
success criterion (a responsive simulator in the browser) is met by **software
rendering**, not the GPU, on this Xvfb + VNC topology: the GPU path is validated
as functional yet non-performant for screen-scraped delivery, and the documented
path to genuine GPU-accelerated remote rendering is a GPU-side encode + stream
stack (a separate initiative).

## Cross-references

| Source | Relevance |
|---|---|
| [`docs/specs/03-intel-openvino-research.md`](03-intel-openvino-research.md) | Establishes WSL2 uses `/dev/dxg` (not `/dev/dri`), the D3D12/dozen render path, and `/usr/lib/wsl` driver mounting — the foundation this spike diagnoses |
| [`docs/prds/uberos-workspace-enhancements.md`](../prds/uberos-workspace-enhancements.md) | FR-E1..E3 / G-006 (Theme E), Risk R-5, and the Mesa d3d12 dependency this spike resolves |
| [`docs/brds/uberos-workspace-enhancements-brd.md`](../brds/uberos-workspace-enhancements-brd.md) | Business intent for the GPU-on-WSL2 theme |
| [`compose.override.wsl.yaml`](../../compose.override.wsl.yaml) | The WSL overlay under diagnosis and the only file changed (commented `ogre1` fallback guidance) |
| [`compose.override.intel.yaml`](../../compose.override.intel.yaml) | Native-Linux `/dev/dri` + `iris` overlay — the recommended fallback if the WSL path is blocked |
| [`services/simulator/Dockerfile`](../../services/simulator/Dockerfile) | Mesa stack baked into the rendering container; where `d3d12_dri.so` must be present |
| [`services/simulator/entrypoint.sh`](../../services/simulator/entrypoint.sh) | Starts Xvfb `:99` and `gz sim` — confirms the `simulator` service is where rendering happens |

## References

| Source | Purpose |
|---|---|
| <https://gazebosim.org/docs/latest/manipulating_models/> | Gazebo `gz sim` usage and render-engine selection context |
| <https://gazebosim.org/api/rendering/latest/> | Gazebo rendering (`ogre` vs `ogre2`/OGRE-Next) engine background |
| <https://docs.mesa3d.org/drivers/d3d12.html> | Mesa D3D12 (dozen) Gallium driver used on WSL2 |
| <https://docs.mesa3d.org/envvars.html> | `GALLIUM_DRIVER`, `LIBGL_ALWAYS_SOFTWARE`, `MESA_GL_VERSION_OVERRIDE` semantics |
| <https://learn.microsoft.com/windows/wsl/gpu-compute> | WSL2 GPU passthrough (`/dev/dxg`, `/usr/lib/wsl`) for compute and graphics |
| <https://dgpu-docs.intel.com/> | Intel graphics driver / compute runtime documentation |
| <https://github.com/LibVNC/x11vnc> | x11vnc screen-scraping VNC server: `-noshm`, `-noxdamage`, XDAMAGE vs polling behavior |
| <https://virtualgl.org/> | VirtualGL: GPU rendering with optimized readback for remote/VNC displays |
| <https://turbovnc.org/> | TurboVNC: high-performance VNC commonly paired with VirtualGL |
| <https://github.com/selkies-project/selkies-gstreamer> | GPU hardware-encoded (VA-API/NVENC) WebRTC streaming — the readback-free remote-GPU path |
| [Intel Community: "Cannot get /dev/dri to appear in WSL 2"](https://community.intel.com/t5/Graphics/Cannot-get-dev-dri-to-appear-in-WSL-2-for-Intel-Iris-Xe-12th-Gen/m-p/1724203) | Intel confirms WSL2 uses `/dev/dxg`, not `/dev/dri` |
