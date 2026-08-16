import { existsSync } from 'node:fs';

/**
 * Render branded report HTML to a PDF buffer using playwright-core.
 * Resolves a Chromium binary from (in order):
 *   CHROMIUM_PATH env → the pre-installed /opt/pw-browsers/chromium → system 'chrome' channel.
 * Returns null if no browser / playwright-core is available, so callers can
 * fall back to browser-side "print to PDF". Never throws for missing browser.
 */
export async function renderPDF(html) {
  let chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch {
    return null; // playwright-core not installed
  }

  const launchOptions = { args: ['--no-sandbox', '--disable-dev-shm-usage'] };
  const explicit = process.env.CHROMIUM_PATH;
  const candidates = [explicit, '/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium/chrome'].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));

  let browser;
  try {
    if (found) {
      browser = await chromium.launch({ ...launchOptions, executablePath: found });
    } else {
      // Fall back to a system Chrome/Chromium install if present.
      browser = await chromium.launch({ ...launchOptions, channel: 'chrome' });
    }
  } catch {
    return null; // no usable browser binary
  }

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    const buffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    });
    return buffer;
  } finally {
    await browser.close().catch(() => {});
  }
}
