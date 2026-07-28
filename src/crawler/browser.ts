import { chromium, type Browser, type Page } from "playwright";

let browserPromise: Promise<Browser> | null = null;

export function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-blink-features=AutomationControlled",
        "--no-first-run",
        "--password-store=basic",
        "--metrics-recording-only",
      ],
    });
    browserPromise.catch(() => {
      browserPromise = null;
    });
  }
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const p = browserPromise;
    browserPromise = null;
    const b = await p.catch(() => null);
    if (b) await b.close().catch(() => {});
  }
}

// Graceful shutdown: 배포 시 SIGTERM을 받으면 Chromium 프로세스가 남지 않도록 정리
let shutdownHandlerRegistered = false;
function ensureShutdownHandler(): void {
  if (shutdownHandlerRegistered) return;
  shutdownHandlerRegistered = true;
  process.once("SIGTERM", () => {
    void closeBrowser().finally(() => process.exit(0));
  });
  process.once("SIGINT", () => {
    void closeBrowser().finally(() => process.exit(0));
  });
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function newPage(browser: Browser) {
  ensureShutdownHandler();
  const ctx = await browser.newContext({
    userAgent: UA,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    viewport: { width: 1440, height: 900 },
  });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, "languages", { get: () => ["ko-KR", "ko", "en-US", "en"] });
    Object.defineProperty(navigator, "chrome", { get: () => ({ runtime: {} }) });
    (window as unknown as Record<string, unknown>).chrome = { runtime: {} };
    Object.defineProperty(screen, "colorDepth", { get: () => 24 });
    Object.defineProperty(screen, "pixelDepth", { get: () => 24 });
    Object.defineProperty(screen, "availHeight", { get: () => 1055 });
    Object.defineProperty(screen, "availWidth", { get: () => 1728 });
    Object.defineProperty(navigator, "memory", { get: () => ({ deviceMemory: 8, jsHeapSizeLimit: 4294967296 }) });
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  return { page, ctx };
}

/**
 * Playwright 페이지를 열고 작업 후 안전하게 컨텍스트를 닫는 래퍼.
 * finally로 ctx.close()를 보장하여 브라우저 컨텍스트 누수를 방지한다.
 */
export async function withBrowserPage<T>(
  fn: (page: Page) => Promise<T>,
): Promise<T> {
  const browser = await getBrowser();
  const { page, ctx } = await newPage(browser);
  try {
    return await fn(page);
  } finally {
    await ctx.close().catch(() => {});
  }
}