// S5b - Golden Layout NATIVE pop-out + BUTTON-BASED DOCK-BACK, validated with a
// real Chromium.
//
// MODEL (2026-07-20, current): the popped-out window shows Golden Layout's
// NATIVE pop-in button (`.lm_popin`, added via layout.checkAddDefaultPopinButton()
// in the sub-window branch of onMount). Clicking `.lm_popin` emits GL's `popIn`
// event on the child's layout; the parent BrowserPopout re-docks the panel into
// the MAIN canvas and — because settings.popInOnClose is false — closes the
// popout window. This path uses GL's `popIn` event, NOT `beforeunload`, so it
// works for ALL panels including the passive ones (Simulator, ROS Status) that
// never receive a user gesture.
//
// This supersedes the OLD auto-dock-back-ON-CLOSE model: closing the popout via
// the OS "X" (or window.close()) NO LONGER docks the panel back — it just leaves
// the panel closed (reopen from the Panels menu). The final optional test below
// documents that intended non-dock behavior.
//
// REQUIRES a real Chromium (Playwright's bundled headless chromium honors a
// click-initiated window.open) — the integrated VS Code browser blocks it.
// Each panel runs as an independent test() from a fresh context (clean
// localStorage: uberos.layout.v1) so every panel starts present in the default
// layout and a failure in one still reports the others.
import { test, expect } from '@playwright/test';

// Panel identity in the MAIN canvas:
//  - iframe panels: iframe.panel-frame whose src contains `match`
//  - ros-status:    a .panel-body element (non-iframe)
// `title` is the Golden Layout tab title (.lm_title) used to find the stack.
const PANELS = [
  { key: 'simulator', title: 'Simulator', kind: 'iframe', match: 'novnc' },
  { key: 'terminal', title: 'Terminal', kind: 'iframe', match: '/terminal/' },
  { key: 'editor', title: 'Code Editor', kind: 'iframe', match: '/editor/' },
  { key: 'ros-status', title: 'ROS Status', kind: 'body', match: null },
];

// Runs in-page: count matching panel instances and measure the first one.
// Returns { count, w, h } — count is how many copies exist (dup detector),
// w/h are offsetWidth/offsetHeight of the first (zero-size bug detector).
function measurePanel(spec) {
  let els;
  if (spec.kind === 'iframe') {
    els = [...document.querySelectorAll('iframe.panel-frame')].filter((f) =>
      f.src.includes(spec.match)
    );
  } else {
    els = [...document.querySelectorAll('.panel-body')];
  }
  if (els.length === 0) return { count: 0, w: 0, h: 0 };
  const el = els[0];
  return { count: els.length, w: el.offsetWidth, h: el.offsetHeight };
}

// Wait until the default layout has fully rendered: all three iframe panels
// plus the ROS Status body. Guards against popping out before GL is ready.
async function waitForAllPanels(page) {
  await page.waitForFunction(
    () =>
      document.querySelectorAll('iframe.panel-frame').length >= 3 &&
      document.querySelectorAll('.panel-body').length >= 1,
    undefined,
    { timeout: 30_000 }
  );
}

// Drive Golden Layout's real pop-out control for THIS stack. GL opens the child
// window via window.open, which surfaces as a 'page' event on the context.
// Returns the popup Page once its DOM is ready.
async function popOutPanel(page, context, spec) {
  const header = page.locator('.lm_header', {
    has: page.locator('.lm_title', { hasText: spec.title }),
  });
  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    header.locator('.lm_popout').click(),
  ]);
  await popup.waitForLoadState('domcontentloaded');
  return popup;
}

