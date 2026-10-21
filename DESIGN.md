---
version: alpha
name: "Visakh & Archana"
description: "A photographic wedding invitation with ivory stationery, fine serif letters, handwritten flourishes and muted gold rings."
colors:
  primary: "#25251f"
  paper: "#faf9f6"
  white: "#ffffff"
  ink: "#25251f"
  muted: "#6b695e"
  gold: "#aa9460"
  gold-light: "#e8e1d0"
  line: "#dedace"
  danger: "#9c332e"
typography:
  display:
    fontFamily: "Cormorant Garamond, Georgia, serif"
  body:
    fontFamily: "Manrope, Arial, sans-serif"
  script:
    fontFamily: "Ballet, cursive"
rounded:
  button: "40px"
  input: "0px"
spacing:
  section: "98px"
  section-mobile: "75px"
  page-max: "1440px"
components:
  button:
    height: "44px"
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
  timeline:
    width: "1px"
---

# Visakh & Archana design

## Overview

The two supplied invitation-template reference images are the visual authority. Preserve their portrait-photo pages, refined serif capitals, thin rules, cursive phrases, interlocking rings, alternating vertical timelines with gold dots, giant stacked RS/VP, and a photographic date footer. The user's photos and confirmed event information replace example content. No JSON reference is required.

Guests are friends and family attending a Hindu temple wedding in Kerala, India. English is the supplied language, with Indian local event times (Asia/Kolkata). Phone browsing takes priority. The invitation is a brand/content surface; the separate #rsvp page has a simple form contract. No admin app, dashboard, account system or extra functionality is implied.

The signature is white invitation lettering blended into the full-height portrait, echoed by oversized RS/VP letters. Avoid bright colours, elevated cards, generic dashboard layouts, and ornamental background patterns absent from the references.

## Colors

Runtime token ownership is `src/styles.css :root`. This document mirrors the implemented values. All shared components consume those CSS properties, with photo overlays and decorative transparency as local composition rules. Paper/white form alternating stationery sections, ink provides body contrast, muted is supporting text, and gold is reserved for small lines, icons and rings. Gold is not used for small body text. The single light theme preserves the photographic reference. Forced-colors mode uses system controls and visible content panels.

## Typography

Cormorant Garamond provides high-contrast invitation titles and dates. Manrope provides legible form controls and event information. Ballet is restricted to short decorative phrases with generous leading; no form label or essential instruction relies on script. Fonts are self-hosted with the build. Use the referenced small spaced capitals only for short labels. Body content is larger on the RSVP page for input accessibility.

## Layout

At desktop widths, portrait photography remains centred in a softly extended photographic background. Navigation is a restrained ivory strip. Text sections have generous vertical spacing with no floating cards. Venue information uses two columns. The event timeline is a single, centred vertical line with alternating text and outlined icons. Wedding and reception are accessible keyboard-operated tabs. Details become a faded full-background portrait on phones, following the first reference. RSVP and details use desktop split layouts and single-column mobile layouts.

Breakpoints: 900px for compact desktops, 600px for mobile, 360px for very small phones. Mobile minimum target is 320px. The viewport owns scrolling; page height is natural. Fixed photo aspect ratios and reserved image dimensions prevent layout jumps. Hash navigation keeps form state isolated from invitation sections.

## Elevation & Depth

Flat paper surfaces, fine borders and photographic overlays provide depth. No shadows on content sections. Calendar status uses an unobtrusive fixed message. Images are optimized WebP versions of supplied photos with source originals preserved outside the project.

## Shapes

Buttons are slim pills; controls are rectangular. Decorative circles are restricted to rings and timeline dots. Icons use the consistent thin Lucide outline family; the interlocking rings are a small native SVG illustration.

## Components

`App.tsx` owns navigation, countdown, venues, program tabs, details and shared calendar feedback. `RsvpPage.tsx` owns form validation, accessible labels, status and focus recovery. `src/lib/rsvp.ts` owns draft persistence and endpoint submission. `src/lib/calendar.ts` owns the calendar payload with UTC instants for both events.

RSVP without VITE_RSVP_ENDPOINT saves a draft in the current browser only and explicitly states that it has not been sent to the couple. A JSON download lets guests retain that draft. An endpoint integration must acknowledge success before the form claims delivery. Fields retain values on errors. No secrets or backend service credentials belong in Vite environment variables.

Buttons have hover, focus-visible, active and disabled states. Tabs use aria-selected and keyboard arrows. Inline errors are associated with fields. Pending submission keeps button dimensions stable and prevents duplicate submissions. All time/date content uses the wedding's Indian timezone, independently of browser timezone.

Global scrollbars have thumb, track, hover, active and forced-colors behavior. Reduced-motion preferences disable transitions and smooth scrolling. Photography uses meaningful alt text; decorative icons are hidden from assistive technology.

## Do's and Don'ts

- Keep the supplied photos, names, venue names and date authoritative.
- Follow the visual reference closely while retaining readable labels and touch targets.
- Keep the wedding and reception programs separately accessible in the same timeline pattern.
- Never invent an RSVP deadline or imply an unsent local draft reached the hosts.
- Never add backend accounts or server persistence until requested and connected.
