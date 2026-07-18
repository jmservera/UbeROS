---
title: Intel GPU and OpenVINO Compatibility Research for the Simulator Overlay
description: Feasibility of an Intel GPU (/dev/dri) rendering overlay for Gazebo and how OpenVINO relates, compared against the existing NVIDIA overlay (BR-012).
author: jmservera
ms.date: 07/18/2026
ms.topic: concept
---

# Intel GPU and OpenVINO Compatibility Research for the Simulator Overlay

This report addresses business requirement **BR-012** from the
[Workspace Management BRD](../brds/uberos-workspace-management-brd.md): investigate
Intel GPU and OpenVINO compatibility for the simulator overlay, using the existing
NVIDIA overlay ([`compose.override.gpu.yaml`](../../compose.override.gpu.yaml)) as a
starting point, and implement an Intel overlay if feasible.

## Table of Contents

- [Summary and Feasibility Verdict](#summary-and-feasibility-verdict)
- [Intel GPU Rendering for Gazebo](#intel-gpu-rendering-for-gazebo)
- [OpenVINO: What It Is and How It Relates](#openvino-what-it-is-and-how-it-relates)
- [Feasibility Comparison vs the NVIDIA Overlay](#feasibility-comparison-vs-the-nvidia-overlay)
- [Using the Overlay and Verifying It](#using-the-overlay-and-verifying-it)
- [References](#references)

## Summary and Feasibility Verdict

> **Verdict:** An Intel GPU rendering overlay for the `simulator` service is
> **feasible and implemented** as [`compose.override.intel.yaml`](../../compose.override.intel.yaml).
> Unlike NVIDIA, Intel needs no vendor container runtime: the render node is a
> standard Linux DRI device, so passing `/dev/dri` into the container and
> disabling software rendering is sufficient for the Intel Mesa (iris) GL stack
> to drive Gazebo. This is a strictly Linux + Intel-GPU capability.

Key findings:

- **Rendering (this iteration):** Feasible now. Gazebo's OGRE renderer uses the
  Mesa `iris` OpenGL driver when `/dev/dri` is present and
  `LIBGL_ALWAYS_SOFTWARE` is unset. No vendor toolkit, no `deploy.resources`
  device reservation, and no privileged mode are required — only device
  passthrough plus the correct render-group membership.
- **OpenVINO (future):** Out of scope for rendering. OpenVINO is an inference
  toolkit, not a GL driver. It is a plausible **future** runtime layer for ROS
  perception/AI workloads on Intel iGPU/NPU, but it does not accelerate Gazebo's
  graphics and is deliberately not wired into this overlay.
- **Host constraints:** The overlay is Linux-only. Docker Desktop on macOS and
  Windows exposes no `/dev/dri`, so those hosts simply do not load the overlay
  and continue to run the default software-rendering path from
  [`compose.yaml`](../../compose.yaml).

## Intel GPU Rendering for Gazebo

### How Intel rendering differs from NVIDIA

The NVIDIA overlay relies on the NVIDIA Container Toolkit and the Compose V2
device-reservation syntax (`deploy.resources.reservations.devices` with
`driver: nvidia`). Intel needs none of that. On Linux, an Intel GPU is exposed
through the kernel `i915` driver as **DRI render nodes** under `/dev/dri`:

| Node | Role |
|---|---|
| `/dev/dri/card0` | Primary/KMS node (display; not required for headless render) |
| `/dev/dri/renderD128` | Render node used for offscreen GPU rendering and compute |

Passing the whole `/dev/dri` directory into the container gives Gazebo's OGRE
renderer access to `renderD128`, and Mesa's `iris` Gallium driver takes over
hardware GL. There is no vendor daemon or runtime to install on the host beyond
the standard kernel driver.

### Required container and host pieces

| Concern | Requirement | Notes |
|---|---|---|
| Device passthrough | `devices: ["/dev/dri:/dev/dri"]` on `simulator` | Portable Compose way to expose render + card nodes |
| Software rendering | `LIBGL_ALWAYS_SOFTWARE=""` (unset) | The base image defaults to `1`; the overlay clears it |
| Mesa GL driver | `libgl1-mesa-dri` (already in the simulator image) | Provides the `iris` driver for Gen8+ Intel GPUs |
| VA-API driver | `LIBVA_DRIVER_NAME=iHD` | `intel-media-va-driver` for Gen8+; `i965` only for legacy parts |
| Permissions | `group_add` for `render` (and `video`) | `renderD128` is owned by the `render` group; GIDs are host-specific |

The simulator image already ships the Mesa stack (`mesa-utils`,
`libgl1-mesa-dri`, `libglu1-mesa`) used for software rendering, so hardware GL
via `iris` needs no new packages for basic Gazebo rendering.

### Optional Intel packages (compute and media)

These are **not** required for Gazebo GL rendering but matter for VA-API media
and any future OpenVINO/OpenCL work. They would be added to the simulator (or a
future dedicated) image only when those workloads are introduced:

| Package | Purpose |
|---|---|
| `intel-media-va-driver` (or `-non-free`) | VA-API `iHD` driver for hardware video encode/decode |
| `intel-opencl-icd` | OpenCL runtime (Compute Runtime) for GPU compute |
| `libze1` (Level Zero loader) | Backend used by OpenVINO's GPU/NPU plugins |
| `vainfo` | Diagnostic: lists VA-API entrypoints/profiles |
| `clinfo` | Diagnostic: lists OpenCL platforms/devices |

### Group permissions caveat

`renderD128` is typically owned by the `render` group and `card0` by `video`.
The container process must belong to those groups (by numeric GID) to open the
nodes without `privileged: true`. **These GIDs vary per host/distro.** The
overlay uses `group_add` with `.env`-overridable values; determine the correct
GIDs on the host with:

```bash
getent group render video
```

Then set `UBEROS_RENDER_GID` / `UBEROS_VIDEO_GID` in `.env` if they differ from
the defaults.

## OpenVINO: What It Is and How It Relates

**OpenVINO** (Open Visual Inference and Neural network Optimization) is Intel's
open-source toolkit for optimizing and running deep-learning **inference**. It
compiles trained models (ONNX, TensorFlow, PyTorch-exported, etc.) into an
optimized intermediate representation and executes them across Intel hardware
through device plugins:

| OpenVINO device plugin | Target hardware |
|---|---|
| `CPU` | x86 cores (oneDNN) |
| `GPU` | Intel iGPU/dGPU via the Level Zero / OpenCL backend |
| `NPU` | Intel Neural Processing Unit (AI Boost on newer Core Ultra) |

**How it relates to UberOS — and what it is not.** OpenVINO accelerates
*inference*, not *graphics*. Gazebo's rendering goes through OpenGL/Mesa; nothing
in the simulator's render path calls OpenVINO. The natural home for OpenVINO in
this project is a **future ROS perception/AI layer** — for example, running an
object-detection or segmentation model on camera topics using the Intel iGPU or
NPU rather than the CPU.

That future layer is feasible on the same foundation this overlay establishes:
the `GPU`/`NPU` plugins reach the hardware through the same `/dev/dri` render
node (plus the Level Zero loader `libze1` and, for the GPU plugin,
`intel-opencl-icd`). So the device-passthrough and group-permission work done
here for rendering is exactly what a later OpenVINO runtime would reuse.

> **Scope note (no over-promising):** This iteration delivers **rendering
> acceleration only**. A dedicated OpenVINO runtime image and ROS inference
> nodes are a plausible follow-up but are **not** implemented here, because
> BR-012's implementable-if-feasible target is the simulator GPU overlay, and
> OpenVINO adds no value to Gazebo's GL rendering. Introducing it would require
> a model, a ROS perception node, and the compute packages above — tracked as
> future work, not Init/BR-012 scope.

## Feasibility Comparison vs the NVIDIA Overlay

| Dimension | NVIDIA overlay (`compose.override.gpu.yaml`) | Intel overlay (`compose.override.intel.yaml`) |
|---|---|---|
| Device mechanism | `deploy.resources.reservations.devices` (`driver: nvidia`) | `devices: ["/dev/dri:/dev/dri"]` |
| Host runtime dependency | NVIDIA Container Toolkit + driver | Kernel `i915` only (no vendor runtime) |
| GL driver in container | NVIDIA proprietary GL | Mesa `iris` (Gallium) |
| Key env | `NVIDIA_VISIBLE_DEVICES`, `NVIDIA_DRIVER_CAPABILITIES`, `LIBGL_ALWAYS_SOFTWARE=""` | `LIBVA_DRIVER_NAME=iHD`, `LIBGL_ALWAYS_SOFTWARE=""` |
| Permissions | Handled by the toolkit | `group_add` render/video (host-specific GIDs) |
| Extra packages for basic render | None (toolkit injects driver libs) | None (Mesa already in image) |
| Compute/inference story | CUDA / TensorRT | OpenVINO (`GPU`/`NPU`), OpenCL, Level Zero |
| Linux support | Yes | Yes |
| macOS/Windows (Docker Desktop) | No GPU passthrough | No `/dev/dri`; overlay not loaded |
| Verification commands | `nvidia-smi`, `glxinfo` | `vainfo`, `clinfo`, `glxinfo -B` |

Both overlays share the same principle: keep the change minimal, touch only the
`simulator` service, disable software rendering, and let non-supported hosts run
the default software path by simply not loading the overlay.

## Using the Overlay and Verifying It

### Launch with the overlay

```bash
docker compose -f compose.yaml -f compose.override.intel.yaml up
```

Load only one GPU overlay at a time (NVIDIA *or* Intel), never both.

### Confirm the correct render-group GIDs (once per host)

```bash
getent group render video
# If they differ from the defaults, set in .env:
#   UBEROS_RENDER_GID=<gid>
#   UBEROS_VIDEO_GID=<gid>
```

### Verify hardware rendering inside the container

```bash
# The render node is visible in the container:
docker compose exec simulator ls -l /dev/dri

# GL renderer should report Intel/Mesa iris, NOT "llvmpipe" (software):
docker compose exec simulator glxinfo -B | grep -Ei 'renderer|vendor|device'

# VA-API media stack (needs the iHD driver / intel-media-va-driver):
docker compose exec simulator vainfo

# OpenCL devices (needs intel-opencl-icd; relevant for future OpenVINO GPU):
docker compose exec simulator clinfo
```

A successful result shows the GL renderer as an Intel device via Mesa `iris`
(for example, `Mesa Intel(R) ...`) instead of `llvmpipe`, which is the
software-rendering fallback used when `/dev/dri` is absent or
`LIBGL_ALWAYS_SOFTWARE=1`.

### Non-Intel / non-Linux hosts

No action is needed. Because macOS/Windows Docker Desktop exposes no `/dev/dri`
and non-Intel Linux hosts have no `iris`-capable device, those environments
simply do not load `compose.override.intel.yaml` and keep the default
software-rendering behaviour from [`compose.yaml`](../../compose.yaml).

## References

| Source | Purpose |
|---|---|
| [`compose.override.gpu.yaml`](../../compose.override.gpu.yaml) | Existing NVIDIA overlay used as the structural starting point |
| [`compose.yaml`](../../compose.yaml) | `simulator` service definition and default software-rendering env |
| [`services/simulator/Dockerfile`](../../services/simulator/Dockerfile) | Mesa render stack and rendering env baked into the image |
| <https://dgpu-docs.intel.com/> | Intel graphics driver and compute runtime documentation |
| <https://docs.mesa3d.org/envvars.html> | Mesa `iris` driver and `LIBGL_ALWAYS_SOFTWARE` behaviour |
| <https://github.com/intel/media-driver> | Intel Media Driver (`iHD`) for VA-API |
| <https://github.com/intel/compute-runtime> | Intel OpenCL and Level Zero compute runtime |
| <https://docs.openvino.ai/> | OpenVINO toolkit, device plugins (CPU/GPU/NPU) |
| <https://docs.docker.com/reference/compose-file/services/#devices> | Compose `devices:` mapping reference |
| <https://gazebosim.org/docs/latest/sensors/> | Gazebo/OGRE GPU rendering context |
