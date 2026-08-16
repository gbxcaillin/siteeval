import { existsSync } from 'node:fs';

/**
 * Launch a headless Chromium via playwright-core, resolving a binary from
 * CHROMIUM_PATH → the pre-installed /opt/pw-browsers/chromium → system 'chrome'.
 * Returns the browser, or null if playwright-core / a browser isn't available.
 * Never throws for a missing browser, so callers degrade gracefully.
 */
export async function launchBrowser() {
  let chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch {
    return null;
  }

  const opts = { args: ['--no-sandbox', '--disable-dev-shm-usage'] };
  const candidates = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium/chrome'].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));

  try {
    return found
      ? await chromium.launch({ ...opts, executablePath: found })
      : await chromium.launch({ ...opts, channel: 'chrome' });
  } catch {
    return null;
  }
}

/** Is a rendering browser available? (cheap check, no launch) */
export async function browserAvailable() {
  try {
    await import('playwright-core');
  } catch {
    return false;
  }
  const candidates = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium/chrome'].filter(Boolean);
  return candidates.some((p) => existsSync(p));
}
