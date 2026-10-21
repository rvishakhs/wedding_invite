import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Always use an isolated database and temporary administrator. No live guest data
// or existing admin credentials are read or changed by this browser check.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await fs.mkdtemp(
  path.join(os.tmpdir(), "wedding-management-"),
);
const qa = path.join(root, "qa");
await fs.mkdir(qa, { recursive: true });
await fs.access(path.join(root, "dist", "index.html")).catch(() => {
  throw new Error(
    "Build the frontend with npm run build before running test:management.",
  );
});

async function findPython() {
  if (process.env.PYTHON_EXECUTABLE) return process.env.PYTHON_EXECUTABLE;
  for (const candidate of [
    ".venv/Scripts/python.exe",
    "backend/.venv/Scripts/python.exe",
    ".venv/bin/python",
    "backend/.venv/bin/python",
  ]) {
    const executable = path.join(root, candidate);
    if (
      await fs.access(executable).then(
        () => true,
        () => false,
      )
    )
      return executable;
  }
  return "python";
}

const socket = net.createServer();
await new Promise((resolve, reject) => {
  socket.once("error", reject);
  socket.listen(0, "127.0.0.1", resolve);
});
const port = socket.address().port;
await new Promise((resolve, reject) =>
  socket.close((error) => (error ? reject(error) : resolve())),
);
const base = `http://127.0.0.1:${port}`;
const username = "browser-check-admin";
const password = randomUUID() + randomUUID();
const env = {
  ...process.env,
  WEDDING_DATABASE: path.join(temporary, "test.sqlite3"),
  WEDDING_PUBLIC_ORIGIN: base,
  WEDDING_ALLOWED_ORIGINS: base,
  WEDDING_COOKIE_SECURE: "false",
  WEDDING_ADMIN_USERNAME: username,
  WEDDING_ADMIN_PASSWORD: password,
};
const python = await findPython();
let server;
let browser;
let serverOutput = "";
const pageErrors = [];
const recordPage = (page) =>
  page.on("pageerror", (error) => pageErrors.push(error.message));
const pause = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function runPython(args) {
  const child = spawn(python, args, {
    cwd: root,
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  const [code] = await once(child, "exit");
  if (code !== 0) throw new Error(`Python setup failed (${code}): ${output}`);
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(qa, name), fullPage: true });
}

async function noOverflow(page) {
  assert.ok(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
    "Page must not overflow the viewport",
  );
}

