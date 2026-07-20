# ADR-004: Frontend Framework and Window Manager

- Status: Accepted — Implemented (low confidence on framework; window manager firm)
- Implementation: `services/frontend` Svelte + `golden-layout` 2.6.0
- Date: 2026-07-17
- Deciders: jmservera (product), Switch (technical)
- Related: PRD U-D4, research R8

## Context

The canvas UI needs iframe panels with drag, resize, minimize, tabs, and
pop-out. The window-manager choice matters more than the framework: Golden
Layout v2 supports all of these natively, including pop-out, which directly
serves the hardest requirement (F-07/S5). Framework candidates were Svelte,
React, Vue, and vanilla JS.

## Decision

Use **Svelte + Golden Layout v2**. Svelte gives a small bundle and fast,
Vite-native development. Golden Layout v2 provides native iframe panels and
pop-out. Browsers supported for Init: latest stable Chrome and Edge only.

## Consequences

- Pop-out and reattach are handled by the library rather than custom code.
- Confidence in the framework choice is low (no benchmark was run); React +
  Golden Layout v2 remains an equally viable swap if the team prefers it.
- Vue + vue-grid-layout was rejected because it lacks native pop-out and has
  weaker iframe support.
