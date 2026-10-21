import type { RsvpPayload } from "./rsvp";

export interface AdminSession {
  username: string;
  csrfToken: string;
}

export type InvitationEvents = "wedding" | "both";
export type InvitationStatus =
  "all" | "pending" | "accepted" | "declined" | "inactive";

export interface ManagedInvitation {
  id: number;
  name: string;
  events: InvitationEvents;
  token: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  response: RsvpPayload | null;
  needsReview: boolean;
  url: string;
}

export interface InvitationList {
  items: ManagedInvitation[];
  total: number;
  page: number;
  pageSize: number;
  summary: {
    invitations: number;
    pending: number;
    accepted: number;
    declined: number;
    weddingGuests: number;
    receptionGuests: number;
  };
}

export class AdminApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

/** Cookie sessions and CSRF values stay in memory; no credentials enter storage. */
export async function adminRequest<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PATCH";
    body?: unknown;
    csrfToken?: string;
    signal?: AbortSignal;
    idempotencyKey?: string;
  } = {},
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timeout = window.setTimeout(abort, 15_000);
  try {
    const response = await fetch(`/api${path}`, {
      method: options.method ?? "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        ...(options.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
        ...(options.csrfToken ? { "X-CSRF-Token": options.csrfToken } : {}),
        ...(options.idempotencyKey
          ? { "Idempotency-Key": options.idempotencyKey }
          : {}),
      },
      body:
        options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const body =
      response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      const fallback =
        response.status === 401
          ? "Please sign in again to continue."
          : response.status === 403
            ? "This action was not authorized. Sign in again, then retry."
            : response.status === 409
              ? "This invitation changed since you opened it. Close this form, refresh the list, and review the latest details before editing again."
              : response.status === 429
                ? "Too many attempts. Please wait a moment before trying again."
                : "The request could not be completed. Please try again.";
      throw new AdminApiError(
        typeof body?.detail === "string" && response.status !== 500
          ? body.detail
          : fallback,
        response.status,
      );
    }
    return body as T;
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (error instanceof AdminApiError) throw error;
    throw new AdminApiError(
      options.method && options.method !== "GET"
        ? "We could not confirm the change was saved. Your entries are still here. Check your connection before trying again."
        : "Unable to reach the invitation service. Check your connection and try again.",
      0,
    );
  } finally {
    window.clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
}

export function invitationUrl(invitation: ManagedInvitation): string {
  return new URL(invitation.url, window.location.origin).href;
}

export function eventLabel(events: InvitationEvents): string {
  return events === "both" ? "Wedding & reception" : "Wedding only";
}

export function responseLabel(invitation: ManagedInvitation): string {
  if (!invitation.response) return "Pending";
  return invitation.response.attending ? "Accepted" : "Declined";
}
