#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from '@playwright/test';

function runInherit(cmd, args) {
  return spawnSync(cmd, args, {
    stdio: 'inherit'
  });
}

// Fast path: if the expected Chromium executable is already present, skip install.
const executablePath = chromium.executablePath();
if (existsSync(executablePath)) {
  process.exit(0);
}

console.log('Playwright Chromium not found; installing browser binary...');

const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const install = runInherit(npxCmd, ['playwright', 'install', 'chromium']);
if (install.status !== 0) {
  process.exit(install.status ?? 1);
}
