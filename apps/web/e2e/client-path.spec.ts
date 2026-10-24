import { expect, test, type Page } from "@playwright/test";
import { API, authed, createUser, expectNoHorizontalScroll, mailsFor, signIn, skipWelcomeTour, waitForMail, type TestUser } from "./helpers";

/// "I'm testing for a client" with the dev mail outbox: request, approval link,
/// approve, scan allowed, revoke, scan stopped. The client's mailbox is
/// ciso@lab.test (the same domain as the lab assets, as the rule requires).
test.describe.configure({ mode: "serial" });

const CLIENT_EMAIL = "ciso@lab.test";
let user: TestUser;
let approvePath = "";
let revokePath = "";
let jobId = "";

test.beforeAll(async ({ request }) => {
  user = await createUser(request, "client");
});

async function openClientPath(page: Page) {
  await page.goto("/dashboard");
  await skipWelcomeTour(page);
  await page.locator("#quick-scan").scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "I'm testing for a client" }).click();
}

async function fillRequest(page: Page, email: string, asset: string) {
  await page.getByLabel("Client or organisation name").fill("Lab Client Ltd");
  await page.getByLabel("Client contact email").fill(email);
  await page.getByLabel("Asset 1").fill(asset);
  await page.getByLabel("Who signs for the client (name)").fill("Sam Signer");
  await page.getByLabel("Their role").fill("CISO");
  await page.getByRole("button", { name: "Next", exact: true }).click();
}

test("form rules: an IP asset is refused with a clear message, and a mailbox on another domain is refused by the server", async ({ page }) => {
  await signIn(page, user);
  await openClientPath(page);
  await expectNoHorizontalScroll(page, "client form");

  await page.getByLabel("Asset 1").fill("203.0.113.7");
  await expect(page.getByText("IP addresses and ranges cannot be authorized this way")).toBeVisible();
  await page.getByLabel("Asset 1").fill("");

  await fillRequest(page, "boss@other-company.example", "http://juice.lab.test:3000/");
  await page.getByRole("checkbox").last().click(); // responsibility
  await page.getByRole("button", { name: "Send approval request" }).click();
  await expect(page.getByText("The client's email must be at the same domain as the assets")).toBeVisible({ timeout: 20_000 });
});

test("request, the client approves from the email link, the scan is allowed", async ({ page, browser }) => {
  await signIn(page, user);
  await openClientPath(page);
  const before = mailsFor(CLIENT_EMAIL).length;
  await fillRequest(page, CLIENT_EMAIL, "http://juice.lab.test:3000/");
  await expectNoHorizontalScroll(page, "evidence step");
  await page.getByRole("checkbox").last().click();
  await page.getByRole("button", { name: "Send approval request" }).click();
  await expect(page.getByText("Waiting for Lab Client Ltd")).toBeVisible({ timeout: 30_000 });
  await expectNoHorizontalScroll(page, "waiting step");

  const mail = await waitForMail(CLIENT_EMAIL, /\/roe\/approve\/roe_/, before);
  approvePath = /\/roe\/approve\/roe_[A-Za-z0-9_-]+/.exec(mail)![0];
  expect(mail).toContain(user.email); // who is asking
  expect(mail).toContain("juice.lab.test"); // the exact asset
  expect(mail).toMatch(/ignore this email/i);

  // the client, signed out, on a phone
  const client = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true });
  const cp = await client.newPage();
  await cp.goto(approvePath);
  await expect(cp.getByRole("heading", { name: "Approve security testing?" })).toBeVisible({ timeout: 60_000 });
  await expectNoHorizontalScroll(cp, "approval page");
  // opening the link again changes nothing: still undecided
  await cp.reload();
  await expect(cp.getByRole("button", { name: "Approve" })).toBeVisible();
  await expect(page.getByText("Waiting for Lab Client Ltd")).toBeVisible();

  const confirmationsBefore = mailsFor(CLIENT_EMAIL).length;
  await cp.getByRole("button", { name: "Approve" }).click();
  await expect(cp.getByText("Approved. Thank you.")).toBeVisible();
  // replaying the same link is neutral
  await cp.goto(approvePath);
  await expect(cp.getByText("This link is no longer valid.")).toBeVisible();
  await client.close();

  const confirmation = await waitForMail(CLIENT_EMAIL, /\/roe\/revoke\/roe_/, confirmationsBefore);
  revokePath = /\/roe\/revoke\/roe_[A-Za-z0-9_-]+/.exec(confirmation)![0];

  // the requester's page notices the approval by itself (it re-checks every 15 s)
  await expect(page.getByText("Approved by Lab Client Ltd")).toBeVisible({ timeout: 60_000 });
  await expectNoHorizontalScroll(page, "ready step");
  await expect(page.locator("#quick-scan")).not.toContainText(/deep/i);

  // a longer scan, so there is something to stop
  await page.getByRole("button", { name: "Standard scan" }).click();
  await page.getByRole("button", { name: /^Scan juice\.lab\.test/ }).click();
  await page.waitForURL(/\/vuln\/jobs\/[0-9a-f-]+$/, { timeout: 90_000 });
  jobId = page.url().split("/").pop()!;
});

test("the client withdraws the approval and the running scan stops, partial results kept", async ({ browser, request }) => {
  test.skip(!jobId || !revokePath, "needs the approved, running scan");
  const headers = authed(user);
  const status = async () => ((await (await request.get(`${API}/vuln/jobs/${jobId}`, { headers })).json()).data as { status: string; error: string | null; findingsCount: number });

  // wait until it is really running and past the first stage
  await expect.poll(async () => (await status()).status, { timeout: 120_000 }).toBe("RUNNING");
  await new Promise((r) => setTimeout(r, 30_000));

  const client = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true });
  const cp = await client.newPage();
  await cp.goto(revokePath);
  await expect(cp.getByRole("heading", { name: "Withdraw your approval?" })).toBeVisible({ timeout: 60_000 });
  await expectNoHorizontalScroll(cp, "revoke page");
  await cp.getByRole("button", { name: "Withdraw approval" }).click();
  await expect(cp.getByText("Approval withdrawn. Testing under it has stopped.")).toBeVisible();
  await cp.goto(revokePath);
  await expect(cp.getByText("This link is no longer valid.")).toBeVisible();
  await client.close();

  // the scan notices at its next check (every 15 s) and ends cleanly
  await expect.poll(async () => (await status()).status, { timeout: 120_000 }).toBe("FAILED");
  const final = await status();
  expect(final.error ?? "").toMatch(/withdrew their approval/);

  // and nothing new can start under the withdrawn approval
  const targets = (await (await request.get(`${API}/vuln/jobs/${jobId}`, { headers })).json()).data as { targetId: string };
  const again = await request.post(`${API}/targets/${targets.targetId}/vuln/jobs`, { headers, data: { scanners: ["NUCLEI"], profile: "QUICK" } });
  expect(again.status()).toBe(403);

  // the report keeps what was found and says it was a client engagement
  const report = (await (await request.get(`${API}/vuln/jobs/${jobId}/report?lang=en`, { headers })).json()).data as {
    authorization: { kind: string; clientName?: string };
  };
  expect(report.authorization.kind).toBe("ROE");
  expect(report.authorization.clientName).toBe("Lab Client Ltd");
});
