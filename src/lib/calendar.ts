import { wedding } from "../data/wedding";

export interface CalendarEvent {
  uid: string;
  title: string;
  description: string;
  location: string;
  start: string;
  end: string;
}

export const ceremonyCalendarEvent: CalendarEvent = {
  uid: "visakh-archana-20270211-ceremony@wedding.local",
  title: "Visakh & Archana · Wedding ceremony",
  description:
    "Join Visakh S R and Archana A for their Hindu temple wedding.\nGroom’s welcome: 10:30 AM. Ceremony: 11:00–11:20 AM.\nPhotos and blessings: 11:30 AM. Food and drinks: 12:00 PM.\nAll times are India Standard Time (Asia/Kolkata).",
  location: wedding.venue,
  start: wedding.ceremony.start,
  end: wedding.ceremony.end,
};

export const receptionCalendarEvent: CalendarEvent = {
  uid: "visakh-archana-20270211-reception@wedding.local",
  title: "Visakh & Archana · Wedding reception",
  description:
    "Celebrate with Visakh S R and Archana A.\nCocktails and welcome drinks from 6:00 PM. Celebrations until 10:00 PM.\nDress code: formal party wear.\nArranged transport leaves at 5:00 PM and returns at 8:30 PM, before the celebration ends. Please plan your own return if staying later.\nAll times are India Standard Time (Asia/Kolkata).",
  location: wedding.reception.venue,
  start: wedding.reception.start,
  end: wedding.reception.end,
};

export const calendarEvents = [
  ceremonyCalendarEvent,
  receptionCalendarEvent,
] as const;

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\n|\r/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function utcTimestamp(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new Error("Calendar event contains an invalid date.");
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

// RFC 5545 folds physical lines after at most 75 UTF-8 octets.
function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const lines: string[] = [];
  let current = "";
  let bytes = 0;
  for (const character of line) {
    const length = encoder.encode(character).length;
    if (bytes + length > 75) {
      lines.push(current);
      current = " ";
      bytes = 1;
    }
    current += character;
    bytes += length;
  }
  lines.push(current);
  return lines.join("\r\n");
}

export function createCalendarIcs(
  events: readonly CalendarEvent[] = calendarEvents,
  generatedAt: Date = new Date(),
): string {
  const stamp = utcTimestamp(generatedAt);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Visakh and Archana//Wedding Invitation//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events.flatMap((event) => {
      const start = utcTimestamp(event.start);
      const end = utcTimestamp(event.end);
      if (new Date(event.end).getTime() <= new Date(event.start).getTime()) {
        throw new Error("Calendar event must end after it starts.");
      }
      return [
        "BEGIN:VEVENT",
        `UID:${escapeText(event.uid)}`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${start}`,
        `DTEND:${end}`,
        `SUMMARY:${escapeText(event.title)}`,
        `DESCRIPTION:${escapeText(event.description)}`,
        `LOCATION:${escapeText(event.location)}`,
        "STATUS:CONFIRMED",
        "TRANSP:OPAQUE",
        "END:VEVENT",
      ];
    }),
    "END:VCALENDAR",
  ];
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

/** Downloads both the ceremony and reception as separate calendar events. */
export function downloadWeddingCalendar(): void {
  const blob = new Blob([createCalendarIcs()], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "visakh-and-archana-wedding.ics";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** Google Calendar opens one event; the default is the temple ceremony. */
export function getGoogleCalendarUrl(
  event: CalendarEvent = ceremonyCalendarEvent,
): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${utcTimestamp(event.start)}/${utcTimestamp(event.end)}`,
    details: event.description,
    location: event.location,
    ctz: wedding.timezone,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
