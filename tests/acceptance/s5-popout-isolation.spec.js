// S5 - A panel can open in a separate browser window without terminating the
// underlying session.
// Machine-testable version (research report): all services remain running and
// the ROS graph is unchanged after the popped-out window closes (INV-01/INV-05:
// browser-view lifecycle is independent of the workload lifecycle).
import { test, expect } from '@playwright/test';
import { SERVICES, healthSnapshot } from '../helpers/stack.js';

test.describe('S5 - pop-out does not terminate the workload', () => {
  test('closing a detached window keeps every service healthy', async ({ page, context }) => {
    await page.goto('/');

    const before = healthSnapshot();
    for (const svc of SERVICES) {
      expect(before[svc], `${svc} healthy before pop-out`).toBe('healthy');
    }

    // Simulate a panel popped out into its own browser window (same session).
    const popup = await context.newPage();
    await popup.goto('/gzweb/');
    await popup.waitForTimeout(2000);

    // Closing the detached view must not stop any workload container.
    await popup.close();
    await page.waitForTimeout(2000);

    const after = healthSnapshot();
    for (const svc of SERVICES) {
      expect(after[svc], `${svc} still healthy after pop-out closed`).toBe('healthy');
    }
    expect(after).toEqual(before);

    // The original canvas is still live and connected.
    await expect(page.locator('iframe.panel-frame').first()).toBeAttached();
  });
});
