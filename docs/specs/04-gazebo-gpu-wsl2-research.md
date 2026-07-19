---
title: Gazebo GPU Acceleration on WSL2 Intel — Research Spike
description: Why Gazebo falls back to software (llvmpipe) on WSL2 with an Intel Iris Xe despite the /dev/dxg + /usr/lib/wsl D3D12 overlay, a reproducible diagnosis checklist, and ranked candidate fixes (ogre1, Vulkan, GL override) for the WSL overlay.
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

> **Spike status — not tested live on this host.** The write-up below is a
> reproducible diagnosis + remediation plan, not a confirmed result. This
> environment cannot run WSL2/GPU workloads, so every command is presented as a
> checklist an operator runs on the real WSL2 host, with the interpretation of
> each expected output. The **recommended first fix** (force the `ogre` render
> engine — see [Candidate reproducible paths](#candidate-reproducible-paths)) is
> the most likely to work and is staged as commented, WSL-only guidance in the
> overlay.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Why Compute Works but Render Does Not](#why-compute-works-but-render-does-not)
- [Root-Cause Hypothesis](#root-cause-hypothesis)
- [Diagnosis Method (Reproducible Checklist)](#diagnosis-method-reproducible-checklist)
- [Candidate Reproducible Paths](#candidate-reproducible-paths)
- [Recommendation](#recommendation)
- [Overlay Change (WSL-only, Additive)](#overlay-change-wsl-only-additive)
- [Acceptance-Criteria Mapping](#acceptance-criteria-mapping)
- [Cross-references](#cross-references)
- [References](#references)

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

Gazebo Jetty/Harmonic (`gz sim`) defaults to the **`ogre2`** render engine.
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
| 9 | `docker compose exec simulator sh -lc 'gz sim --version'` | Gazebo release | Confirms Jetty/Harmonic and thus that `ogre2` is the default engine. |
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

**Try (a) `ogre1` first, combined with clearing/raising the GL override (c).**

Rationale: the failure asymmetry (compute works, GL falls back) plus `ogre2`'s
elevated GL 3.3+/compute requirements make "the default render engine outruns
dozen's WSL2 GL coverage" the most probable root cause. Forcing `ogre1` sidesteps
that entire class of feature gaps with a single, reversible, WSL-only change and
is the fastest route from `llvmpipe` to the Intel adapter. Escalate to Vulkan (b)
only if the checklist shows a healthy Vulkan device and `ogre1` still under-serves.

**If even `ogre1` reports `llvmpipe` after confirming `d3d12_dri.so` is present
(step 4) and `/usr/lib/wsl/lib` is on the loader path (step 3):** treat it as a
**documented blocker** — Mesa's dozen driver does not yet serve Gazebo's GL needs
for the Iris Xe on this WSL2 kernel/Mesa combination. Recommended alternative in
that case: keep the **software-rendering default** on WSL2 (the base
`compose.yaml` path already works and is correct without the overlay) and run
GPU-accelerated Gazebo on a **native-Linux Intel host via
[`compose.override.intel.yaml`](../../compose.override.intel.yaml)** (`/dev/dri`
+ `iris`), which is the proven path from [doc 03](03-intel-openvino-research.md).
Re-test the WSL path after the next `wsl --update` and Mesa bump, since dozen's
GL coverage improves over time.

Because this host cannot be tested live, this document deliberately delivers the
**reproducible verification (the checklist)** plus the **most likely fix to try
first (`ogre1`)**, rather than asserting an unverified result.

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
| **FR-E2** GPU path or blocker | `glxinfo -B` reports the Intel adapter, or blocker documented | Ranked candidate paths + explicit blocker/alternative (native-Linux `iris` fallback) |
| **FR-E3** Overlay implementation | Native-Linux/NVIDIA overlays unaffected | Only `compose.override.wsl.yaml` changes, and only as commented, opt-in guidance |
| **NFR-5** Performance | Renderer != `llvmpipe` (if feasible) | Success = step 6 shows the Intel D3D12 adapter, not `llvmpipe` |
| **NFR-4** Compatibility | `docker compose config` valid for base+intel+wsl+nvidia | Overlay change is comments only; compose stays valid |

**Definition of success:** on the WSL2 host, with the stack up under
`compose.override.wsl.yaml`, `docker compose exec simulator glxinfo -B` reports
the Intel adapter through Mesa's D3D12 driver (not `llvmpipe`), and `gz sim`
renders the default world on the GPU.

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
| [Intel Community: "Cannot get /dev/dri to appear in WSL 2"](https://community.intel.com/t5/Graphics/Cannot-get-dev-dri-to-appear-in-WSL-2-for-Intel-Iris-Xe-12th-Gen/m-p/1724203) | Intel confirms WSL2 uses `/dev/dxg`, not `/dev/dri` |
