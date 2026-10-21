# Visakh & Archana — wedding invitation

A mobile-first Vite, React and TypeScript wedding website, styled from the supplied invitation references with ivory, black, muted gold, fine serif typography, handwritten accents and the couple’s photographs.

## Run locally

Use Node.js 20.19+ or 22.12+ and npm.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. For a production build and local preview:

```sh
npm run build
npm run preview
```

Run the focused calendar and RSVP checks:

```sh
npm test
```

For browser checks, keep `npm run dev` running on port 5173, then run:

```sh
npx playwright install chromium
npm run test:browser
```

The browser check covers five widths (320–1440px), both timelines, keyboard tabs, the skip link, calendar download, RSVP validation and local saving/editing/declining, and reduced motion. Screenshots are saved to the ignored `qa/` folder for visual comparison with the references. The production build and all 22 unit tests pass; the strict UI audit has no findings.

The production files are generated in `dist/` and can be hosted on a static web server.

## Wedding content

Edit `src/data/wedding.ts` for the shared event/calendar data and both programs. Invitation copy and photo layouts live in `src/App.tsx`; update that copy alongside any event changes. The wedding and reception are on **Thursday, 11 February 2027**:

- Temple ceremony: **11:00–11:20 AM**, Mukhathala Sree Krishna Swami Temple.
- Reception: **6:00–10:00 PM**, Marine Pride Beach Resort Varkala.
- All event times use **India Standard Time (`Asia/Kolkata`, UTC+05:30)**. The countdown uses the explicit timezone offset, so it remains correct for guests abroad.
- Reception transport returns at **8:30 PM**, before the **10:00 PM** end of the celebration. Guests staying later need to plan their return.

The downloadable calendar includes separate ceremony and reception events. It uses UTC internally so calendar applications display the correct local time. `src/lib/calendar.ts` also provides a Google Calendar link helper for one event at a time, defaulting to the ceremony.

## RSVP and a future backend

This project is a frontend. With no endpoint configured, an RSVP is a **draft saved on the guest’s device only**. It is **not sent to the couple** and should not be treated as a confirmed response.

Copy `.env.example` to `.env.local` and set the public endpoint URL to enable delivery:

```dotenv
VITE_RSVP_ENDPOINT=https://your-api.example.com/rsvps
```

Vite injects this setting at build time. Restart the dev server or rebuild after changing it. Never put API secrets or private tokens in a `VITE_` variable: those values are included in the browser bundle.

The endpoint receives a JSON `POST` with `Content-Type: application/json` and an `Idempotency-Key` header matching `submissionId`. It receives no cookies or credentials. Validate the fields on the server, deduplicate by `submissionId`, persist the response and return a **2xx status only after accepting it**. The frontend treats any 2xx response as success; its response body is not used. Requests time out after 15 seconds and are never retried automatically. Other statuses and network failures preserve the entered values.

If the API uses a different domain, allow the website’s origin and the `Content-Type` and `Idempotency-Key` headers in CORS. The payload contract is:

```json
{
  "schemaVersion": 1,
  "occasion": "visakh-archana-2027-02-11",
  "submissionId": "a-generated-uuid",
  "respondedAt": "2026-10-21T12:00:00.000Z",
  "fullName": "Guest name",
  "contact": "guest@example.com",
  "attending": true,
  "guestCount": 2,
  "events": ["wedding", "reception"],
  "transportation": { "wedding": true, "reception": false },
  "accommodation": { "required": true, "rooms": 1 },
  "foodAllergies": "One guest has a peanut allergy",
  "message": "Looking forward to celebrating with you!"
}
```

`contact` accepts an email address or phone number. For a decline, `guestCount` is `0`, `events` is empty, both transport values are `false`, and accommodation is `{ "required": false, "rooms": null }`. A guest who does not request accommodation also sends `rooms: null`. Treat allergy and accommodation information as private guest data when building storage and administration features.

Without an endpoint, the explicit save action writes a local draft under `visakh-archana:rsvp:v1`. The guest can also download that response as JSON. There is no automatic submission when an endpoint is added later. The request adapter and validation are in `src/lib/rsvp.ts`.

## Assets and design

The site uses the supplied couple photographs as optimized web assets. Reference images inform the layout and visual styling; no reference-template copy or sample wedding details are used as event facts. Fonts are bundled locally through Fontsource.

`DESIGN.md` records the design direction and interaction conventions. Keep program, logistics, form and calendar content consistent when changing event details.
