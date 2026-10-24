import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

export const API = process.env.E2E_API_URL ?? "http://127.0.0.1:4000";
export const LEGAL_VERSION = "2026-10-13";
// The API's dev mailer writes every message here (apps/api is its working directory).
const OUTBOX = resolve(process.cwd(), "../api/.mail-outbox");

export interface TestUser {
  email: string;
  password: string;
  token: string;
}

export function mailsFor(email: string): string[] {
  if (!existsSync(OUTBOX)) return [];
  const sanitized = email.replace(/[^a-z0-9]/gi, "_");
  return readdirSync(OUTBOX)
    .filter((f) => f.includes(sanitized) && f.endsWith(".txt"))
    .sort()
    .map((f) => readFileSync(join(OUTBOX, f), "utf8"));
}

export async function waitForMail(email: string, pattern: RegExp, since = 0, timeoutMs = 30_000): Promise<string> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const hit = mailsFor(email).slice(since).reverse().find((text) => pattern.test(text));
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no mail for ${email} matching ${pattern}`);
}

/// A brand-new verified account, created through the API like a real signup.
export async function createUser(request: APIRequestContext, label: string): Promise<TestUser> {
  const email = `pw-${label}-${Date.now()}@example.com`;
  const password = "correct-horse-battery-staple-42";
  const reg = await request.post(`${API}/auth/register`, {
    data: { email, password, displayName: "Playwright User", acceptedLegalVersion: LEGAL_VERSION },
  });
  expect(reg.status(), await reg.text()).toBe(201);
  const mail = await waitForMail(email, /token=/);
  const token = /[?&]token=([^&\s]+)/.exec(mail)![1];
  expect((await request.post(`${API}/auth/verify-email`, { data: { token } })).status()).toBe(204);
  const login = await request.post(`${API}/auth/login`, { data: { email, password } });
  expect(login.status()).toBe(200);
  const access = (await login.json()).data.accessToken as string;
  await request.post(`${API}/legal/accept`, { headers: { authorization: `Bearer ${access}` }, data: { version: LEGAL_VERSION } });
  return { email, password, token: access };
}

export async function signIn(page: Page, user: TestUser): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.locator("#password").fill(user.password);
  await page.getByRole("button", { name: /sign in|log in/i }).first().click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
  await skipWelcomeTour(page);
}

/// A new account gets a welcome tour on top of the page; skip it like a user would.
export async function skipWelcomeTour(page: Page): Promise<void> {
  const skip = page.getByRole("button", { name: "Skip" });
  if (await skip.isVisible({ timeout: 5_000 }).catch(() => false)) await skip.click();
}

/// The page must never scroll sideways at phone width.
export async function expectNoHorizontalScroll(page: Page, label: string): Promise<void> {
  const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(widths.scroll, `${label}: horizontal scroll (${widths.scroll} > ${widths.client})`).toBeLessThanOrEqual(widths.client);
}

export const authed = (user: TestUser) => ({ authorization: `Bearer ${user.token}` });
