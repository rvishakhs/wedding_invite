import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import {
  AdminApiError,
  adminRequest,
  eventLabel,
  invitationUrl,
  responseLabel,
  type AdminSession,
  type InvitationEvents,
  type InvitationList,
  type InvitationStatus,
  type ManagedInvitation,
} from "../lib/admin";
import "./AdminPage.css";

interface EditorDraft {
  id?: number;
  name: string;
  events: InvitationEvents;
  initialName: string;
  initialEvents: InvitationEvents;
  updatedAt?: string;
  hasResponse: boolean;
  idempotencyKey: string;
}

const PAGE_SIZE = 20;
const statuses: InvitationStatus[] = [
  "all",
  "pending",
  "accepted",
  "declined",
  "inactive",
];
const number = new Intl.NumberFormat("en-IN");
const date = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});
const timestamp = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
  timeZoneName: "short",
});
const formatDate = (value: string, full = false) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : (full ? timestamp : date).format(parsed);
};

function initialFilter(): { status: InvitationStatus; page: number } {
  const params = new URLSearchParams(window.location.search);
  const status = params.get("status") as InvitationStatus;
  const page = Number(params.get("page"));
  return {
    status: statuses.includes(status) ? status : "all",
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}

function Busy({ label }: { label: string }) {
  return (
    <span className="admin-busy">
      <LoaderCircle size={17} aria-hidden="true" />
      {label}
    </span>
  );
}

/** Native dialog supplies focus trapping, inert background and the top layer. */
function AdminDialog({
  title,
  subtitle,
  children,
  onClose,
  busy = false,
  compact = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  compact?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useLayoutEffect(() => {
    const dialog = ref.current!;
    const restoreFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-dialog-autofocus]")?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (restoreFocus?.isConnected) restoreFocus.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`admin-dialog${compact ? " admin-dialog--compact" : ""}`}
      aria-labelledby={`${id}-title`}
      aria-describedby={subtitle ? `${id}-description` : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="admin-dialog-heading">
        <div>
          <h2 id={`${id}-title`}>{title}</h2>
          {subtitle && <p id={`${id}-description`}>{subtitle}</p>}
        </div>
        <button
          className="admin-icon-button"
          type="button"
          aria-label="Close dialog"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

function Login({
  onSignedIn,
  message,
}: {
  onSignedIn: (session: AdminSession) => void;
  message: string;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState<"username" | "password" | null>(null);
  const submitting = useRef(false);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const missing = !username.trim()
      ? "username"
      : !password
        ? "password"
        : null;
    setInvalid(missing);
    if (missing) {
      setError(`Enter your ${missing} to sign in.`);
      (missing === "username" ? usernameRef : passwordRef).current?.focus();
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const session = await adminRequest<AdminSession>("/admin/login", {
        method: "POST",
        body: { username: username.trim(), password },
      });
      setPassword("");
      onSignedIn(session);
    } catch (problem) {
      setError(
        problem instanceof AdminApiError && problem.status === 401
          ? "The username or password is incorrect. Check both and try again."
          : problem instanceof Error
            ? problem.message
            : "Sign in could not be completed. Please try again.",
      );
      if (problem instanceof AdminApiError && problem.status === 401) {
        setPassword("");
        requestAnimationFrame(() => passwordRef.current?.focus());
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="admin-login-layout">
      <div className="admin-login-intro">
        <img src="/monogram.svg" width="96" height="96" alt="" />
        <p className="admin-eyebrow">Visakh & Archana</p>
        <h1>
          The invitation
          <br />
          <em>desk.</em>
        </h1>
        <p>
          A personal welcome for every guest.
          <br />
          Keep invitations and replies together.
        </p>
        <span className="admin-date">11 February 2027</span>
      </div>
      <div className="admin-login-panel">
        <LockKeyhole size={22} strokeWidth={1.3} aria-hidden="true" />
        <h2>Welcome back</h2>
        <p>Sign in to manage your invitations.</p>
        {message && (
          <p className="admin-session-notice" role="status">
            {message}
          </p>
        )}
        <form noValidate onSubmit={login} aria-busy={busy}>
          <div className="admin-field">
            <label htmlFor="admin-username">Username</label>
            <input
              id="admin-username"
              disabled={busy}
              ref={usernameRef}
              name="username"
              autoComplete="username"
              value={username}
              onChange={(event) => {
                setUsername(event.target.value);
                setInvalid(null);
              }}
              required
              aria-invalid={invalid === "username"}
              aria-describedby={
                invalid === "username" ? "admin-login-error" : undefined
              }
            />
          </div>
          <div className="admin-field">
            <label htmlFor="admin-password">Password</label>
            <div className="admin-password-field">
              <input
                id="admin-password"
                disabled={busy}
                ref={passwordRef}
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setInvalid(null);
                }}
                required
                aria-invalid={invalid === "password"}
                aria-describedby={
                  invalid === "password" ? "admin-login-error" : undefined
                }
              />
              <button
                className="admin-icon-button"
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <div
            className="admin-form-feedback"
            id="admin-login-error"
            role="alert"
          >
            {error}
          </div>
          <button
            className="admin-button admin-button--primary admin-login-submit"
            disabled={busy}
            type="submit"
          >
            {busy ? (
              <Busy label="Signing in" />
            ) : (
              <>
                Sign in <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>
        <a className="admin-text-link" href="/">
          <ArrowLeft size={15} /> Back to the invitation
        </a>
      </div>
    </div>
  );
}

export function AdminPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [sessionMessage, setSessionMessage] = useState("");
  const [filter, setFilter] = useState(initialFilter);
  const [query, setQuery] = useState("");
  const [committedQuery, setCommittedQuery] = useState("");
  const [composing, setComposing] = useState(false);
  const [data, setData] = useState<InvitationList | null>(null);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [editor, setEditor] = useState<EditorDraft | null>(null);
  const [nameError, setNameError] = useState("");
  const [editorError, setEditorError] = useState("");
  const [selected, setSelected] = useState<ManagedInvitation | null>(null);
  const [deactivating, setDeactivating] = useState<ManagedInvitation | null>(
    null,
  );
  const [discarding, setDiscarding] = useState(false);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const [notice, setNotice] = useState<{
    text: string;
    error?: boolean;
    invitation?: ManagedInvitation;
  } | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<{
    id: number;
    text: string;
    error?: boolean;
  } | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const mutating = useRef(false);
  const listController = useRef<AbortController | null>(null);
  const dirty =
    !!editor &&
    (editor.name !== editor.initialName ||
      editor.events !== editor.initialEvents);

  const expireSession = useCallback(() => {
    setSession(null);
    setData(null);
    setSelected(null);
    setDeactivating(null);
    setNotice(null);
    setSessionMessage(
      "Your session ended. Sign in again to continue; any open invitation draft is kept in this tab.",
    );
  }, []);

  useEffect(() => {
    document.title = "Invitation management · Visakh & Archana";
    const controller = new AbortController();
    setCheckingSession(true);
    setSessionError("");
    adminRequest<AdminSession>("/admin/session", { signal: controller.signal })
      .then(setSession)
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (!(error instanceof AdminApiError && error.status === 401)) {
          setSessionError(
            error instanceof Error
              ? error.message
              : "The invitation service is unavailable.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCheckingSession(false);
      });
    return () => controller.abort();
  }, [sessionAttempt]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (filter.status === "all") url.searchParams.delete("status");
    else url.searchParams.set("status", filter.status);
    if (filter.page === 1) url.searchParams.delete("page");
    else url.searchParams.set("page", String(filter.page));
    // Guest names are intentionally kept out of browser history and shared URLs.
    url.searchParams.delete("q");
    window.history.replaceState(window.history.state, "", url);
  }, [filter]);

  useEffect(() => {
    if (composing || query.trim() === committedQuery) return;
    const timeout = window.setTimeout(() => {
      setCommittedQuery(query.trim());
      setFilter((value) => ({ ...value, page: 1 }));
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [query, composing, committedQuery]);

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    listController.current = controller;
    setLoading(true);
    setListError("");
    const params = new URLSearchParams({
      q: committedQuery,
      status: filter.status,
      page: String(filter.page),
      pageSize: String(PAGE_SIZE),
    });
    adminRequest<InvitationList>(`/admin/invitations?${params}`, {
      signal: controller.signal,
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        const maxPage = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
        if (filter.page > maxPage)
          setFilter((value) => ({ ...value, page: maxPage }));
        else setData(result);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof AdminApiError && error.status === 401)
          expireSession();
        else
          setListError(
            error instanceof Error
              ? error.message
              : "Invitations could not be loaded. Try again.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [session, committedQuery, filter, refresh, expireSession]);

  useEffect(() => {
    if (!session) return;
    const revalidate = () => {
      if (document.visibilityState === "visible")
        setRefresh((value) => value + 1);
    };
    document.addEventListener("visibilitychange", revalidate);
    return () => document.removeEventListener("visibilitychange", revalidate);
  }, [session]);

  useEffect(() => {
    if (!dirty) return;
    const protectDraft = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protectDraft);
    return () => window.removeEventListener("beforeunload", protectDraft);
  }, [dirty]);

  function commitSearch(value: string) {
    listController.current?.abort();
    setQuery(value);
    setCommittedQuery(value.trim());
    setFilter((current) => ({ ...current, page: 1 }));
  }

  function openEditor(invitation?: ManagedInvitation) {
    setSelected(null);
    setNameError("");
    setEditorError("");
    setEditor({
      id: invitation?.id,
      name: invitation?.name ?? "",
      events: invitation?.events ?? "both",
      initialName: invitation?.name ?? "",
      initialEvents: invitation?.events ?? "both",
      updatedAt: invitation?.updatedAt,
      hasResponse: !!invitation?.response,
      idempotencyKey: crypto.randomUUID(),
    });
  }

  function closeEditor() {
    if (mutationBusy) return;
    if (dirty) setDiscarding(true);
    else setEditor(null);
  }

  async function copyLink(invitation: ManagedInvitation) {
    try {
      await navigator.clipboard.writeText(invitationUrl(invitation));
      setNotice({ text: `Invitation link copied for ${invitation.name}.` });
      setCopyFeedback({ id: invitation.id, text: "Invitation link copied." });
    } catch {
      setNotice({
        text: "Copy is unavailable in this browser. Open invitation details and select the full link to copy it.",
        error: true,
      });
      setCopyFeedback({
        id: invitation.id,
        text: "Copy is unavailable. Select the full link above and copy it using your device’s copy action.",
        error: true,
      });
    }
  }

  async function saveInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !editor || mutating.current) return;
    if (!editor.name.trim() || editor.name.trim().length > 200) {
      setNameError(
        !editor.name.trim()
          ? "Enter the guest or family name."
          : "Use 200 characters or fewer for the invitation name.",
      );
      nameRef.current?.focus();
      return;
    }
    mutating.current = true;
    setMutationBusy(true);
    setEditorError("");
    try {
      const invitation = await adminRequest<ManagedInvitation>(
        editor.id ? `/admin/invitations/${editor.id}` : "/admin/invitations",
        {
          method: editor.id ? "PATCH" : "POST",
          csrfToken: session.csrfToken,
          idempotencyKey: editor.idempotencyKey,
          body: {
            name: editor.name.trim(),
            events: editor.events,
            ...(editor.updatedAt
              ? { expectedUpdatedAt: editor.updatedAt }
              : {}),
          },
        },
      );
      setEditor(null);
      setNotice({
        text: `Invitation ${editor.id ? "updated" : "created"} for ${invitation.name}.`,
        invitation,
      });
      setRefresh((value) => value + 1);
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 401)
        expireSession();
      else
        setEditorError(
          error instanceof Error
            ? error.message
            : "The invitation could not be saved. Your entries are still here.",
        );
    } finally {
      mutating.current = false;
      setMutationBusy(false);
    }
  }

  async function changeActive(invitation: ManagedInvitation, active: boolean) {
    if (!session || mutating.current) return;
    mutating.current = true;
    setMutationBusy(true);
    setMutationError("");
    try {
      const result = await adminRequest<ManagedInvitation>(
        `/admin/invitations/${invitation.id}`,
        {
          method: "PATCH",
          csrfToken: session.csrfToken,
          body: { active, expectedUpdatedAt: invitation.updatedAt },
        },
      );
      setSelected((current) => (current?.id === result.id ? result : current));
      setDeactivating(null);
      setNotice({
        text: `Invitation link ${active ? "activated" : "deactivated"} for ${invitation.name}.`,
      });
      setRefresh((value) => value + 1);
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 401)
        expireSession();
      else
        setMutationError(
          error instanceof Error
            ? error.message
            : "The invitation link could not be changed. Try again.",
        );
    } finally {
      mutating.current = false;
      setMutationBusy(false);
    }
  }

  async function logout() {
    if (!session || mutating.current) return;
    mutating.current = true;
    setMutationBusy(true);
    try {
      await adminRequest<void>("/admin/logout", {
        method: "POST",
        csrfToken: session.csrfToken,
      });
      setSession(null);
      setData(null);
      setEditor(null);
      setSelected(null);
      setNotice(null);
      setQuery("");
      setCommittedQuery("");
      setSessionMessage("You have signed out.");
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 401)
        expireSession();
      else
        setNotice({
          text:
            error instanceof Error
              ? error.message
              : "Sign out could not be completed. Try again.",
          error: true,
        });
    } finally {
      mutating.current = false;
      setMutationBusy(false);
    }
  }

  if (checkingSession || sessionError)
    return (
      <main className="admin-page admin-session-loading">
        <img src="/monogram.svg" width="72" height="72" alt="" />
        <h1>Invitation management</h1>
        {checkingSession ? (
          <div role="status">
            <Busy label="Opening your invitation desk" />
          </div>
        ) : (
          <>
            <p role="alert">{sessionError}</p>
            <button
              type="button"
              className="admin-button admin-button--primary"
              onClick={() => setSessionAttempt((value) => value + 1)}
            >
              Try again
            </button>
            <a className="admin-text-link" href="/">
              Back to the invitation
            </a>
          </>
        )}
      </main>
    );

  if (!session)
    return (
      <main className="admin-page">
        <Login
          onSignedIn={(value) => {
            setSession(value);
            setSessionMessage("");
          }}
          message={sessionMessage}
        />
      </main>
    );

  const summary = data?.summary;
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));
  const currentResponse = selected?.response;

  return (
    <div className="admin-page">
      <a className="skip-link" href="#admin-main">
        Skip to invitations
      </a>
      <header className="admin-topbar">
        <a
          className="admin-brand"
          href="/"
          aria-label="Visakh and Archana invitation"
        >
          <img src="/monogram.svg" width="49" height="49" alt="" />
          <span>
            Visakh & Archana<small>11 February 2027</small>
          </span>
        </a>
        <div className="admin-account">
          <span>Signed in as {session.username}</span>
          <button
            className="admin-button admin-button--quiet"
            type="button"
            onClick={logout}
            disabled={mutationBusy}
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </header>
      <main className="admin-main" id="admin-main">
        <div className="admin-page-heading">
          <div>
            <p className="admin-eyebrow">The invitation desk</p>
            <h1>Invitations & replies</h1>
            <p>Personalize their welcome. Keep every response close.</p>
          </div>
          <button
            className="admin-button admin-button--primary"
            type="button"
            onClick={() => openEditor()}
          >
            <Plus size={17} />
            Create invitation
          </button>
        </div>

        <dl
          className="admin-summary"
          aria-label="All invitation totals"
          aria-busy={loading && !summary}
        >
          {(
            [
              ["Invitations", summary?.invitations],
              ["Awaiting reply", summary?.pending],
              ["Accepted", summary?.accepted],
              ["Declined", summary?.declined],
              ["Wedding guests", summary?.weddingGuests],
              ["Reception guests", summary?.receptionGuests],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value === undefined ? "—" : number.format(value)}</dd>
            </div>
          ))}
        </dl>

        <div
          className={`admin-notice-slot${notice?.error ? " admin-notice-slot--error" : ""}`}
          role={notice?.error ? "alert" : "status"}
          aria-live="polite"
        >
          {notice && (
            <>
              <span>
                {!notice.error && <Check size={16} aria-hidden="true" />}
                {notice.text}
              </span>
              {notice.invitation && (
                <button
                  className="admin-text-link"
                  type="button"
                  onClick={() => copyLink(notice.invitation!)}
                >
                  <Copy size={14} />
                  Copy link
                </button>
              )}
              <button
                className="admin-icon-button"
                type="button"
                aria-label="Dismiss notification"
                onClick={() => setNotice(null)}
              >
                <X size={16} />
              </button>
            </>
          )}
        </div>

        <section className="admin-ledger" aria-labelledby="admin-list-heading">
          <div className="admin-list-heading">
            <div>
              <h2 id="admin-list-heading">Your guest list</h2>
              <p>
                Invitation links update automatically when you make changes.
              </p>
            </div>
            <button
              className="admin-button admin-button--quiet"
              type="button"
              onClick={() => setRefresh((value) => value + 1)}
              disabled={loading}
            >
              <RefreshCw size={15} />
              Refresh
            </button>
          </div>
          <div className="admin-toolbar">
            <div className="admin-search">
              <Search size={17} aria-hidden="true" />
              <label className="admin-sr-only" htmlFor="admin-search">
                Search by guest name
              </label>
              <input
                id="admin-search"
                ref={searchRef}
                type="search"
                placeholder="Search by guest name"
                value={query}
                onCompositionStart={() => setComposing(true)}
                onCompositionEnd={(event) => {
                  setComposing(false);
                  setQuery(event.currentTarget.value);
                }}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.nativeEvent.isComposing &&
                    !composing
                  ) {
                    event.preventDefault();
                    commitSearch(query);
                  }
                }}
              />
              {query && (
                <button
                  className="admin-icon-button"
                  type="button"
                  aria-label="Clear guest search"
                  onClick={() => {
                    commitSearch("");
                    searchRef.current?.focus();
                  }}
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <div className="admin-filter">
              <label htmlFor="admin-status">Show</label>
              <select
                id="admin-status"
                value={filter.status}
                onChange={(event) => {
                  listController.current?.abort();
                  setFilter({
                    status: event.target.value as InvitationStatus,
                    page: 1,
                  });
                }}
              >
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status === "all"
                      ? "All invitations"
                      : status === "pending"
                        ? "Awaiting reply"
                        : status === "inactive"
                          ? "Inactive links"
                          : status[0].toUpperCase() + status.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="admin-list-feedback" role="status">
            {loading ? (
              <Busy
                label={data ? "Updating invitations" : "Loading invitations"}
              />
            ) : listError ? (
              <span className="admin-inline-error">
                {listError}
                <button
                  type="button"
                  className="admin-text-link"
                  onClick={() => setRefresh((value) => value + 1)}
                >
                  Try again
                </button>
              </span>
            ) : data ? (
              `${number.format(data.total)} ${data.total === 1 ? "invitation" : "invitations"}${committedQuery ? " match your search" : ""}`
            ) : (
              ""
            )}
          </div>
          <p className="admin-scroll-hint">
            Scroll the table sideways to see links and actions.
          </p>
          <div
            className="admin-table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Invitation table, scroll horizontally for more columns"
            aria-busy={loading}
          >
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Guest / family</th>
                  <th scope="col">Celebrations</th>
                  <th scope="col">Response</th>
                  <th scope="col">Personal invitation</th>
                  <th scope="col">
                    <span className="admin-sr-only">Manage invitation</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map((invitation) => (
                  <tr key={invitation.id}>
                    <th scope="row">
                      <span className="admin-guest-name">
                        {invitation.name}
                      </span>
                      <span className="admin-row-caption">
                        Created {formatDate(invitation.createdAt)}
                        {!invitation.active && (
                          <span className="admin-inactive">
                            {" "}
                            · Link inactive
                          </span>
                        )}
                      </span>
                    </th>
                    <td>{eventLabel(invitation.events)}</td>
                    <td>
                      <span
                        className={`admin-status admin-status--${invitation.response ? (invitation.response.attending ? "accepted" : "declined") : "pending"}`}
                      >
                        {responseLabel(invitation)}
                      </span>
                      {invitation.response?.attending && (
                        <span className="admin-row-caption">
                          {number.format(invitation.response.guestCount)}{" "}
                          {invitation.response.guestCount === 1
                            ? "guest"
                            : "guests"}
                        </span>
                      )}
                      {invitation.needsReview && (
                        <span className="admin-review">
                          Review event change
                        </span>
                      )}
                    </td>
                    <td>
                      <a
                        className="admin-invitation-url"
                        href={invitationUrl(invitation)}
                        target="_blank"
                        rel="noreferrer"
                        title={invitationUrl(invitation)}
                      >
                        {invitationUrl(invitation)}
                      </a>
                      <button
                        className="admin-text-link"
                        type="button"
                        onClick={() => copyLink(invitation)}
                        aria-label={`Copy invitation link for ${invitation.name}`}
                      >
                        <Copy size={13} />
                        Copy link
                      </button>
                    </td>
                    <td>
                      <div className="admin-row-actions">
                        <button
                          className="admin-button admin-button--outline"
                          type="button"
                          onClick={() => {
                            setSelected(invitation);
                            setMutationError("");
                          }}
                          aria-label={`View details for ${invitation.name}`}
                        >
                          Details
                        </button>
                        <button
                          className="admin-text-link"
                          type="button"
                          onClick={() => openEditor(invitation)}
                          aria-label={`Edit invitation for ${invitation.name}`}
                        >
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data?.items.length && (
              <div className="admin-table-empty">
                {loading ? (
                  <Busy label="Getting your guest list ready" />
                ) : listError ? (
                  <>
                    <h3>The guest list is unavailable</h3>
                    <p>Retry loading to see your invitations.</p>
                  </>
                ) : (
                  <>
                    <h3>
                      {committedQuery || filter.status !== "all"
                        ? "No matching invitations"
                        : "Every celebration starts with an invitation."}
                    </h3>
                    <p>
                      {committedQuery || filter.status !== "all"
                        ? "Try another name or show all invitations."
                        : "Create a personal link for a guest, a couple, or a family."}
                    </p>
                    <button
                      type="button"
                      className="admin-button admin-button--outline"
                      onClick={() => {
                        if (committedQuery || filter.status !== "all") {
                          commitSearch("");
                          setFilter({ status: "all", page: 1 });
                        } else openEditor();
                      }}
                    >
                      {committedQuery || filter.status !== "all"
                        ? "Clear filters"
                        : "Create invitation"}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          <nav className="admin-pagination" aria-label="Invitation pages">
            <span>
              {data?.total
                ? `${number.format((filter.page - 1) * PAGE_SIZE + 1)}–${number.format(Math.min(filter.page * PAGE_SIZE, data.total))} of ${number.format(data.total)}`
                : "0 invitations"}
            </span>
            <div>
              <button
                className="admin-button admin-button--quiet"
                type="button"
                disabled={loading || filter.page <= 1}
                onClick={() =>
                  setFilter((value) => ({ ...value, page: value.page - 1 }))
                }
              >
                <ArrowLeft size={15} />
                Previous
              </button>
              <span aria-current="page">
                {filter.page} / {totalPages}
              </span>
              <button
                className="admin-button admin-button--quiet"
                type="button"
                disabled={loading || filter.page >= totalPages}
                onClick={() =>
                  setFilter((value) => ({ ...value, page: value.page + 1 }))
                }
              >
                Next
                <ArrowRight size={15} />
              </button>
            </div>
          </nav>
        </section>
        <footer className="admin-footer">
          <span>Made for the people sharing your day.</span>
          <a
            className="admin-text-link"
            href="/"
            target="_blank"
            rel="noreferrer"
          >
            View the invitation <ExternalLink size={13} />
          </a>
        </footer>
      </main>

      {editor && (
        <AdminDialog
          title={editor.id ? "Edit invitation" : "A personal invitation"}
          subtitle={
            editor.id
              ? "The same invitation link will reflect your changes."
              : "Create a welcome addressed to your guest or family."
          }
          onClose={closeEditor}
          busy={mutationBusy}
        >
          <form noValidate onSubmit={saveInvitation} aria-busy={mutationBusy}>
            <div className="admin-dialog-body">
              <div className="admin-field">
                <label htmlFor="invitation-name">Guest or family name</label>
                <input
                  id="invitation-name"
                  disabled={mutationBusy}
                  ref={nameRef}
                  name="name"
                  data-dialog-autofocus
                  autoFocus
                  autoComplete="off"
                  placeholder="e.g. Anjali & family"
                  value={editor.name}
                  maxLength={200}
                  required
                  aria-invalid={!!nameError}
                  aria-describedby={
                    nameError ? "invitation-name-error" : "invitation-name-help"
                  }
                  onChange={(event) => {
                    setEditor({ ...editor, name: event.target.value });
                    setNameError("");
                    setEditorError("");
                  }}
                />
                <p
                  className={
                    nameError ? "admin-field-error" : "admin-field-help"
                  }
                  id={
                    nameError ? "invitation-name-error" : "invitation-name-help"
                  }
                >
                  {nameError || "This name appears on their invitation."}
                </p>
              </div>
              <fieldset className="admin-event-options" disabled={mutationBusy}>
                <legend>Invite them to</legend>
                {(["wedding", "both"] as const).map((events) => (
                  <label
                    key={events}
                    className={editor.events === events ? "is-selected" : ""}
                  >
                    <input
                      type="radio"
                      name="invitation-events"
                      value={events}
                      checked={editor.events === events}
                      onChange={() => {
                        setEditor({ ...editor, events });
                        setEditorError("");
                      }}
                    />
                    <span>
                      <strong>{eventLabel(events)}</strong>
                      <small>
                        {events === "wedding"
                          ? "Wedding details and wedding RSVP"
                          : "Both celebrations and their RSVP choices"}
                      </small>
                    </span>
                  </label>
                ))}
              </fieldset>
              {editor.hasResponse && editor.events !== editor.initialEvents && (
                <p className="admin-caution">
                  This guest has already replied. Their response will be kept
                  and flagged for review after you change the celebrations.
                </p>
              )}
              <div className="admin-form-feedback" role="alert">
                {editorError}
              </div>
            </div>
            <div className="admin-dialog-actions">
              <button
                className="admin-button admin-button--outline"
                type="button"
                disabled={mutationBusy}
                onClick={closeEditor}
              >
                Cancel
              </button>
              <button
                className="admin-button admin-button--primary"
                type="submit"
                disabled={mutationBusy || (!!editor.id && !dirty)}
              >
                {mutationBusy ? (
                  <Busy label="Saving invitation" />
                ) : editor.id ? (
                  "Save changes"
                ) : (
                  "Create invitation"
                )}
              </button>
            </div>
          </form>
        </AdminDialog>
      )}

      {selected && (
        <AdminDialog
          title={selected.name}
          subtitle={eventLabel(selected.events)}
          onClose={() => setSelected(null)}
          busy={mutationBusy}
        >
          <div className="admin-dialog-body">
            <div className="admin-detail-section">
              <div className="admin-detail-heading">
                <h3>Personal invitation</h3>
                <span
                  className={`admin-status${selected.active ? "" : " admin-status--declined"}`}
                  role="status"
                >
                  {selected.active ? "Link active" : "Link inactive"}
                </span>
              </div>
              <label className="admin-sr-only" htmlFor="invitation-full-link">
                Full invitation link
              </label>
              <input
                id="invitation-full-link"
                className="admin-full-link"
                value={invitationUrl(selected)}
                readOnly
                onFocus={(event) => event.target.select()}
              />
              <div className="admin-link-actions">
                <button
                  className="admin-button admin-button--outline"
                  type="button"
                  onClick={() => copyLink(selected)}
                >
                  <Copy size={14} />
                  Copy link
                </button>
                <a
                  className="admin-text-link"
                  href={invitationUrl(selected)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open invitation <ExternalLink size={14} />
                </a>
              </div>
              <p
                className={`admin-copy-feedback${copyFeedback?.error ? " admin-field-error" : ""}`}
                role="status"
              >
                {copyFeedback?.id === selected.id ? copyFeedback.text : ""}
              </p>
            </div>
            <div className="admin-detail-section">
              <div className="admin-detail-heading">
                <h3>Their response</h3>
                <span className="admin-status">{responseLabel(selected)}</span>
              </div>
              {selected.needsReview && (
                <p className="admin-caution">
                  Celebrations changed after this reply. This response may no
                  longer match the invitation; ask the guest to review and send
                  it again.
                </p>
              )}
              {currentResponse ? (
                <>
                  <dl className="admin-response-grid">
                    <div>
                      <dt>Responded by</dt>
                      <dd>{currentResponse.fullName}</dd>
                    </div>
                    <div>
                      <dt>Contact</dt>
                      <dd>{currentResponse.contact}</dd>
                    </div>
                    <div>
                      <dt>Wedding guests</dt>
                      <dd>
                        {number.format(
                          currentResponse.events.includes("wedding")
                            ? currentResponse.guestCount
                            : 0,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Reception guests</dt>
                      <dd>
                        {number.format(
                          currentResponse.events.includes("reception")
                            ? currentResponse.guestCount
                            : 0,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Wedding transport</dt>
                      <dd>
                        {currentResponse.transportation.wedding
                          ? "Requested"
                          : "Not requested"}
                      </dd>
                    </div>
                    <div>
                      <dt>Reception transport</dt>
                      <dd>
                        {currentResponse.transportation.reception
                          ? "Requested"
                          : "Not requested"}
                      </dd>
                    </div>
                    <div>
                      <dt>Accommodation</dt>
                      <dd>
                        {currentResponse.accommodation.required
                          ? `Requested${currentResponse.accommodation.rooms ? ` · ${number.format(currentResponse.accommodation.rooms)} ${currentResponse.accommodation.rooms === 1 ? "room" : "rooms"}` : " · rooms to arrange"}`
                          : "Not requested"}
                      </dd>
                    </div>
                    <div>
                      <dt>Latest reply</dt>
                      <dd>{formatDate(currentResponse.respondedAt, true)}</dd>
                    </div>
                    <div className="admin-response-wide">
                      <dt>Food allergies or dietary needs</dt>
                      <dd>{currentResponse.foodAllergies || "None shared"}</dd>
                    </div>
                    <div className="admin-response-wide">
                      <dt>Message</dt>
                      <dd className="admin-guest-message">
                        {currentResponse.message || "No message shared"}
                      </dd>
                    </div>
                  </dl>
                </>
              ) : (
                <p className="admin-pending-response">
                  No reply yet. Share their invitation link to invite them to
                  respond.
                </p>
              )}
            </div>
            <div className="admin-link-control">
              <div>
                <h3>
                  {selected.active
                    ? "Deactivate invitation link"
                    : "Activate invitation link"}
                </h3>
                <p>
                  {selected.active
                    ? "Stop access to this link. Their saved response is kept."
                    : "Restore guest access using the same invitation link."}
                </p>
              </div>
              <button
                className={`admin-button admin-button--outline${selected.active ? " admin-button--danger" : ""}`}
                type="button"
                disabled={mutationBusy}
                onClick={() => {
                  setMutationError("");
                  if (selected.active) setDeactivating(selected);
                  else void changeActive(selected, true);
                }}
              >
                {mutationBusy ? (
                  <Busy label="Updating" />
                ) : selected.active ? (
                  "Deactivate"
                ) : (
                  "Activate"
                )}
              </button>
            </div>
            {!deactivating && (
              <div className="admin-form-feedback" role="alert">
                {mutationError}
              </div>
            )}
          </div>
          <div className="admin-dialog-actions">
            <button
              className="admin-button admin-button--outline"
              type="button"
              onClick={() => setSelected(null)}
              disabled={mutationBusy}
            >
              Close
            </button>
            <button
              className="admin-button admin-button--primary"
              type="button"
              onClick={() => openEditor(selected)}
              disabled={mutationBusy}
            >
              Edit invitation
            </button>
          </div>
        </AdminDialog>
      )}

      {deactivating && (
        <AdminDialog
          title="Deactivate this link?"
          compact
          subtitle={`The invitation for ${deactivating.name} will no longer open for guests. Their saved response stays in your dashboard, and you can activate the link again.`}
          onClose={() => setDeactivating(null)}
          busy={mutationBusy}
        >
          <div className="admin-dialog-body admin-confirm-body">
            <div className="admin-form-feedback" role="alert">
              {mutationError}
            </div>
          </div>
          <div className="admin-dialog-actions">
            <button
              className="admin-button admin-button--outline"
              type="button"
              data-dialog-autofocus
              autoFocus
              disabled={mutationBusy}
              onClick={() => setDeactivating(null)}
            >
              Keep active
            </button>
            <button
              className="admin-button admin-button--danger-solid"
              type="button"
              disabled={mutationBusy}
              onClick={() => changeActive(deactivating, false)}
            >
              {mutationBusy ? <Busy label="Deactivating" /> : "Deactivate link"}
            </button>
          </div>
        </AdminDialog>
      )}

      {discarding && (
        <AdminDialog
          title="Discard your changes?"
          compact
          subtitle="This invitation has unsaved changes. Keep editing to finish your personal invitation."
          onClose={() => setDiscarding(false)}
        >
          <div className="admin-dialog-actions">
            <button
              className="admin-button admin-button--outline"
              type="button"
              data-dialog-autofocus
              autoFocus
              onClick={() => setDiscarding(false)}
            >
              Keep editing
            </button>
            <button
              className="admin-button admin-button--danger-solid"
              type="button"
              onClick={() => {
                setDiscarding(false);
                setEditor(null);
              }}
            >
              Discard changes
            </button>
          </div>
        </AdminDialog>
      )}
    </div>
  );
}

export default AdminPage;
