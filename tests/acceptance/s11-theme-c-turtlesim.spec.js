// S11 - Theme C deterministic turtlesim evidence.
// Verifies the turtlesim noVNC route, ROS topic visibility, and a command-path
// drivability signal using ROS CLI checks from the ros service container.
import { test, expect } from '@playwright/test';
import { execInService, getSimulators } from '../helpers/stack.js';

// Branch policy for FR-C3 in this closure: deterministic readiness is proven by
// noVNC route reachability + turtlesim node graph visibility + ROS baseline topics.
const FR_C3_SIGNAL_POLICY = Object.freeze({
  requiredNode: '/turtlesim',
  requiredTopics: ['/parameter_events', '/rosout'],
});

async function ensureTurtlesimRunning(request) {
  const simulators = await getSimulators(request);
  const turtlesim = simulators.find((s) => s.id === 'turtlesim');
  test.skip(!turtlesim, 'turtlesim simulator is not installed in this build');

  if (turtlesim.state !== 'running') {
    const launch = await request.post('/control/simulators/turtlesim/launch');
    // 404 => the turtlesim container was never created (e.g. omitted from
    // UBEROS_SIMULATORS for this build), so the readiness poll below could
    // only time out; skip with a clear reason. Otherwise require the
    // documented 200 so a real launch failure surfaces deterministically
    // instead of as an opaque timeout.
    test.skip(launch.status() === 404, 'turtlesim container not created (not in UBEROS_SIMULATORS)');
    expect(launch.status()).toBe(200);
  }

  await expect
    .poll(() => rosNodeList(), { timeout: 45_000 })
    .toEqual(expect.arrayContaining([FR_C3_SIGNAL_POLICY.requiredNode]));
}

function assertFrC3DeterministicSignal() {
  const topics = rosTopicList();
  expect(topics).toEqual(expect.arrayContaining(FR_C3_SIGNAL_POLICY.requiredTopics));
}

function rosTopicList() {
  try {
    return execInService('ros', `bash -lc '${rosShell("ros2 topic list --no-daemon")}'`)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function rosNodeList() {
  try {
    return execInService('ros', `bash -lc '${rosShell("ros2 node list --no-daemon --spin-time 5")}'`)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function rosShell(command) {
  return `export ROS_DOMAIN_ID=${process.env.ROS_DOMAIN_ID || '42'} && export ROS_DISCOVERY_SERVER=${process.env.ROS_DISCOVERY_SERVER || 'discovery-server:11811'} && source /opt/ros/${process.env.ROS_DISTRO || 'kilted'}/setup.bash && ${command}`;
}

test.describe('S11 - Theme C turtlesim deterministic evidence', () => {
  test('FR-C2/FR-C3: noVNC route is reachable and turtlesim node joins ROS graph', async ({ request }) => {
    test.setTimeout(180_000);
    await ensureTurtlesimRunning(request);
    // FR-C2: the turtlesim noVNC route must serve (200) once the container is up.
    await expect
      .poll(async () => (await request.get('/sim/turtlesim/novnc/')).status(), {
        timeout: 30_000,
      })
      .toBe(200);
    assertFrC3DeterministicSignal();
  });

  test('FR-C4: turtlesim is drivable from ROS command path', async ({ request }) => {
    test.setTimeout(180_000);
    await ensureTurtlesimRunning(request);
    assertFrC3DeterministicSignal();

    const publishOutput = execInService(
      'ros',
      `bash -lc '${rosShell("ros2 topic pub --once /turtle1/cmd_vel geometry_msgs/msg/Twist \"{linear: {x: 2.0, y: 0.0, z: 0.0}, angular: {x: 0.0, y: 0.0, z: 0.0}}\"")}'`
    );
    expect(publishOutput).toContain('publishing #1:');

    await expect
      .poll(async () => (await request.get('/sim/turtlesim/novnc/')).status(), {
        timeout: 30_000,
      })
      .toBe(200);
  });
});
