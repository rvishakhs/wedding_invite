import { lazy, Suspense, useEffect, useState } from "react";
import App from "./App";
import type { RsvpInvitation } from "./lib/rsvp";

const AdminPage = lazy(() => import("./components/AdminPage"));

function InvitationNotice({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <main className="invitation-notice">
      <img
        src="/monogram.svg"
        width="84"
        height="84"
        alt="Visakh and Archana"
      />
      <h1>Your invitation</h1>
      <p role="status">{message}</p>
      {retry && (
        <button className="button button-outline" onClick={retry}>
          Try again
        </button>
      )}
    </main>
  );
}

function PersonalizedInvitation({ token }: { token: string }) {
  const [invitation, setInvitation] = useState<RsvpInvitation | null>(null);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    const timer = window.setTimeout(() => controller.abort(), 15000);
    setError("");
    setUnavailable(false);
    setInvitation(null);
    async function load() {
      try {
        const response = await fetch(
          `/api/invitations/${encodeURIComponent(token)}`,
          {
            signal: controller.signal,
            cache: "no-store",
            credentials: "omit",
          },
        );
        if (response.status === 404 || response.status === 410) {
          if (current) {
            setUnavailable(true);
            setError(
              "This invitation link is unavailable. Please ask Visakh or Archana for your current invitation.",
            );
          }
          return;
        }
        if (!response.ok) throw new Error("Invitation unavailable");
        const data = await response.json();
        if (
          typeof data.name !== "string" ||
          !["wedding", "both"].includes(data.events)
        )
          throw new Error("Invalid invitation");
        if (current) setInvitation({ ...data, token });
      } catch {
        if (current)
          setError(
            "We couldn’t load your invitation. Check your connection and try again.",
          );
      } finally {
        window.clearTimeout(timer);
      }
    }
    void load();
    return () => {
      current = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [token, attempt]);
  if (error)
    return (
      <InvitationNotice
        message={error}
        retry={unavailable ? undefined : () => setAttempt((value) => value + 1)}
      />
    );
  if (!invitation)
    return <InvitationNotice message="Opening your invitation…" />;
  return (
    <App
      invitation={invitation}
      onSaved={(response) =>
        setInvitation((current) =>
          current ? { ...current, response } : current,
        )
      }
    />
  );
}

export function Entry() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  useEffect(() => {
    if (path === "/") return;
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex, nofollow, noarchive";
    document.head.append(robots);
    return () => robots.remove();
  }, [path]);
  if (path === "/admin")
    return (
      <Suspense
        fallback={<InvitationNotice message="Opening invitation management…" />}
      >
        <AdminPage />
      </Suspense>
    );
  const match = path.match(/^\/invite\/([A-Za-z0-9_-]{20,128})$/);
  if (match) return <PersonalizedInvitation token={match[1]} />;
  if (path !== "/")
    return (
      <InvitationNotice message="This page could not be found. Please check your invitation link." />
    );
  return <App />;
}
