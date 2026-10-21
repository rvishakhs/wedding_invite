import { describe, expect, it } from "vitest";
import {
  calendarEvents,
  ceremonyCalendarEvent,
  createCalendarIcs,
  getGoogleCalendarUrl,
} from "./calendar";

const generatedAt = new Date("2026-10-21T12:00:00Z");
const unfold = (value: string) => value.replace(/\r\n /g, "");

describe("wedding calendar", () => {
  it("includes the ceremony and reception at the correct India Standard Time", () => {
    const calendar = createCalendarIcs(calendarEvents, generatedAt);
    expect(calendar.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(calendar).toContain(
      "DTSTART:20270211T053000Z\r\nDTEND:20270211T055000Z",
    );
    expect(calendar).toContain(
      "DTSTART:20270211T123000Z\r\nDTEND:20270211T163000Z",
    );
    expect(calendar).toContain("DTSTAMP:20261021T120000Z");
    expect(calendar).toContain("LOCATION:Marine Pride Beach Resort Varkala");
    expect(calendar.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(calendar.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("escapes free text and prevents newlines creating calendar properties", () => {
    const event = {
      ...ceremonyCalendarEvent,
      title: "Visakh, Archana; together \\ forever",
      description: "First line\r\nEND:VEVENT\nBEGIN:VEVENT\rLast line",
    };
    const calendar = unfold(createCalendarIcs([event], generatedAt));
    expect(calendar).toContain(
      "SUMMARY:Visakh\\, Archana\\; together \\\\ forever",
    );
    expect(calendar).toContain(
      "DESCRIPTION:First line\\nEND:VEVENT\\nBEGIN:VEVENT\\nLast line",
    );
    expect(calendar.match(/^BEGIN:VEVENT$/gm)).toHaveLength(1);
  });

  it("folds long Unicode lines without breaking characters or exceeding 75 bytes", () => {
    const description = "Celebrate with us — സ്നേഹം 💛 ".repeat(20);
    const calendar = createCalendarIcs(
      [{ ...ceremonyCalendarEvent, description }],
      generatedAt,
    );
    for (const line of calendar.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(unfold(calendar)).toContain(`DESCRIPTION:${description}`);
  });

  it("rejects invalid dates and non-positive durations", () => {
    expect(() =>
      createCalendarIcs(
        [{ ...ceremonyCalendarEvent, start: "invalid" }],
        generatedAt,
      ),
    ).toThrow("invalid date");
    expect(() =>
      createCalendarIcs(
        [{ ...ceremonyCalendarEvent, end: ceremonyCalendarEvent.start }],
        generatedAt,
      ),
    ).toThrow("end after");
  });

  it("builds a Google Calendar ceremony link with exact times and timezone", () => {
    const url = new URL(getGoogleCalendarUrl());
    expect(url.origin).toBe("https://calendar.google.com");
    expect(url.searchParams.get("dates")).toBe(
      "20270211T053000Z/20270211T055000Z",
    );
    expect(url.searchParams.get("ctz")).toBe("Asia/Kolkata");
    expect(url.searchParams.get("location")).toBe(
      ceremonyCalendarEvent.location,
    );
    expect(url.searchParams.get("text")).toBe(ceremonyCalendarEvent.title);
  });
});
