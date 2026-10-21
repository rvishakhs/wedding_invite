export type Attendance = "" | "yes" | "no";
export type EventAttendance = "" | "wedding" | "reception" | "both";

export interface RsvpValues {
  fullName: string;
  contact: string;
  attending: Attendance;
  guestCount: string;
  events: EventAttendance;
  weddingTransport: boolean;
  receptionTransport: boolean;
  accommodation: boolean;
  rooms: string;
  foodAllergies: string;
  message: string;
}

export type RsvpErrors = Partial<Record<keyof RsvpValues, string>>;

export interface RsvpPayload {
  schemaVersion: 1;
  occasion: "visakh-archana-2027-02-11";
  submissionId: string;
  respondedAt: string;
  fullName: string;
  contact: string;
  attending: boolean;
  guestCount: number;
  events: Array<"wedding" | "reception">;
  transportation: { wedding: boolean; reception: boolean };
  accommodation: { required: boolean; rooms: number | null };
  foodAllergies: string;
  message: string;
}

export interface RsvpResult {
  delivery: "local" | "sent";
  payload: RsvpPayload;
}

export const RSVP_STORAGE_KEY = "visakh-archana:rsvp:v1";
export const RSVP_ENDPOINT =
  (import.meta.env.VITE_RSVP_ENDPOINT as string | undefined)?.trim() ?? "";

export const emptyRsvpValues: RsvpValues = {
  fullName: "",
  contact: "",
  attending: "",
  guestCount: "1",
  events: "both",
  weddingTransport: false,
  receptionTransport: false,
  accommodation: false,
  rooms: "",
  foodAllergies: "",
  message: "",
};

export function validateRsvp(values: RsvpValues): RsvpErrors {
  const errors: RsvpErrors = {};
  if (!values.fullName.trim()) errors.fullName = "Please enter your name.";
  const contact = values.contact.trim();
  if (!contact) {
    errors.contact = "Please enter an email address or phone number.";
  } else if (
    contact.includes("@")
      ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)
      : !/^[+\d\s().-]+$/.test(contact) ||
        contact.replace(/\D/g, "").length < 7 ||
        contact.replace(/\D/g, "").length > 15
  ) {
    errors.contact =
      "Enter a valid email address or phone number, including the country code.";
  }
  if (values.attending !== "yes" && values.attending !== "no")
    errors.attending = "Please let us know whether you can join us.";
  if (values.attending === "yes") {
    if (
      !/^\d+$/.test(values.guestCount) ||
      !Number.isSafeInteger(Number(values.guestCount)) ||
      Number(values.guestCount) < 1
    ) {
      errors.guestCount =
        "Enter the number of guests, including yourself (at least 1).";
    }
    if (!["wedding", "reception", "both"].includes(values.events))
      errors.events = "Please choose the celebration you will attend.";
    if (
      values.accommodation &&
      values.rooms &&
      (!/^\d+$/.test(values.rooms) ||
        !Number.isSafeInteger(Number(values.rooms)) ||
        Number(values.rooms) < 1)
    ) {
      errors.rooms =
        "Enter at least 1 room, or leave this blank to arrange it later.";
    }
  }
  return errors;
}

export function createSubmissionId(): string {
  return globalThis.crypto.randomUUID();
}

export function buildRsvpPayload(
  values: RsvpValues,
  submissionId = createSubmissionId(),
): RsvpPayload {
  const attending = values.attending === "yes";
  const events: RsvpPayload["events"] = attending
    ? values.events === "both"
      ? ["wedding", "reception"]
      : values.events
        ? [values.events]
        : []
    : [];
  return {
    schemaVersion: 1,
    occasion: "visakh-archana-2027-02-11",
    submissionId,
    respondedAt: new Date().toISOString(),
    fullName: values.fullName.trim(),
    contact: values.contact.trim(),
    attending,
    guestCount: attending ? Number(values.guestCount) : 0,
    events,
    transportation: {
      wedding: events.includes("wedding") && values.weddingTransport,
      reception: events.includes("reception") && values.receptionTransport,
    },
    accommodation: {
      required: attending && values.accommodation,
      rooms:
        attending && values.accommodation && values.rooms
          ? Number(values.rooms)
          : null,
    },
    foodAllergies: attending ? values.foodAllergies.trim() : "",
    message: values.message.trim(),
  };
}

export function valuesFromPayload(payload: RsvpPayload): RsvpValues {
  return {
    fullName: payload.fullName,
    contact: payload.contact,
    attending: payload.attending ? "yes" : "no",
    guestCount: String(payload.guestCount || 1),
    events:
      payload.events.length === 2 ? "both" : (payload.events[0] ?? "both"),
    weddingTransport: payload.transportation.wedding,
    receptionTransport: payload.transportation.reception,
    accommodation: payload.accommodation.required,
    rooms: payload.accommodation.rooms
      ? String(payload.accommodation.rooms)
      : "",
    foodAllergies: payload.foodAllergies,
    message: payload.message,
  };
}

export function readLocalRsvp(): RsvpPayload | null {
  try {
    const stored = localStorage.getItem(RSVP_STORAGE_KEY);
    if (!stored) return null;
    const value = JSON.parse(stored) as RsvpPayload;
    if (
      value.schemaVersion !== 1 ||
      value.occasion !== "visakh-archana-2027-02-11" ||
      typeof value.submissionId !== "string" ||
      typeof value.respondedAt !== "string" ||
      typeof value.fullName !== "string" ||
      typeof value.contact !== "string" ||
      typeof value.attending !== "boolean" ||
      typeof value.guestCount !== "number" ||
      !Array.isArray(value.events) ||
      !value.events.every(
        (event) => event === "wedding" || event === "reception",
      ) ||
      typeof value.transportation?.wedding !== "boolean" ||
      typeof value.transportation?.reception !== "boolean" ||
      typeof value.accommodation?.required !== "boolean" ||
      !(
        value.accommodation.rooms === null ||
        typeof value.accommodation.rooms === "number"
      ) ||
      typeof value.foodAllergies !== "string" ||
      typeof value.message !== "string"
    )
      return null;
    return Object.keys(validateRsvp(valuesFromPayload(value))).length
      ? null
      : value;
  } catch {
    return null;
  }
}

/** The future backend must validate this schema and deduplicate by submissionId. */
export async function submitRsvp(
  values: RsvpValues,
  options: { endpoint?: string; submissionId?: string } = {},
): Promise<RsvpResult> {
  if (Object.keys(validateRsvp(values)).length)
    throw new Error("Please check your answers before saving your response.");
  const payload = buildRsvpPayload(values, options.submissionId);
  const endpoint = options.endpoint ?? RSVP_ENDPOINT;
  if (!endpoint) {
    try {
      localStorage.setItem(RSVP_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      throw new Error(
        "This browser could not save your response. Your answers are still here; use “Download my response” to keep a copy.",
      );
    }
    return { delivery: "local", payload };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": payload.submissionId,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      credentials: "omit",
    });
    if (!response.ok) {
      throw new Error(
        response.status === 429
          ? "Too many requests were received. Your answers are still here; please wait a moment and try again."
          : "Your response could not be accepted. Your answers are still here; please check them and try again.",
      );
    }
    return { delivery: "sent", payload };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.startsWith("Your response") ||
        error.message.startsWith("Too many"))
    )
      throw error;
    throw new Error(
      "We could not confirm that your response was received. Your answers are still here; check your connection and try again.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function downloadRsvp(payload: RsvpPayload): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "visakh-and-archana-rsvp.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
