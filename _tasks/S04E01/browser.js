import { chromium } from 'playwright';

let browser = null;
let page = null;

export async function launch(headless = true, creds = {}) {
  if (browser) return;
  browser = await chromium.launch({
    headless,
    args: ['--disable-blink-features=AutomationControlled']
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  });
  // Inject credentials into every page before any scripts run.
  // They are never passed through tool arguments and will not appear in logs or traces.
  await context.addInitScript(`window.__OKO_CREDS = ${JSON.stringify(creds)};`);
  page = await context.newPage();
}

export function getPage() {
  if (!page) throw new Error('Browser not launched. Call launch() first.');
  return page;
}

export async function close() {
  if (browser) {
    await browser.close();
    browser = null;
    page = null;
  }
}
