import { expect, test, type Page } from "@playwright/test";
import { API, authed, createUser, expectNoHorizontalScroll, signIn, skipWelcomeTour, type TestUser } from "./helpers";

/// "I own it": sign in, add the lab site, Quick scan on the owner's attestation,
/// live progress, the report, a share link opened signed out. Plus the negatives.
/// Scans only the lab (juice.lab.test is a container on the lab network).
test.describe.configure({ mode: "serial" });

let user: TestUser;
let sharedUrl = "";

test.beforeAll(async ({ request }) => {
  user = await createUser(request, "own");
});

async function openQuickScan(page: Page) {
  await page.goto("/dashboard");
  await expect(page.locator("#quick-scan")).toBeVisible({ timeout: 60_000 });
  await skipWelcomeTour(page);
  await page.locator("#quick-scan").scrollIntoViewIfNeeded();
}

test("sign in, add the site, I own it, Quick scan, live progress, report", async ({ page }) => {
  await signIn(page, user);
  await expectNoHorizontalScroll(page, "dashboard");
  await openQuickScan(page);

  // the two ways to be allowed
  await expect(page.getByRole("button", { name: "I own it" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "I'm testing for a client" })).toBeVisible();

  await page.locator("#quick-scan-input").fill("http://juice.lab.test:3000/");
  await page.getByRole("button", { name: "Quick check" }).click();
  await page.locator("#quick-scan-attest").click();
  await expectNoHorizontalScroll(page, "quick-scan card");
  await page.getByRole("button", { name: "Start scan" }).click();

  // no verification step: Quick runs on the attestation
  await page.waitForURL(/\/vuln\/jobs\/[0-9a-f-]+$/, { timeout: 90_000 });
  await expect(page.getByRole("heading", { name: "Vulnerability scan" })).toBeVisible();
  await expectNoHorizontalScroll(page, "live scan page");

  // live progress, then done
  await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible({ timeout: 5 * 60_000 });
  await page.getByRole("link", { name: "View report" }).click();
  await page.waitForURL(/\/report$/);
  await expect(page.getByRole("heading", { name: "Security report" })).toBeVisible();
  await expectNoHorizontalScroll(page, "report");

  // the report states what the scan ran under, in words
  await expect(page.getByText("The owner confirmed ownership of this site (not technically verified); scope limited to this host.")).toBeVisible();

  // share link, 1 day, then read the link
  await page.getByRole("button", { name: "Share" }).click();
  await page.getByRole("button", { name: "1 day" }).click();
  await page.getByRole("button", { name: "Create link" }).click();
  const created = page.getByRole("dialog").locator("p.break-all").first();
  await expect(created).toContainText("/shared/", { timeout: 30_000 });
  sharedUrl = (await created.innerText()).trim();
  expect(sharedUrl).toMatch(/\/shared\/[A-Za-z0-9_-]{20,}/);
});

test("the shared report opens signed out and shows no way back into the account", async ({ browser }) => {
  test.skip(!sharedUrl, "needs the share link from the previous test");
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true });
  const page = await context.newPage();
  const path = new URL(sharedUrl).pathname;
  await page.goto(path);
  await expect(page.getByRole("heading", { name: "Security report" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("not technically verified")).toBeVisible();
  await expectNoHorizontalScroll(page, "shared report");
  expect(page.url()).not.toMatch(/\/login/);
  await context.close();
});

test("DEEP is not offered anywhere in the interface", async ({ page }) => {
  await signIn(page, user);
  await openQuickScan(page);
  await expect(page.locator("#quick-scan")).not.toContainText(/deep/i);
  await page.getByRole("button", { name: "I'm testing for a client" }).click();
  await expect(page.locator("#quick-scan")).not.toContainText(/deep/i);
});

test("API: DEEP is refused without proof and without confirmation; an unproven written-permission target does not run", async ({ request }) => {
  const headers = authed(user);
  const project = (await (await request.post(`${API}/projects`, { headers, data: { name: "Negative tests" } })).json()).data;
  const makeTarget = async (value: string, basis: "OWNER" | "WRITTEN_PERMISSION") =>
    (
      await (
        await request.post(`${API}/projects/${project.id}/targets`, {
          headers,
          data: { type: "DOMAIN", value, scopeStatus: "IN_SCOPE", authorization: { basis, attested: true } },
        })
      ).json()
    ).data.id as string;
  const scan = async (targetId: string, body: Record<string, unknown>) => {
    const res = await request.post(`${API}/targets/${targetId}/vuln/jobs`, { headers, data: { scanners: ["NUCLEI"], ...body } });
    return { status: res.status(), code: ((await res.json()) as { code?: string }).code };
  };

  const owner = await makeTarget("owner.lab.test", "OWNER");
  const noConfirm = await scan(owner, { profile: "DEEP" });
  expect(noConfirm.status).toBeGreaterThanOrEqual(400);
  expect(["SCAN_DEEP_CONFIRMATION_REQUIRED", "SCAN_PROFILE_DISABLED"]).toContain(noConfirm.code);

  const confirmed = await scan(owner, { profile: "DEEP", confirmDeep: true });
  expect(confirmed.status).toBe(403);
  // refused for the switch (off on this deployment) or for lack of proof, never accepted
  expect(["SCAN_PROFILE_DISABLED", "TARGET_OWNERSHIP_NOT_VERIFIED"]).toContain(confirmed.code);

  const permission = await makeTarget("permission.lab.test", "WRITTEN_PERMISSION");
  const refused = await scan(permission, { profile: "QUICK" });
  expect(refused.status).toBe(403);
  expect(refused.code).toBe("TARGET_OWNERSHIP_NOT_VERIFIED");
});
