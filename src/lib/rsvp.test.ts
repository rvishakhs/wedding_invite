import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RSVP_STORAGE_KEY,
  buildRsvpPayload,
  emptyRsvpValues,
  readLocalRsvp,
  submitRsvp,
  validateRsvp,
  valuesForInvitation,
  type RsvpInvitation,
  type RsvpValues,
} from "./rsvp";

const accepted: RsvpValues = {
  ...emptyRsvpValues,
  fullName: "  Anjali Kumar  ",
  contact: "anjali@example.com",
  attending: "yes",
  guestCount: "3",
  events: "both",
  weddingTransport: true,
  receptionTransport: true,
  accommodation: true,
  rooms: "2",
  foodAllergies: "  Anjali: peanut allergy  ",
};

function mockStorage() {
  const entries = new Map<string, string>();
  const storage = {
    getItem: vi.fn((key: string) => entries.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => entries.set(key, value)),
  };
  vi.stubGlobal("localStorage", storage);
  return storage;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("RSVP validation and payload", () => {
  it("requires a name, contact and attendance choice", () => {
    expect(Object.keys(validateRsvp(emptyRsvpValues))).toEqual([
      "fullName",
      "contact",
      "attending",
    ]);
  });

  it("accepts email and formatted international phone numbers", () => {
    expect(validateRsvp(accepted)).toEqual({});
    expect(validateRsvp({ ...accepted, contact: "+91 98765 43210" })).toEqual(
      {},
    );
    expect(
      validateRsvp({ ...accepted, contact: "not a contact" }).contact,
    ).toBeTruthy();
    expect(
      validateRsvp({ ...accepted, contact: "name@example" }).contact,
    ).toBeTruthy();
  });

  it.each(["0", "-1", "1.5", "1e2", "", "9007199254740992"])(
    "rejects invalid attending guest count %s",
    (guestCount) => {
      expect(validateRsvp({ ...accepted, guestCount }).guestCount).toBeTruthy();
    },
  );

  it("clears attendance logistics when declining without rejecting hidden values", () => {
    const declined = { ...accepted, attending: "no" as const, guestCount: "" };
    expect(validateRsvp(declined)).toEqual({});
    expect(buildRsvpPayload(declined, "test-id")).toMatchObject({
      attending: false,
      guestCount: 0,
      events: [],
      transportation: { wedding: false, reception: false },
      accommodation: { required: false, rooms: null },
      foodAllergies: "",
    });
  });

  it("includes transport only for the celebration being attended and trims text", () => {
    expect(
      buildRsvpPayload({ ...accepted, events: "wedding" }, "test-id"),
    ).toMatchObject({
      fullName: "Anjali Kumar",
      events: ["wedding"],
      transportation: { wedding: true, reception: false },
      foodAllergies: "Anjali: peanut allergy",
    });
  });
});

describe("RSVP delivery", () => {
  it("saves locally and never calls fetch when no endpoint is configured", async () => {
    const storage = mockStorage();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await submitRsvp(accepted, {
      endpoint: "",
      submissionId: "test-id",
    });
    expect(result.delivery).toBe("local");
    expect(storage.setItem).toHaveBeenCalledWith(
      RSVP_STORAGE_KEY,
      expect.any(String),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readLocalRsvp()).toEqual(result.payload);
  });

  it("does not claim success if browser storage is unavailable", async () => {
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("Storage blocked");
      },
    });
    await expect(
      submitRsvp(accepted, { endpoint: "", submissionId: "test-id" }),
    ).rejects.toThrow("This browser could not save");
  });

  it("ignores malformed saved data", () => {
    const storage = mockStorage();
    storage.setItem(RSVP_STORAGE_KEY, "{bad json");
    expect(readLocalRsvp()).toBeNull();
    storage.setItem(RSVP_STORAGE_KEY, JSON.stringify({ schemaVersion: 1 }));
    expect(readLocalRsvp()).toBeNull();
  });

  it("posts once with a stable idempotency key and reports received only on success", async () => {
    const storage = mockStorage();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201 });
    vi.stubGlobal("fetch", fetchMock);
    const result = await submitRsvp(accepted, {
      endpoint: "/api/rsvp",
      submissionId: "stable-id",
    });
    expect(result.delivery).toBe("sent");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/rsvp",
      expect.objectContaining({
        method: "POST",
        credentials: "omit",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "stable-id",
        },
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).submissionId).toBe(
      "stable-id",
    );
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("rejects server errors without falling back to a misleading local success", async () => {
    const storage = mockStorage();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );
    await expect(
      submitRsvp(accepted, { endpoint: "/api/rsvp", submissionId: "test-id" }),
    ).rejects.toThrow("could not be accepted");
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("describes network failure as unconfirmed delivery", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Network unavailable")),
    );
    await expect(
      submitRsvp(accepted, { endpoint: "/api/rsvp", submissionId: "test-id" }),
    ).rejects.toThrow("could not confirm");
  });

  it("blocks invalid payloads before storing or sending", async () => {
    const storage = mockStorage();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      submitRsvp(emptyRsvpValues, { endpoint: "/api/rsvp" }),
    ).rejects.toThrow("check your answers");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});