test.describe('S5b - native pop-out, pop-in BUTTON docks back at non-zero size', () => {
  for (const spec of PANELS) {
    test(`${spec.title}: pop out -> click pop-in button -> docks back visibly`, async ({
      page,
      context,
    }) => {
      await page.goto('/');
      await waitForAllPanels(page);

      // Sanity: panel present in the main canvas before pop-out.
      const before = await page.evaluate(measurePanel, spec);
      expect(before.count, `${spec.title} present before pop-out`).toBe(1);

      // 1) Pop the panel out via GL's native header pop-out control.
      const popup = await popOutPanel(page, context, spec);

      // 2) Assert the panel MOVED OUT: it renders in the popup and is REMOVED
      //    from the main canvas.
      await expect
        .poll(async () => (await popup.evaluate(measurePanel, spec)).count, {
          message: `${spec.title} present in popped-out window`,
          timeout: 20_000,
        })
        .toBeGreaterThanOrEqual(1);

      await expect
        .poll(async () => (await page.evaluate(measurePanel, spec)).count, {
          message: `${spec.title} removed from main canvas after pop-out`,
          timeout: 20_000,
        })
        .toBe(0);

      // 3) The popup MUST show GL's native pop-in button (added by
      //    checkAddDefaultPopinButton() in the sub-window branch). This is the
      //    only supported dock-back trigger in the current model.
      const popinBtn = popup.locator('.lm_popin');
      await expect(popinBtn, `${spec.title} popup shows native pop-in button`).toBeVisible({
        timeout: 20_000,
      });

      // 4) Click the pop-in button IN THE POPUP. It emits GL's 'popIn' on the
      //    child layout; the parent BrowserPopout re-docks the panel and (because
      //    popInOnClose:false) closes this popout window. Works for passive
      //    panels too — no beforeunload dependency.
      await popinBtn.click();

      // 5a) The popup CLOSES as part of the pop-in path.
      await expect
        .poll(() => popup.isClosed(), {
          message: `${spec.title} popup closes after pop-in`,
          timeout: 20_000,
        })
        .toBe(true);

      // 5b) The panel is back in the MAIN canvas at non-zero size, exactly once.
      //     Poll rather than sleep: dock-back runs after GL's popIn re-add plus
      //     the container ResizeObserver reflow.
      await expect
        .poll(async () => await page.evaluate(measurePanel, spec), {
          message: `${spec.title} docked back at non-zero size`,
          timeout: 20_000,
        })
        .toMatchObject({ count: 1 });

      const after = await page.evaluate(measurePanel, spec);
      // count === 1 => no duplicate; w/h > 0 => not the zero-size bug.
      expect(after.count, `${spec.title} exactly one instance (no duplicate)`).toBe(1);
      expect(after.w, `${spec.title} docked-back width > 0 (got ${after.w})`).toBeGreaterThan(0);
      expect(after.h, `${spec.title} docked-back height > 0 (got ${after.h})`).toBeGreaterThan(0);
    });
  }

  // Intended NON-dock behavior: closing the popout via the OS window path
  // (window.close()) does NOT dock the panel back. With popInOnClose:false and
  // the custom windowClosed net removed, only the pop-in button re-docks; an OS
  // close just leaves the panel closed (reopen from the Panels menu). We use the
  // Terminal panel as the representative case (stable, gesture-independent).
  test('OS close (window.close) does NOT dock the panel back', async ({ page, context }) => {
    const spec = PANELS.find((p) => p.key === 'terminal');

    await page.goto('/');
    await waitForAllPanels(page);
    expect((await page.evaluate(measurePanel, spec)).count, 'Terminal present before pop-out').toBe(
      1
    );

    const popup = await popOutPanel(page, context, spec);

    // Panel moved out of the main canvas.
    await expect
      .poll(async () => (await page.evaluate(measurePanel, spec)).count, {
        message: 'Terminal removed from main canvas after pop-out',
        timeout: 20_000,
      })
      .toBe(0);

    // Close the popout the OS way (script-initiated window.close = same unload
    // path as the OS "X" button).
    await popup.evaluate(() => window.close()).catch(() => {});
    await expect
      .poll(() => popup.isClosed(), { message: 'popup closed', timeout: 20_000 })
      .toBe(true);

    // The panel must STAY closed — no auto dock-back on OS close. Give any stray
    // async re-add a generous window to (not) happen, then assert absence.
    await page.waitForTimeout(2_000);
    const after = await page.evaluate(measurePanel, spec);
    expect(after.count, 'Terminal stays closed after OS close (no auto dock-back)').toBe(0);
  });
});
