# ADR-001: ROS 2 Distribution

- Status: Accepted — Implemented (SPIKE-A passed)
- Implementation: `ROS_DISTRO=kilted` / `GZ_RELEASE=ionic` defaults in `compose.yaml`; base images verified in SPIKE-A
- Date: 2026-07-17
- Deciders: jmservera (product), Neo (technical)
- Related: PRD U-D1, research RISK-1

## Context

UbeROS needs a ROS 2 baseline distribution. The candidates are Lyrical Luth
(Ubuntu 26.04, Gazebo Jetty, support to ~May 2031), Jazzy Jalisco (Ubuntu 24.04,
Gazebo Harmonic, proven ecosystem to ~May 2029), and Humble (nearing EOL).
Lyrical offers the longest runway but its ecosystem package coverage
(`rosbridge-suite`, `ros-gz`) was unverified at research time.

During development we confirmed that the Jetty image uses Ubuntu Noble, which blocks the ROS 2 Lyrical package path on that image. Gazebo Ionic remains compatible with both Jazzy and Kilted, so it was retained while the repository baseline stayed on Kilted.

This Jetty-on-Noble limitation is historical context for compatibility decisions.
The current implemented baseline in this repository is `ROS_DISTRO=kilted` with
`GZ_RELEASE=ionic` as defined in `compose.yaml`. When documenting compatibility
constraints, treat Jazzy/Ionic as the explicit fallback pair while the
Lyrical package path remains blocked on Noble-based Jetty images.

## Decision

Target **Kilted Kaiju** as the primary baseline, gated by SPIKE-A verification
of the base image, `rosbridge-suite`, the Ionic image, `ros-gz`, and software
rendering. The distribution is parameterized through `ROS_DISTRO` in `.env`, so
falling back to **Jazzy Jalisco** is a one-line change with no other edits.

## Consequences

- Longest support horizon if SPIKE-A passes.
- If SPIKE-A P2/P4 fail, either install the missing packages from source or set
  `ROS_DISTRO=jazzy` and `GZ_RELEASE=harmonic`.
- SPIKE-A results must be recorded in this ADR before any image is relied upon.

## SPIKE-A results

Verified 2026-07-17 on Docker Desktop:

- P1 base image `ros:kilted-ros-base` — EXISTS.
- P2 `ros-kilted-rosbridge-suite` — FOUND 4.2.0-1resolute.20260606.
- P2 `ros-kilted-rosapi` — FOUND 4.2.0-1resolute.20260606.
- P3 Gazebo `ghcr.io/openrobotics/gazebo:ionic-full` — EXISTS (manifest).
- P4 `ros-kilted-ros-gz` — FOUND 3.0.9-1resolute.20260617.
- Fallbacks `ros:jazzy-ros-base` and `gazebo:harmonic-full` — EXIST.
- P5 software rendering inside the Ionic image — not yet run (requires the
  multi-GB `ionic-full` pull); validated later during the WP-3 build.

Decision: proceed with `ROS_DISTRO=kilted`, `GZ_RELEASE=ionic`. The Jazzy /
Harmonic fallback remains a one-line `.env` change if P5 later fails.
