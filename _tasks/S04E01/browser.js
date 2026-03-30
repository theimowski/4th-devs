import { chromium } from 'playwright';

let browser = null;
let page = null;

export async function launch(headless = true) {
  if (browser) return;
  browser = await chromium.launch({
    headless,
    args: ['--disable-blink-features=AutomationControlled']
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  });
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
