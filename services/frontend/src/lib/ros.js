// Use ESM named imports from roslib v2.x instead of the legacy browser bundle.
// roslib v2.x publishes an ESM build with named exports (e.g., Ros, Topic).
import { Ros } from 'roslib';

// Single shared rosbridge connection with exponential-backoff reconnect.
// roslibjs does not reconnect automatically (research: roslibjs), so we schedule
// retries ourselves. The connection lifecycle is independent of any panel: a
// browser view closing never stops the underlying ROS workload (INV-05).

function rosbridgeUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ros`;
}

const listeners = new Set();
let ros = null;
let attempt = 0;
let status = 'connecting';

function emit() {
  for (const fn of listeners) {
    fn({ status, ros });
  }
}

function scheduleReconnect() {
  const delay = Math.min(1000 * 2 ** attempt, 30000);
  attempt += 1;
  setTimeout(connect, delay);
}

function connect() {
  status = 'connecting';
  emit();

  ros = new Ros({ url: rosbridgeUrl() });

  ros.on('connection', () => {
    attempt = 0;
    status = 'connected';
    emit();
  });

  ros.on('error', () => {
    status = 'error';
    emit();
  });

  ros.on('close', () => {
    status = 'closed';
    emit();
    scheduleReconnect();
  });
}

// Subscribe to connection-status changes. Returns an unsubscribe function.
export function onRosStatus(fn) {
  listeners.add(fn);
  fn({ status, ros });
  return () => listeners.delete(fn);
}

export function getRos() {
  return ros;
}

export function startRos() {
  if (!ros) {
    connect();
  }
}
