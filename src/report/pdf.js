import { launchBrowser } from '../browser.js';

/**
 * Render branded report HTML to a PDF buffer using a headless browser.
 * Returns null if no browser is available, so callers can fall back to the
 * browser-side "print to PDF" view. Never throws for a missing browser.
 */
export async function renderPDF(html) {
  const browser = await launchBrowser();
  if (!browser) return null;
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    return await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
  } catch {
    return null;
  } finally {
    await browser.close().catch(() => {});
  }
}