async function openRsvp(page) {
  await page
    .locator(".site-header")
    .getByRole("link", { name: /RSVP/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Will you join us?" }),
  ).toBeVisible();
}

async function assertNoReception(page) {
  assert.doesNotMatch(
    await page.locator("body").innerText(),
    /reception/i,
    "Wedding-only invitation must not disclose reception details",
  );
}

try {
  await runPython(["-m", "backend.manage", "create-admin", "--from-env"]);
  server = spawn(
    python,
    [
      "-m",
      "uvicorn",
      "backend.app:app",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: root,
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (chunk) => {
    serverOutput = (serverOutput + chunk).slice(-12_000);
  });
  server.stderr.on("data", (chunk) => {
    serverOutput = (serverOutput + chunk).slice(-12_000);
  });
  const deadline = Date.now() + 20_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (server.exitCode !== null)
      throw new Error(`Backend exited during startup: ${serverOutput}`);
    ready = await fetch(`${base}/api/health`).then(
      (response) => response.ok,
      () => false,
    );
    if (ready) break;
    await pause(100);
  }
  assert.ok(ready, `Backend did not become ready: ${serverOutput}`);
  assert.equal((await fetch(`${base}/api/admin/invitations`)).status, 401);

  browser = await chromium.launch({ headless: true });
  const adminContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const admin = await adminContext.newPage();
  recordPage(admin);
  await admin.goto(`${base}/admin`, { waitUntil: "networkidle" });
  await expect(
    admin.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await screenshot(admin, "admin-login.png");
  await admin.getByLabel("Username", { exact: true }).fill(username);
  await admin
    .getByLabel("Password", { exact: true })
    .fill("incorrect-password");
  await admin.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    admin.getByText(
      "The username or password is incorrect. Check both and try again.",
    ),
  ).toBeVisible();
  await admin.getByLabel("Password", { exact: true }).fill(password);
  await admin.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    admin.getByRole("heading", { name: "Invitations & replies" }),
  ).toBeVisible();
  const cookie = (await adminContext.cookies(`${base}/api/admin/session`)).find(
    (item) => item.name === "wedding_admin_session",
  );
  assert.equal(cookie?.httpOnly, true);
  assert.equal(cookie?.sameSite, "Strict");

  async function createInvitation(name, events) {
    await admin
      .getByRole("button", { name: "Create invitation", exact: true })
      .first()
      .click();
    const dialog = admin.getByRole("dialog", { name: "A personal invitation" });
    await expect(dialog.getByLabel("Guest or family name")).toBeFocused();
    await dialog.getByLabel("Guest or family name").fill(name);
    await dialog
      .getByRole("radio", {
        name: events === "wedding" ? /Wedding only/ : /Wedding & reception/,
      })
      .check();
    const responsePromise = admin.waitForResponse(
      (response) =>
        response.url() === `${base}/api/admin/invitations` &&
        response.request().method() === "POST",
    );
    await dialog
      .getByRole("button", { name: "Create invitation", exact: true })
      .click();
    const response = await responsePromise;
    assert.equal(response.status(), 201);
    const invitation = await response.json();
    await expect(dialog).not.toBeVisible();
    await expect(
      admin.getByRole("rowheader").filter({ hasText: name }),
    ).toBeVisible();
    return invitation;
  }

  const wedding = await createInvitation("Anjali & family", "wedding");
  const both = await createInvitation("Meera & Arun", "both");
  await admin
    .getByRole("button", {
      name: `Copy invitation link for ${wedding.name}`,
      exact: true,
    })
    .click();
  assert.equal(
    await admin.evaluate(() => navigator.clipboard.readText()),
    wedding.url,
  );
  await screenshot(admin, "admin-dashboard.png");

  const guestContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const guest = await guestContext.newPage();
  recordPage(guest);
  // A prior public-demo draft must never be used for a personalized invitation.
  await guest.goto(base, { waitUntil: "networkidle" });
  const staleDraft = JSON.stringify({
    schemaVersion: 1,
    occasion: "visakh-archana-2027-02-11",
    submissionId: randomUUID(),
    respondedAt: new Date().toISOString(),
    fullName: "Someone else's saved draft",
    contact: "old@example.com",
    attending: true,
    guestCount: 9,
    events: ["wedding", "reception"],
    transportation: { wedding: false, reception: false },
    accommodation: { required: false, rooms: null },
    foodAllergies: "",
    message: "Private older draft",
  });
  await guest.evaluate(
    (value) => localStorage.setItem("visakh-archana:rsvp:v1", value),
    staleDraft,
  );
  await guest.goto(wedding.url, { waitUntil: "domcontentloaded" });
  await expect(guest.locator(".guest-name")).toHaveText(wedding.name);
  await assertNoReception(guest);
  await screenshot(guest, "personalized-wedding-desktop.png");
  const downloadPromise = guest.waitForEvent("download");
  await guest.getByRole("button", { name: "Add to calendar" }).first().click();
  const download = await downloadPromise;
  const calendar = await fs.readFile(await download.path(), "utf8");
  assert.equal((calendar.match(/BEGIN:VEVENT/g) ?? []).length, 1);
  assert.doesNotMatch(calendar, /reception/i);
  await openRsvp(guest);
  await expect(guest.getByLabel("Your full name")).toHaveValue(wedding.name);
  await expect(guest.getByLabel("Email address or phone number")).toHaveValue(
    "",
  );
  await guest
    .getByLabel("Email address or phone number")
    .fill("anjali@example.com");
  await guest
    .getByRole("button", { name: "The invitation", exact: true })
    .click();
  await openRsvp(guest);
  await expect(guest.getByLabel("Email address or phone number")).toHaveValue(
    "anjali@example.com",
  );
  await guest.getByLabel("Joyfully accept").check();
  await guest.getByLabel("Number of guests").fill("3");
  await guest.getByRole("checkbox", { name: /Wedding ceremony/ }).check();
  await guest
    .getByLabel("A little note for us")
    .fill("Looking forward to your day.");
  await assertNoReception(guest);
  await guest.setViewportSize({ width: 390, height: 844 });
  await noOverflow(guest);
  await screenshot(guest, "personalized-rsvp-mobile.png");

  const rsvpEndpoint = `${base}/api/invitations/${wedding.token}/rsvp`;
  const keys = [];
  let failNextSave = true;
  await guest.route(rsvpEndpoint, async (route) => {
    keys.push(route.request().headers()["idempotency-key"]);
    if (failNextSave) {
      failNextSave = false;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"detail":"Temporary test outage"}',
      });
    } else await route.continue();
  });
  await guest
    .getByRole("button", { name: "Send my RSVP", exact: true })
    .click();
  await expect(guest.getByRole("alert")).toContainText("could not be accepted");
  await expect(guest.getByLabel("Email address or phone number")).toHaveValue(
    "anjali@example.com",
  );
  await expect(guest.getByLabel("Number of guests")).toHaveValue("3");
  await screenshot(guest, "personalized-rsvp-retry.png");
  await guest
    .getByRole("button", { name: "The invitation", exact: true })
    .click();
  await openRsvp(guest);
  await expect(guest.getByLabel("Email address or phone number")).toHaveValue(
    "anjali@example.com",
  );
  await guest
    .getByRole("button", { name: "Send my RSVP", exact: true })
    .click();
  await expect(
    guest.getByRole("heading", { name: "Thank you for your RSVP." }),
  ).toBeVisible();
  assert.equal(keys.length, 2);
  assert.equal(
    keys[0],
    keys[1],
    "Uncertain retries must keep the same idempotency key",
  );
  await guest.unroute(rsvpEndpoint);
  assert.equal(
    await guest.evaluate(() => localStorage.getItem("visakh-archana:rsvp:v1")),
    staleDraft,
  );
  await guest.getByRole("button", { name: "Edit my response" }).click();
  await guest.getByLabel("Number of guests").fill("4");
  await guest.getByRole("button", { name: "Send my updated RSVP" }).click();
  await expect(
    guest.getByRole("heading", { name: "Thank you for your RSVP." }),
  ).toBeVisible();
  await guest.reload({ waitUntil: "networkidle" });
  await expect(guest.getByLabel("Number of guests")).toHaveValue("4");
  await expect(guest.getByLabel("Email address or phone number")).toHaveValue(
    "anjali@example.com",
  );
  await assertNoReception(guest);

  await guest.goto(both.url, { waitUntil: "networkidle" });
  await expect(guest.locator(".guest-name")).toHaveText(both.name);
  await expect(guest.getByRole("tab", { name: "The reception" })).toBeVisible();
  await openRsvp(guest);
  await expect(guest.getByLabel("Your full name")).toHaveValue(both.name);
  await expect(guest.getByLabel("Email address or phone number")).toHaveValue(
    "",
  );
  await guest
    .getByLabel("Email address or phone number")
    .fill("meera@example.com");
  await guest.getByLabel("Joyfully accept").check();
  await guest.getByLabel("Number of guests").fill("2");
  await guest.getByRole("radio", { name: "Both", exact: true }).check();
  await guest.getByRole("checkbox", { name: /Reception/ }).check();
  await guest
    .getByRole("button", { name: "Send my RSVP", exact: true })
    .click();
  await expect(
    guest.getByRole("heading", { name: "Thank you for your RSVP." }),
  ).toBeVisible();

  await admin.getByRole("button", { name: "Refresh", exact: true }).click();
  const summaryValue = (name) =>
    admin
      .locator(".admin-summary > div")
      .filter({
        has: admin.locator("dt", { hasText: new RegExp(`^${name}$`) }),
      })
      .locator("dd");
  await expect(summaryValue("Accepted")).toHaveText("2");
  await expect(summaryValue("Wedding guests")).toHaveText("6");
  await expect(summaryValue("Reception guests")).toHaveText("2");
  await admin
    .getByRole("button", {
      name: `View details for ${wedding.name}`,
      exact: true,
    })
    .click();
  const details = admin.getByRole("dialog", {
    name: wedding.name,
    exact: true,
  });
  await expect(
    details.getByText("anjali@example.com", { exact: true }),
  ).toBeVisible();
  await expect(
    details.getByText("Looking forward to your day.", { exact: true }),
  ).toBeVisible();
  await screenshot(admin, "admin-response.png");
  await details.getByRole("button", { name: "Close", exact: true }).click();

  // Editing a saved invitation updates the original URL, without a frontend build.
  await admin
    .getByRole("button", {
      name: `Edit invitation for ${both.name}`,
      exact: true,
    })
    .click();
  const editor = admin.getByRole("dialog", {
    name: "Edit invitation",
    exact: true,
  });
  const renamedGuest = "Meera, Arun & family";
  await editor.getByLabel("Guest or family name").fill(renamedGuest);
  await editor.getByRole("radio", { name: /Wedding only/ }).check();
  await expect(
    editor.getByText(/This guest has already replied/),
  ).toBeVisible();
  const editedResponse = admin.waitForResponse(
    (response) =>
      response.url() === `${base}/api/admin/invitations/${both.id}` &&
      response.request().method() === "PATCH",
  );
  await editor.getByRole("button", { name: "Save changes" }).click();
  const edited = await editedResponse;
  assert.equal(edited.status(), 200);
  const changedInvitation = await edited.json();
  assert.equal(changedInvitation.url, both.url);
  assert.equal(changedInvitation.needsReview, true);
  await expect(editor).not.toBeVisible();
  await expect(
    admin.getByText("Review event change", { exact: true }),
  ).toBeVisible();
  await expect(summaryValue("Wedding guests")).toHaveText("4");
  await expect(summaryValue("Reception guests")).toHaveText("0");
  await guest.goto(both.url, { waitUntil: "networkidle" });
  await expect(guest.locator(".guest-name")).toHaveText(renamedGuest);
  await assertNoReception(guest);

  const sessionResponse = await adminContext.request.get(
    `${base}/api/admin/session`,
  );
  const session = await sessionResponse.json();
  for (let index = 1; index <= 22; index++) {
    const response = await adminContext.request.post(
      `${base}/api/admin/invitations`,
      {
        headers: {
          "X-CSRF-Token": session.csrfToken,
          Origin: base,
          "Idempotency-Key": randomUUID(),
        },
        data: {
          name: `Pagination Guest ${String(index).padStart(2, "0")}`,
          events: "wedding",
        },
      },
    );
    assert.equal(response.status(), 201);
  }
  await admin.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(admin.getByRole("rowheader")).toHaveCount(20);
  await admin.getByRole("button", { name: "Next", exact: true }).click();
  await expect(admin.getByRole("rowheader")).toHaveCount(4);
  await expect(admin).toHaveURL(/page=2/);
  await admin.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(admin.getByRole("rowheader")).toHaveCount(20);
  await admin.getByLabel("Search by guest name").fill("Anjali");
  await expect(admin.getByRole("rowheader")).toHaveCount(1);
  assert.ok(
    !admin.url().includes("Anjali"),
    "Guest search text must stay out of the URL",
  );
  await admin.getByLabel("Search by guest name").fill("No such guest");
  await expect(
    admin.getByRole("heading", { name: "No matching invitations" }),
  ).toBeVisible();
  await admin.getByRole("button", { name: "Clear guest search" }).click();
  await admin.getByLabel("Show", { exact: true }).selectOption("accepted");
  await expect(admin.getByRole("rowheader")).toHaveCount(2);
  await admin.setViewportSize({ width: 390, height: 844 });
  await noOverflow(admin);
  await screenshot(admin, "admin-dashboard-mobile.png");
  await admin
    .getByRole("button", {
      name: `View details for ${wedding.name}`,
      exact: true,
    })
    .click();
  await noOverflow(admin);
  await screenshot(admin, "admin-response-mobile.png");
  await admin
    .getByRole("dialog", { name: wedding.name, exact: true })
    .getByRole("button", { name: "Deactivate", exact: true })
    .click();
  const confirmation = admin.getByRole("dialog", {
    name: "Deactivate this link?",
  });
  await expect(
    confirmation.getByRole("button", { name: "Keep active" }),
  ).toBeFocused();
  await confirmation
    .getByRole("button", { name: "Deactivate link", exact: true })
    .click();
  await expect(confirmation).not.toBeVisible();
  await expect(
    admin
      .getByRole("dialog", { name: wedding.name, exact: true })
      .getByText("Link inactive", { exact: true }),
  ).toBeVisible();
  await guest.goto(wedding.url, { waitUntil: "domcontentloaded" });
  await expect(
    guest.getByText(/This invitation link is unavailable/),
  ).toBeVisible();
  await expect(guest.locator(".site-header")).toHaveCount(0);
  await screenshot(guest, "personalized-inactive.png");

  await admin
    .getByRole("dialog", { name: wedding.name, exact: true })
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await guest.goto(both.url, { waitUntil: "networkidle" });
  await openRsvp(guest);
  await guest
    .getByLabel("Email address or phone number")
    .fill("meera@example.com");
  await guest.getByLabel("Regretfully decline").check();
  await expect(guest.getByLabel("Number of guests")).toHaveCount(0);
  await guest
    .getByRole("button", { name: "Send my RSVP", exact: true })
    .click();
  await expect(
    guest.getByRole("heading", { name: "Thank you for your RSVP." }),
  ).toBeVisible();
  await admin.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(summaryValue("Declined")).toHaveText("1");
  await expect(summaryValue("Wedding guests")).toHaveText("0");
  await admin.getByLabel("Show", { exact: true }).selectOption("declined");
  await expect(admin.getByRole("rowheader")).toHaveCount(1);
  await expect(admin.getByRole("rowheader")).toContainText(renamedGuest);
  await admin.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    admin.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  assert.equal(
    (await adminContext.request.get(`${base}/api/admin/invitations`)).status(),
    401,
  );
  assert.deepEqual(pageErrors, []);
  console.log(
    "Management browser checks passed: isolated admin authentication, creation/copy/edit links, wedding-only visibility/calendar, RSVP failure/retry/update/reload/decline, draft isolation, response totals and review flags, search/filter/pagination, deactivation, mobile layout and sign-out.",
  );
} catch (error) {
  for (const [index, context] of (browser?.contexts() ?? []).entries()) {
    for (const page of context.pages()) {
      console.error(`Failure context ${index}: ${page.url()}`);
      await page
        .screenshot({
          path: path.join(qa, `management-failure-${index}.png`),
          timeout: 2000,
        })
        .catch(() => {});
    }
  }
  if (serverOutput.includes("Traceback")) console.error(serverOutput);
  throw error;
} finally {
  await browser?.close();
  if (server && server.exitCode === null) {
    const exited = once(server, "exit");
    server.kill();
    await Promise.race([exited, pause(3000)]);
    if (server.exitCode === null) {
      server.kill("SIGKILL");
      await exited;
    }
  }
  const resolved = path.resolve(temporary);
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
  assert.ok(path.basename(resolved).startsWith("wedding-management-"));
  await fs.rm(resolved, { recursive: true, force: true });
}
