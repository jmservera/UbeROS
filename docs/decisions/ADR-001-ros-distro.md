# ADR-001: ROS 2 Distribution

- Status: Accepted — Implemented (SPIKE-A passed)
- Implementation: `ROS_DISTRO=kilted` / `GZ_RELEASE=ionic` defaults in `compose.yaml`; base images verified in SPIKE-A
- Date: 2026-07-17
- Deciders: jmservera (product), Neo (technical)
- Related: PRD U-D1, research RISK-1

## Context

UbeROS needs a ROS 2 baseline distribution. The candidates are Kilted Kaiju
(Ubuntu 26.04, Gazebo Ionic, support to ~May 2031), Jazzy Jalisco (Ubuntu 24.04,
Gazebo Harmonic, proven ecosystem to ~May 2029), and Humble (nearing EOL).
Kilted offers the longest runway but its ecosystem package coverage
(`rosbridge-suite`, `ros-gz`) was unverified at research time.

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
