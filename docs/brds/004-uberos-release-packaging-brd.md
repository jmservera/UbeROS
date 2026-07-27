---
title: UbeROS Release, Packaging and Distribution BRD
description: Business requirements for a semantic-versioned release pipeline, distributable packages, and a guided installer that runs from released artifacts or from local source, with the ROS workspace decoupled from the repository.
author: jmservera
ms.date: 07/26/2026
ms.topic: concept
---

# UbeROS Release, Packaging and Distribution BRD

Version 0.1.0 | Status Approved | Owner jmservera | Related [Workspace Management BRD](./001-uberos-workspace-management-brd.md) · [Workspace Enhancements BRD](./002-uberos-workspace-enhancements-brd.md) · [uberos-init PRD](../prds/001-uberos-init.md) · Issues [#29](https://github.com/jmservera/UbeROS/issues/29), [#19](https://github.com/jmservera/UbeROS/issues/19), [#30](https://github.com/jmservera/UbeROS/issues/30)

## Progress Tracker

| Phase | Done | Gaps | Updated |
|-------|------|------|---------|
| Context | 100% | Initiative framing confirmed (release + installer + workspace decoupling from #29) | 2026-07-26 |
| Problem & Drivers | 100% | Clone-and-build friction and repo pollution confirmed | 2026-07-26 |
| Objectives & Metrics | 100% | Registry, channel, version source, beta channel, and <5-min first-run target confirmed | 2026-07-26 |
| Stakeholders | 100% | Owner jmservera; delivery team; reviewers deliberately unassigned | 2026-07-26 |
| Scope | 100% | Packaging decisions plus GPU-overlay in / ARM+Apple-silicon deferred confirmed | 2026-07-26 |
| Requirements | 100% | Requirements and acceptance criteria confirmed | 2026-07-26 |

## 1. Business Context and Background

UbeROS delivers a browser-based ROS development environment as a multi-service Docker
Compose stack (proxy, frontend, ROS, Gazebo/turtlesim simulators, code editor, control
plane) served behind a single Nginx reverse proxy. The Init, Workspace Management, and
Workspace Enhancements milestones made the stack functional and usable: it launches with
`docker compose up` from a cloned repository and builds every image locally from source.

Today the *only* supported way to run the solution is to clone the repository and build it.
This is acceptable for contributors but creates friction for anyone who simply wants to *use*
UbeROS: every start is a full local build, there is no versioned, reproducible artifact to
run, and the `workspace/` directory ships inside the repository so day-to-day ROS work makes
the checkout "dirty" and risks accidental commits of user content (Issue #29).

This BRD captures the business needs for a **release and distribution capability**: an
automated pipeline that produces **semantically versioned** ([semver.org](https://semver.org))
packages, a **guided installer** that provisions and runs the stack from those released
packages, and a **local mode** so the same installer can run directly from source without any
published packages (for development and testing). It also decouples the ROS workspace from the
repository so using the product no longer pollutes the source tree.

Confirmed platform decisions frame this work: releases are versioned from the **Git tag**
(the single source of truth), per-service images are published to **GitHub Container Registry
(ghcr.io)**, and the versioned **release bundle** is distributed through **GitHub Releases**.
The product is currently in an **early-beta** phase, so the versioning scheme must support
**pre-release identifiers** (for example `-beta`) alongside stable releases.

## 2. Problem Statement and Business Drivers

### Problem Statement

There is no releasable, versioned form of UbeROS. Users must clone the repository and build
all images locally to run anything, there is no reproducible artifact tied to a version, no
guided setup, and the ROS workspace lives inside the repository — so normal use dirties the
checkout and risks committing user-specific data. Contributors and testers also lack a way to
exercise the installer without first publishing packages.

### Business Drivers

| Driver | Description |
|--------|-------------|
| Adoption and onboarding | Let users run UbeROS from a versioned release without cloning and building the whole project. |
| Reproducibility | Tie every deployment to an immutable, semantically versioned artifact set so results are repeatable and supportable. |
| Repository hygiene | Keep user-generated workspace content out of the source tree to prevent accidental commits (Issue #29). |
| Testability | Allow the installer to run from local source (no packages) so it can be validated on every change. |
| Release discipline | Establish an automated, auditable release process (versioning, changelog, integrity) that future capabilities build on. |
| Configurability | Support build-/install-time selection of optional packages and sample content (Issues #19, #30) without hand-editing config. |

## 3. Business Objectives and Success Metrics

| Objective ID | Objective | KPI / Success Metric | Baseline | Target | Timeframe | Priority |
|--------------|-----------|----------------------|----------|--------|-----------|----------|
| BO-1 | Run UbeROS from a versioned release | A user can install and start a tagged release without cloning/building the repo, reaching the UI quickly on a clean host | Clone-and-build only | One-command install from a release; first run reachable in **under 5 minutes** on a clean host | This iteration | Must |
| BO-2 | Reproducible, semver-compliant artifacts | Every release produces immutable artifacts versioned from the Git tag per semver.org, including pre-release (`-beta`) builds | No versioned artifacts | Artifacts published and pinned per release | This iteration | Must |
| BO-3 | Automated release pipeline | Tagging a release triggers a pipeline that builds, versions, and publishes all packages | Manual local build | Pipeline produces a complete release on tag | This iteration | Must |
| BO-4 | Installer runs with or without packages | The same installer provisions from released packages (release mode) or builds from source (local mode) | Only local build | Both modes install and run the stack | This iteration | Must |
| BO-5 | Workspace decoupled from repository | After install, normal ROS work does not modify tracked repository files | Workspace inside repo | `git status` stays clean during use | This iteration | Must |
| BO-6 | Guided, repeatable configuration | Installer prompts for required values with sensible defaults and a non-interactive option | Manual `.env` editing | Guided + non-interactive install both supported | This iteration | Should |
| BO-7 | Version transparency | The running system reports its release version | No version surfaced | Version visible in UI and/or CLI (initial release `0.4.0-beta`) | This iteration | Should |

## 4. Stakeholders and Roles

| Stakeholder | Role | Interest |
|-------------|------|----------|
| jmservera | Product owner / sponsor | Prioritizes work, accepts deliverables |
| End user / evaluator | Consumer persona | Install and run a release with minimal effort |
| ROS Developer (primary persona) | End user | Keep personal workspace outside the repo; upgrade safely |
| Platform Maintainer | Operator | Configure install, pin versions, run upgrades |
| Release Manager | Operator | Cut versioned releases, publish artifacts, maintain changelog |
| Squad (Morpheus, Neo, Trinity, Switch, Tank) | Delivery team | Design and implement pipeline, packaging, and installer |

> Note: per-requirement reviewers are intentionally left unassigned for now.

## 5. Scope

### In Scope

- An automated release pipeline that builds and publishes versioned packages when a Git release tag is pushed.
- Semantic versioning ([semver.org](https://semver.org)) of all released artifacts, derived from the Git tag, including pre-release (`-beta`) and build-metadata handling.
- Publishing versioned container images for every service to GitHub Container Registry (ghcr.io).
- A versioned release bundle (compose files, installer, environment template, checksums, release notes) distributed through GitHub Releases.
- A guided installer supporting two modes: release mode (pull pinned published packages) and local mode (build from source, no packages required).
- Non-interactive installation via flags or a config file, with sensible defaults.
- Decoupling the ROS workspace from the repository (external/user-defined location; optional use of an existing Git repository for the workspace) per Issue #29.
- Configurable selection of optional package/sample-content sets at install/build time (Issues #19, #30).
- Support for x86_64 hosts including the GPU overlays (`compose.override.{wsl,intel,gpu}.yaml`).
- Surfacing the running release version to the user.
- Install/re-run support to update configuration and upgrade to a newer release.
- Artifact integrity verification (checksums) for released packages.

### Out of Scope

- Publishing to third-party marketplaces or OS package managers (apt, brew, winget) this iteration.
- Signing artifacts with a code-signing/notarization authority; deferred to the Security & Quality track (Issue [#15](https://github.com/jmservera/UbeROS/issues/15)). Checksums are in scope now.
- Auto-update/self-update daemons (installer re-run is the supported upgrade path).
- ARM and Apple-silicon (arm64) images/installer support; deferred to a later iteration (README invites tester/developer help, especially for Apple silicon).
- Changing the single-reverse-proxy topology or host-publishing backend ports.
- Implementing the specific optional ROS/learning packages themselves (Issues #19, #30); this BRD makes such selections configurable but does not build the individual packages.

### Assumptions

- Init constraints hold: single ingress, backend ports internal, single-user now with multi-user not precluded (PRD A-1, A-2).
- Docker and Docker Compose remain the runtime; releases are consumed with the same tooling.
- GitHub Container Registry (ghcr.io) is the registry for published images, and GitHub Releases is the distribution channel for the release bundle, both alongside the repository.
- The Git tag is the single source of truth for a release version.
- ROS distribution and Gazebo release remain parameterized via `.env` (ADR-001) and flow through into releases.

## 6. Current and Future Business Processes

### Current State

- The user clones the repository and runs `docker compose up`, which builds every image locally on first run.
- There is no version stamped on a run; "what am I running" is answered only by the current commit.
- The `workspace/` directory is committed in the repository, so ROS work dirties the checkout and can be committed accidentally.
- Optional packages and sample content are changed by editing Dockerfiles/config by hand.

### Future State

- A maintainer tags a release; the pipeline builds, versions (semver), and publishes all service images plus a release bundle with a changelog and checksums.
- A user downloads the installer (or bundle), runs it, answers a few prompts (or passes a config file), and the stack starts from pinned, published packages — no clone or manual build.
- A contributor runs the same installer in local mode against a source checkout to build and test without any published packages.
- The ROS workspace is provisioned outside the repository at a user-chosen location (optionally an existing Git repo), so `git status` on the source stays clean during normal use.
- The running version is visible to the user, and re-running the installer upgrades configuration or moves to a newer release.

## 7. Business Requirements

| BR ID | Description | Linked Objective | Stakeholders | Acceptance Criteria | Priority |
|-------|-------------|------------------|--------------|---------------------|----------|
| BR-001 | An automated release pipeline builds and publishes all release artifacts when a Git version tag is pushed. | BO-3 | Release Manager, Squad | Pushing a version tag runs the pipeline to completion and produces the full artifact set with no manual build steps. | Must |
| BR-002 | All released artifacts are versioned using Semantic Versioning 2.0.0 (`MAJOR.MINOR.PATCH`, with optional pre-release such as `-beta` and build metadata), derived from the Git tag as the single source of truth. | BO-2 | Release Manager | Version strings validate against semver.org rules, match the Git tag, and a documented rule maps change types to version increments. | Must |
| BR-003 | The pipeline publishes a versioned container image for every service to GitHub Container Registry (ghcr.io), tagged with the release version. | BO-1, BO-2 | Release Manager, Platform Maintainer | For a given release, each service image is pullable from ghcr.io by its version tag. | Must |
| BR-004 | The pipeline produces a versioned release bundle (compose file(s), installer, environment template, checksums, release notes/changelog) published as a GitHub Release. | BO-1, BO-3 | Release Manager | The GitHub Release for a version contains the bundle with all listed items and matching version metadata. | Must |
| BR-005 | The installer can provision and start the stack from published packages (release mode) using version-pinned image references, without building from source. | BO-1, BO-4 | End user, Platform Maintainer | On a machine with no source checkout, the installer pulls pinned images and the stack becomes reachable through the proxy in under 5 minutes on a clean host. | Must |
| BR-006 | The installer can provision and start the stack from local source (local mode) by building images, requiring no published packages. | BO-4 | ROS Developer, Squad | From a source checkout with no release published, the installer builds and starts the stack; used to test the installer locally. A clean-host build is simulated with `docker compose build --no-cache --parallel && docker compose up -d`. | Must |
| BR-007 | The installer runs a guided setup that prompts for required configuration with sensible defaults and generates the configuration files. | BO-6 | End user | A first-time user completes setup by accepting defaults or answering prompts; required config files are created automatically. | Should |
| BR-008 | The installer supports non-interactive installation via command-line flags and/or a configuration file. | BO-6 | Platform Maintainer | Providing all values non-interactively installs and starts the stack with no prompts. | Should |
| BR-009 | The installer provisions the ROS workspace at a user-defined location outside the repository and does not modify tracked repository files during normal use. | BO-5 | ROS Developer | After install, running the stack and editing workspace files leaves `git status` of the source clean. | Must |
| BR-010 | The installer can use an existing Git repository as the ROS workspace instead of a fresh template. | BO-5 | ROS Developer | Pointing the installer at an existing workspace repo mounts it as the ROS workspace without copying it into the source tree. | Should |
| BR-011 | Re-running the installer updates configuration and upgrades an existing installation to a selected release. | BO-1, BO-6 | Platform Maintainer | Re-running against an existing install applies new settings and/or switches to a newer release without a clean reinstall. | Should |
| BR-012 | The running system reports its release version to the user. | BO-7 | End user, Platform Maintainer | The active release version is visible (UI and/or CLI) and matches the installed release. | Should |
| BR-013 | Released packages include integrity checksums that the installer can verify before use. | BO-2 | Platform Maintainer | The installer detects and rejects an artifact whose checksum does not match the published value. | Should |
| BR-014 | The installer supports Linux, macOS, and WSL. | BO-1, BO-4 | End user | The installer completes and starts the stack on Linux, macOS, and WSL environments. | Should |
| BR-015 | Optional package/sample-content selections (e.g., turtlesim and other learning packages, ROS/vscode tooling per Issues #19 and #30) are configurable at install/build time rather than by hand-editing files. | BO-6 | ROS Developer | The installer exposes documented options that include/exclude the optional package sets; selections are honored in the running stack. | Should |
| BR-016 | The release covers x86_64 hosts including the GPU overlays (`compose.override.{wsl,intel,gpu}.yaml`); ARM/Apple-silicon are not targeted this iteration. | BO-1 | Platform Maintainer | Release-mode and local-mode installs work on x86_64 with the GPU overlays; ARM/Apple-silicon are documented as unsupported for now. | Should |

## 8. Data and Artifact Requirements

| Artifact | Description | Versioning / Format |
|----------|-------------|---------------------|
| Service container images | One image per service (proxy, frontend, ros, gazebo, turtlesim, editor, control). | Tagged with release semver; immutable per release; published to ghcr.io. |
| Release bundle | Compose file(s), installer, `.env` template, checksums, release notes. | Named/organized by release semver; published as a GitHub Release. |
| Version manifest | Single source of truth mapping a release to its artifact versions; the Git tag is the authoritative version. | Semver; machine-readable. |
| Changelog / release notes | Human-readable summary of changes per release. | One entry per released version; surfaced in the GitHub Release. |
| Checksums | Integrity values for downloadable artifacts. | Published alongside each GitHub Release. |

## 9. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Release mode and local mode drift apart | Installer passes locally but fails on releases (or vice versa) | Single installer with a mode flag sharing one compose definition; test both modes in CI |
| Version pinning omitted (`latest` used) | Non-reproducible installs | Require version-pinned image references in the release bundle; fail the pipeline if unpinned |
| Registry access/auth for published images | Users cannot pull packages | Prefer a public registry tied to the repo; document any auth; local mode as fallback |
| Workspace decoupling breaks volume mounts | Lost or misplaced user data | Validate user-provided paths; provide a migration path for the existing `workspace/` folder |
| Semver misapplied (breaking change as patch) | Consumers upgrade unexpectedly break | Document increment rules; review version bump as part of release |
| Cross-platform shell differences (Linux/macOS/WSL) | Installer fails on some hosts | Keep the installer POSIX-portable; test each target in CI |

## 10. Resolved Decisions

1. Registry: per-service images publish to **GitHub Container Registry (ghcr.io)** alongside the repository (BR-003).
2. Distribution channel: the versioned **release bundle** ships through **GitHub Releases** (BR-004); the bundle is the distributable (no standalone image tarball this iteration).
3. Version source: the **Git tag** is the single source of truth for the release version (BR-002).
4. Versioning phase: the product is in **early beta**, so the scheme uses semver **pre-release** identifiers (for example `-beta`) until a stable `1.0.0`. The **initial release version is `0.4.0-beta`**.
5. Optional packages: configurable optional-package selection (Issues #19, #30) is **in scope** this iteration (BR-015); implementing the individual packages themselves is not.
6. Signing: artifact **signing** is **deferred** to the Security & Quality track (Issue [#15](https://github.com/jmservera/UbeROS/issues/15)); checksums (BR-013) cover integrity for now.
7. First-run target: a release-mode install reaches the UI in **under 5 minutes** on a clean host; a clean-host build is simulated with `docker compose build --no-cache --parallel && docker compose up -d`. Reference: a no-cache full build completes in ~3.1 minutes on an 11th-gen Intel i7 with 32 GB RAM (BO-1, BR-005/BR-006).
8. Platform coverage: **x86_64 including GPU overlays** is in scope now (BR-016); **ARM/Apple-silicon is deferred** to a later iteration, with a README call for tester/developer help (especially Apple silicon).

## 11. Traceability and Issue Closure

### How these issues close

Referencing an issue in this document does **not** close it. A GitHub issue is
closed only when a pull request (or commit) merged into the default branch
contains a **closing keyword** — `Closes #N`, `Fixes #N`, or `Resolves #N`.
Because each issue maps to several requirements, an issue should be closed **only
by the final PR** that completes all of its mapped requirements; earlier partial
PRs should reference the issue (`Refs #N`) without a closing keyword.

### Issue → requirement mapping

| Issue | Scope in this BRD | Requirements | Closes when |
|-------|-------------------|--------------|-------------|
| [#29](https://github.com/jmservera/UbeROS/issues/29) Solution Packaging | Installer, guided/non-interactive setup, workspace decoupling, upgrade, cross-platform | BR-005, BR-006, BR-007, BR-008, BR-009, BR-010, BR-011, BR-014 | All mapped BRs shipped and accepted |
| [#19](https://github.com/jmservera/UbeROS/issues/19) Configurable learning packages | Install/build-time selection of optional sample content (e.g., turtlesim) | BR-015 | BR-015 shipped with the learning-package option |
| [#30](https://github.com/jmservera/UbeROS/issues/30) ROS/vscode packages in editor | Install/build-time selection of ROS/vscode tooling in the editor image | BR-015 | BR-015 shipped with the ROS/vscode tooling option |

> Issue [#15](https://github.com/jmservera/UbeROS/issues/15) (Security & Quality)
> is **not** closed by this BRD; artifact signing is only *deferred* to that track
> (see Resolved Decision 6).

### Delivery checklist

- [ ] #29 — packaging & installer BRs (BR-005–BR-011, BR-014) merged and accepted
- [ ] #19 — learning-package selection option (BR-015) merged
- [ ] #30 — ROS/vscode tooling selection option (BR-015) merged
- [ ] Final PR for each issue carries `Closes #N`
