import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

await fs.mkdir("qa", { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
assert.equal(await page.title(), "Visakh & Archana | 11 February 2027");
await page.screenshot({ path: "qa/desktop-hero.png" });
await page.screenshot({ path: "qa/desktop-full.png", fullPage: true });
await page.locator("#program").screenshot({ path: "qa/desktop-program.png" });
await page
  .locator(".photo-footer")
  .screenshot({ path: "qa/desktop-footer.png" });
await page.getByRole("tab", { name: "The reception" }).click();
assert.equal(await page.locator(".timeline li").count(), 10);
assert.ok(await page.getByText("DJ party", { exact: true }).isVisible());
await page.locator("#program").screenshot({ path: "qa/reception.png" });
await page.getByRole("tab", { name: "The reception" }).press("ArrowLeft");
assert.equal(await page.locator(".timeline li").count(), 4);

const downloadPromise = page.waitForEvent("download");
await page.getByRole("button", { name: "Add to calendar" }).first().click();
const download = await downloadPromise;
await download.saveAs("qa/wedding.ics");
const calendar = await fs.readFile("qa/wedding.ics", "utf8");
assert.equal((calendar.match(/BEGIN:VEVENT/g) ?? []).length, 2);
assert.ok(calendar.includes("20270211T053000Z"));

for (const width of [320, 375, 390, 768, 1440]) {
  await page.setViewportSize({ width, height: 844 });
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  assert.ok(
    overflow.scroll <= overflow.client,
    `Invitation overflow at ${width}: ${JSON.stringify(overflow)}`,
  );
  if (width === 390) {
    await page.screenshot({ path: "qa/mobile-hero.png" });
    await page.screenshot({ path: "qa/mobile-full.png", fullPage: true });
    await page
      .locator("#program")
      .screenshot({ path: "qa/mobile-program.png" });
    await page
      .locator("#details")
      .screenshot({ path: "qa/mobile-details.png" });
    await page
      .locator(".photo-footer")
      .screenshot({ path: "qa/mobile-footer.png" });
  }
  await page
    .locator(".site-header")
    .getByRole("link", { name: /RSVP/ })
    .click();
  await page.getByRole("heading", { name: "Will you join us?" }).waitFor();
  await page.reload({ waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const formOverflow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  assert.ok(
    formOverflow.scroll <= formOverflow.client,
    `RSVP overflow at ${width}`,
  );
  if (width === 390)
    await page.screenshot({ path: "qa/mobile-rsvp.png", fullPage: true });
  if (width === 1440)
    await page.screenshot({ path: "qa/desktop-rsvp.png", fullPage: true });
}
await page.getByRole("link", { name: "Skip to content" }).focus();
await page.keyboard.press("Enter");
assert.equal(await page.locator(".rsvp-page").count(), 1);
assert.equal(await page.evaluate(() => document.activeElement?.id), "main");
await page
  .getByRole("button", { name: "Save my response", exact: true })
  .click();
assert.ok(
  await page.getByText("Please enter your name.", { exact: true }).isVisible(),
);
await page.waitForFunction(
  () => document.activeElement?.id === "rsvp-fullName",
);
await page.getByLabel("Your full name").fill("QA Test Guest");
await page
  .getByLabel("Email address or phone number")
  .fill("guest@example.com");
await page.getByLabel("Joyfully accept").check();
await page.getByLabel("Number of guests").fill("3");
await page.getByRole("radio", { name: "Both", exact: true }).check();
await page.getByRole("checkbox", { name: /Wedding ceremony/ }).check();
await page.getByRole("checkbox", { name: /Reception/ }).check();
await page.getByRole("radio", { name: "Yes, please", exact: true }).check();
await page.getByLabel("Rooms requested").fill("2");
await page
  .getByLabel("Food allergies or dietary requirements")
  .fill("Test guest: peanuts");
await page.getByLabel("A little note for us").fill("Test response only");
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: "qa/mobile-rsvp-filled.png", fullPage: true });
await page
  .getByRole("button", { name: "Save my response", exact: true })
  .click();
await page.getByRole("heading", { name: "Your response is saved." }).waitFor();
assert.ok(
  await page
    .getByText(/It has not been sent to Visakh and Archana/)
    .isVisible(),
);
const saved = await page.evaluate(() =>
  JSON.parse(localStorage.getItem("visakh-archana:rsvp:v1")),
);
assert.equal(saved.guestCount, 3);
assert.equal(saved.accommodation.rooms, 2);
assert.equal(saved.transportation.wedding, true);
await page.screenshot({ path: "qa/mobile-rsvp-saved.png", fullPage: true });
await page
  .getByRole("button", { name: "Edit my response", exact: true })
  .click();
await page.getByLabel("Regretfully decline").check();
assert.equal(await page.getByLabel("Number of guests").count(), 0);
await page
  .getByRole("button", { name: "Save my response", exact: true })
  .click();
const declined = await page.evaluate(() =>
  JSON.parse(localStorage.getItem("visakh-archana:rsvp:v1")),
);
assert.equal(declined.guestCount, 0);
assert.equal(declined.transportation.wedding, false);
assert.equal(declined.accommodation.required, false);
await page.emulateMedia({ reducedMotion: "reduce" });
await page.getByRole("button", { name: "Back to the invitation" }).click();
assert.equal(
  await page.evaluate(
    () => getComputedStyle(document.documentElement).scrollBehavior,
  ),
  "auto",
);
assert.deepEqual(errors, []);
await browser.close();
console.log(
  "Browser checks passed: 5 viewport widths, both programs, keyboard tabs, calendar download, RSVP validation/save/edit/decline, reduced motion, zero runtime errors.",
);