describe("personalized invitations", () => {
  const invitation: RsvpInvitation = {
    token: "guest-link",
    name: "Anjali and family",
    events: "wedding",
    response: null,
  };

  it("prefills the invitation name and permitted celebration without a guest allowance", () => {
    const values = valuesForInvitation(invitation);
    expect(values.fullName).toBe("Anjali and family");
    expect(values.events).toBe("wedding");
    expect(
      validateRsvp({
        ...values,
        contact: "anjali@example.com",
        attending: "yes",
        guestCount: "30",
      }),
    ).toEqual({});
  });

  it("restores the saved response while removing reception access after an invitation change", () => {
    const values = valuesForInvitation({
      ...invitation,
      response: buildRsvpPayload(accepted, "existing-response"),
    });
    expect(values).toMatchObject({
      fullName: "Anjali Kumar",
      contact: "anjali@example.com",
      guestCount: "3",
      events: "wedding",
      receptionTransport: false,
      weddingTransport: true,
    });
  });

  it("uses the invitation endpoint and server-confirmed payload without local storage", async () => {
    const storage = mockStorage();
    const values = { ...accepted, events: "wedding" as const };
    const confirmed = {
      ...buildRsvpPayload(values, "server-current-response"),
      respondedAt: "2026-10-21T12:00:00Z",
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: confirmed }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await submitRsvp(values, {
      invitation,
      endpoint: "",
      submissionId: "replayed-id",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/invitations/guest-link/rsvp",
      expect.objectContaining({
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "replayed-id",
        },
      }),
    );
    expect(result).toEqual({ delivery: "sent", payload: confirmed });
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.getItem).not.toHaveBeenCalled();
  });

  it("blocks a reception response for a wedding-only invitation before sending", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(submitRsvp(accepted, { invitation })).rejects.toThrow(
      "invitation details have changed",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([401, 403, 404, 410])(
    "shows unavailable invitation feedback for HTTP %s without saving locally",
    async (status) => {
      const storage = mockStorage();
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status }));
      await expect(
        submitRsvp({ ...accepted, events: "wedding" }, { invitation }),
      ).rejects.toThrow("invitation is no longer available");
      expect(storage.setItem).not.toHaveBeenCalled();
    },
  );

  it("keeps a conflicting response unconfirmed so the guest can review current details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 409 }),
    );
    await expect(
      submitRsvp({ ...accepted, events: "wedding" }, { invitation }),
    ).rejects.toThrow("invitation or response has changed");
  });

  it("does not claim delivery for an empty or malformed success response", async () => {
    const storage = mockStorage();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ response: {} }) }),
    );
    await expect(
      submitRsvp({ ...accepted, events: "wedding" }, { invitation }),
    ).rejects.toThrow("could not confirm");
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
