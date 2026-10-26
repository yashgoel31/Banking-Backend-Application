import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Locator, Page } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SHOTS_DIR = path.resolve(here, '..', '..', '..', 'docs', 'screenshots');

/**
 * Saves a documentation screenshot (docs/screenshots/<name>.png). Secrets on screen (authenticator keys, QR codes,
 * withdrawal codes) are masked with `mask`.
 */
export async function shot(page: Page, name: string, options: { mask?: Locator[]; fullPage?: boolean } = {}): Promise<void> {
  if (process.env.E2E_SCREENSHOTS === 'false') return;
  // Let charts and transitions settle
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(SHOTS_DIR, `${name}.png`),
    fullPage: options.fullPage ?? true,
    mask: options.mask,
    animations: 'disabled',
  });
}

/** Same page in dark mode (theme preference is a per-device setting kept in localStorage) */
export async function darkShot(page: Page, name: string, options: { mask?: Locator[] } = {}): Promise<void> {
  await page.evaluate(() => {
    localStorage.setItem('banksphere:theme', 'dark');
    document.documentElement.classList.add('dark');
  });
  await shot(page, name, options);
  await page.evaluate(() => {
    localStorage.setItem('banksphere:theme', 'light');
    document.documentElement.classList.remove('dark');
  });
}
