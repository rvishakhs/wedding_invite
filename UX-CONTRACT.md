# Invitation management behavior

## Product authority

The approved user brief is the source of the following product rules: create personalized invitations for wedding only or wedding and reception; share a stable custom URL; load current invitation details without rebuilding; receive RSVP responses in a protected dashboard; no maximum guest allowance; reserve galleries and memories for a later phase. `backend/` enforces authorization and persistence; `DESIGN.md` owns the established invitation appearance.

## Routes and access

- `/` is the generic invitation preview, retaining explicitly labeled local RSVP drafts.
- `/invite/{token}` is the personalized invitation. An unpredictable token grants read/update access to that invitation and its own RSVP. Forwarding the link grants the same access. Unavailable or inactive links never fall back to the generic invitation.
- `/admin` requires a server session. Session cookies are HTTP-only; passwords and CSRF tokens are not stored in browser persistent storage. Administrative mutations require a CSRF token.
- `/api` is the backend boundary. The production server serves both the API and built frontend; Vite proxies API calls in development.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Form | `RsvpPage.tsx`, admin editor/login in `AdminPage.tsx` | Backend validation plus this contract | Guest response, admin invitation, admin login | Unit and browser checks |
| Select/Listbox | Native status select in `AdminPage.tsx` | Platform popup accepted | Status filtering; celebration selection uses native radios | Keyboard and narrow viewport |
| Scrollbar | `src/styles.css` global rules | Runtime CSS tokens mirrored in DESIGN.md | Internal table overflow only | Browser overflow checks |
| Toast | Scoped live status in `App.tsx` and `AdminPage.tsx` | This contract | Calendar result, admin mutation/copy result | Browser checks |
| CRUD | `src/lib/admin.ts` + `AdminPage.tsx` | Backend API | Create/edit/deactivate/reactivate; no permanent delete | Integrated API/browser tests |
| Dialog | Native modal dialog wrapper in `AdminPage.tsx` | This contract | Editor, response details, confirmation | Escape, focus, narrow viewport |
| Date | Read-only locale formatting | Event times Asia/Kolkata; response timestamps shown in Asia/Kolkata with an explicit timezone | No date inputs | Browser inspection |

## Invitations and event access

A new invitation has a name and `wedding` or `both` event access, with no guest allowance. Edit retains the token/URL. Deactivate is reversible and requires confirmation explaining that the link stops working. Editing event scope preserves the previous response for host review; incompatible responses are marked for review and excluded from attendance totals until updated. Public projection excludes any response containing newly forbidden events.

The guest name appears in the invitation. Wedding-only invitations hide reception venues, program, dress guidance, transport and RSVP choices, and download a ceremony-only calendar. The server independently rejects forbidden event attendance/transport. A wedding-only guest can never authorize reception participation through client-side manipulation.

## Save and recovery

The server owns submitted responses. Success is shown only after a successful saved-response acknowledgement. Pending saves preserve geometry and disable duplicate submission. Errors retain answers; uncertain requests can be retried with the same submission ID. Retried older responses never overwrite a newer response. Reloading a link retrieves its saved response. Personalized in-progress drafts live only in memory and are scoped by token; generic local drafts must not leak into them.

Admin creation returns to the list and shows the generated URL. Edit updates the same invitation. Version guards reject conflicting edits. Create retry keys prevent duplicated invitations. Session expiry returns to login while preserving the pending edit in memory. Never persist guest details or passwords in URLs or browser local storage. Status/page filters may be in URL; guest-name search remains memory-only. Search has an explicit clear control, debounce and stale response cancellation. Lists are paginated; empty, no-results, loading and failures have distinct recovery.

## Accessibility and responsive behavior

Use real labels, semantic links/buttons, visible focus and native keyboard controls. Forms own text validation, expose field errors and focus the first invalid field. Dialogs trap focus via native `showModal`, restore the trigger, and keep close/actions reachable on narrow screens. Product tables retain semantic headers and a local scroll region while the document continues to scroll naturally. Reduced motion inherits the global baseline.
