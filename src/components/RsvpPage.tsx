import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  Heart,
  LoaderCircle,
} from "lucide-react";
import {
  RSVP_ENDPOINT,
  buildRsvpPayload,
  createSubmissionId,
  downloadRsvp,
  emptyRsvpValues,
  readLocalRsvp,
  submitRsvp,
  validateRsvp,
  valuesForInvitation,
  valuesFromPayload,
  type RsvpErrors,
  type RsvpInvitation,
  type RsvpPayload,
  type RsvpResult,
  type RsvpValues,
} from "../lib/rsvp";
import "./RsvpPage.css";

// Keep an in-progress response when guests move between the invitation and this page.
// Personalized details stay in memory, isolated by invitation and server revision.
const sessionDrafts = new Map<
  string,
  { values: RsvpValues; revision: string; submissionId: string | null }
>();

interface RsvpPageProps {
  onBack: () => void;
  invitation?: RsvpInvitation;
  onSaved?: (payload: RsvpPayload) => void;
}

export function RsvpPage(props: RsvpPageProps) {
  // A different invitation must never inherit another guest's mounted form.
  const identity = props.invitation
    ? JSON.stringify([
        props.invitation.token,
        props.invitation.name,
        props.invitation.events,
      ])
    : "demo";
  return <RsvpForm key={identity} {...props} />;
}

function RsvpForm({ onBack, invitation, onSaved }: RsvpPageProps) {
  const scope = invitation?.token ?? "demo";
  const revision = invitation
    ? JSON.stringify([
        invitation.name,
        invitation.events,
        invitation.response?.submissionId,
        invitation.response?.respondedAt,
      ])
    : "demo";
  const [saved, setSaved] = useState(() =>
    invitation ? invitation.response : readLocalRsvp(),
  );
  const initialValues = invitation
    ? valuesForInvitation(invitation)
    : saved
      ? valuesFromPayload(saved)
      : { ...emptyRsvpValues };
  const [values, setValues] = useState<RsvpValues>(() => {
    const draft = sessionDrafts.get(scope);
    return draft?.revision === revision ? draft.values : initialValues;
  });
  const [errors, setErrors] = useState<RsvpErrors>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [result, setResult] = useState<RsvpResult | null>(null);
  const [committedValues, setCommittedValues] = useState(() =>
    JSON.stringify(initialValues),
  );
  const formRef = useRef<HTMLFormElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const submissionId = useRef<string | null>(
    sessionDrafts.get(scope)?.revision === revision
      ? (sessionDrafts.get(scope)?.submissionId ?? null)
      : null,
  );
  const submitting = useRef(false);
  const isLocal = !invitation && !RSVP_ENDPOINT;
  const allowsReception = !invitation || invitation.events === "both";
  const attending = values.attending === "yes";
  const changed = JSON.stringify(values) !== committedValues;

  useEffect(() => {
    sessionDrafts.set(scope, {
      values,
      revision,
      submissionId: submissionId.current,
    });
  }, [values, scope, revision]);

  useEffect(() => {
    if (!changed || result) return;
    const protectDraft = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protectDraft);
    return () => window.removeEventListener("beforeunload", protectDraft);
  }, [changed, result]);

  useEffect(() => {
    if (result) successRef.current?.focus();
  }, [result]);

  useLayoutEffect(() => {
    function growNotes() {
      formRef.current
        ?.querySelectorAll<HTMLTextAreaElement>("textarea")
        .forEach((field) => {
          field.style.height = "auto";
          field.style.height = `${field.scrollHeight + 2}px`;
        });
    }
    growNotes();
    window.addEventListener("resize", growNotes);
    return () => window.removeEventListener("resize", growNotes);
  }, [values.foodAllergies, values.message, attending, result]);

  function update<K extends keyof RsvpValues>(field: K, value: RsvpValues[K]) {
    if (submitting.current || values[field] === value) return;
    const next = { ...values, [field]: value };
    setValues(next);
    if (errors[field])
      setErrors((current) => ({
        ...current,
        [field]: validateRsvp(next)[field],
      }));
    setProblem("");
    submissionId.current = null;
    sessionDrafts.set(scope, { values: next, revision, submissionId: null });
  }

  function validate(): boolean {
    const nextErrors = validateRsvp(values);
    setErrors(nextErrors);
    const first = Object.keys(nextErrors)[0];
    if (!first) return true;
    requestAnimationFrame(() => {
      const target = formRef.current?.querySelector<HTMLElement>(
        `[name="${first}"]`,
      );
      target?.focus();
      target?.scrollIntoView({ block: "center", behavior: "auto" });
    });
    return false;
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !validate()) return;
    submitting.current = true;
    setBusy(true);
    setProblem("");
    submissionId.current ??= createSubmissionId();
    // Keep the pending operation identity when navigating to the invitation and
    // back after an uncertain network result. A retry must not become a new write.
    sessionDrafts.set(scope, {
      values,
      revision,
      submissionId: submissionId.current,
    });
    try {
      const received = await submitRsvp(values, {
        submissionId: submissionId.current,
        invitation,
      });
      const committed = invitation
        ? valuesForInvitation({ ...invitation, response: received.payload })
        : valuesFromPayload(received.payload);
      submissionId.current = null;
      setValues(committed);
      setSaved(received.payload);
      setResult(received);
      setCommittedValues(JSON.stringify(committed));
      if (invitation) onSaved?.(received.payload);
    } catch (error) {
      setProblem(
        error instanceof Error
          ? error.message
          : "Your response could not be saved. Please try again.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const fieldError = (name: keyof RsvpValues) =>
    errors[name] ? (
      <span className="rsvp-field-error" id={`rsvp-${name}-error`}>
        {errors[name]}
      </span>
    ) : null;
  const errorProps = (name: keyof RsvpValues) => ({
    "aria-invalid": !!errors[name],
    "aria-describedby": errors[name] ? `rsvp-${name}-error` : undefined,
  });

  return (
    <div className="rsvp-page" id="rsvp-page">
      <div className="rsvp-topbar">
        <button
          className="rsvp-back"
          type="button"
          onClick={onBack}
          disabled={busy}
        >
          <ArrowLeft size={16} /> The invitation
        </button>
        <span className="rsvp-monogram">
          V <span>&</span> A
        </span>
        <span className="rsvp-top-date">11 · 02 · 2027</span>
      </div>
      <div className="rsvp-layout">
        <header className="rsvp-introduction">
          <span className="rsvp-script">please</span>
          <h1 className="rsvp-page-lettering" aria-label="RSVP">
            <span>RS</span>
            <span>VP</span>
          </h1>
          <div className="rsvp-fine-rule">
            <span />
            <Heart size={13} strokeWidth={1.3} />
            <span />
          </div>
          <p className="rsvp-intro-title">
            A day made lovelier
            <br />
            with you in it.
          </p>
          <p className="rsvp-intro-copy">
            We would love to celebrate with you.
            <br />
            Let us know if you can join us.
          </p>
          <p className="rsvp-couple">
            Visakh <span>&</span> Archana
          </p>
          <p className="rsvp-small-date">THURSDAY, 11 FEBRUARY 2027</p>
        </header>

        <section className="rsvp-form-panel" aria-label="Your RSVP">
          {result ? (
            <div
              className="rsvp-result"
              ref={successRef}
              tabIndex={-1}
              role="status"
            >
              <span className="rsvp-result-icon">
                <Check size={26} strokeWidth={1.25} />
              </span>
              <span className="rsvp-eyebrow">
                {result.delivery === "local"
                  ? "KEPT FOR LATER"
                  : "WITH LOVE & THANKS"}
              </span>
              <h2>
                {result.delivery === "local"
                  ? "Your response is saved."
                  : "Thank you for your RSVP."}
              </h2>
              <p>
                {result.delivery === "local"
                  ? "Your response is saved in this browser only. It has not been sent to Visakh and Archana. You can download a copy to share with them."
                  : attending
                    ? "Your response has been received. We cannot wait to share this special day with you."
                    : "Your response has been received. You will be in our thoughts as we celebrate."}
              </p>
              <dl className="rsvp-summary">
                <div>
                  <dt>Guest</dt>
                  <dd>{result.payload.fullName}</dd>
                </div>
                <div>
                  <dt>Response</dt>
                  <dd>
                    {result.payload.attending
                      ? `${result.payload.guestCount} ${result.payload.guestCount === 1 ? "guest" : "guests"} attending`
                      : "Unable to attend"}
                  </dd>
                </div>
                {result.payload.attending && (
                  <div>
                    <dt>Celebration</dt>
                    <dd>
                      {result.payload.events.length === 2
                        ? "Wedding & reception"
                        : result.payload.events[0] === "wedding"
                          ? "Wedding ceremony"
                          : "Reception"}
                    </dd>
                  </div>
                )}
              </dl>
              {result.delivery === "local" && (
                <button
                  type="button"
                  className="rsvp-primary"
                  onClick={() => downloadRsvp(result.payload)}
                >
                  <Download size={16} /> Download my response
                </button>
              )}
              <button
                type="button"
                className="rsvp-secondary"
                onClick={() => {
                  setResult(null);
                  requestAnimationFrame(() =>
                    formRef.current
                      ?.querySelector<HTMLInputElement>("input")
                      ?.focus(),
                  );
                }}
              >
                Edit my response
              </button>
              <button
                type="button"
                className="rsvp-text-button"
                onClick={onBack}
              >
                Back to the invitation <ArrowRight size={14} />
              </button>
            </div>
          ) : (
            <>
              <div className="rsvp-form-heading">
                <span className="rsvp-eyebrow">
                  YOUR PRESENCE IS OUR PRESENT
                </span>
                <h2>Will you join us?</h2>
                <p>
                  {invitation
                    ? `${invitation.name}, we would love to hear from you.`
                    : "One response for you and your party."}
                </p>
              </div>
              {isLocal && (
                <p className="rsvp-local-note">
                  <strong>RSVP collection is coming soon.</strong> For now, you
                  can save your answers on this device. They will not be sent to
                  the couple.
                </p>
              )}
              {saved && !isLocal && (
                <p className="rsvp-local-note">
                  {invitation
                    ? "We have your RSVP. Your latest answers are filled in below; send an update if your plans have changed."
                    : "Your previously saved answers are filled in below. Send your RSVP to share them with the couple."}
                </p>
              )}
              <form
                className="rsvp-form"
                ref={formRef}
                onSubmit={save}
                noValidate
                aria-busy={busy}
              >
                <fieldset disabled={busy} className="rsvp-fields">
                  <legend className="rsvp-sr-only">Your response</legend>
                  <div className="rsvp-field">
                    <label htmlFor="rsvp-fullName">
                      Your full name <span aria-hidden="true">*</span>
                    </label>
                    <input
                      id="rsvp-fullName"
                      name="fullName"
                      autoComplete="name"
                      value={values.fullName}
                      onChange={(event) =>
                        update("fullName", event.target.value)
                      }
                      placeholder="The name on your invitation"
                      required
                      {...errorProps("fullName")}
                    />
                    {fieldError("fullName")}
                  </div>
                  <div className="rsvp-field">
                    <label htmlFor="rsvp-contact">
                      Email address or phone number{" "}
                      <span aria-hidden="true">*</span>
                    </label>
                    <input
                      id="rsvp-contact"
                      name="contact"
                      type="text"
                      autoComplete="on"
                      value={values.contact}
                      onChange={(event) =>
                        update("contact", event.target.value)
                      }
                      placeholder="So we can keep in touch"
                      required
                      {...errorProps("contact")}
                    />
                    {fieldError("contact")}
                  </div>
                  <fieldset
                    className="rsvp-choice-field"
                    aria-describedby={
                      errors.attending ? "rsvp-attending-error" : undefined
                    }
                  >
                    <legend>
                      Can you celebrate with us?{" "}
                      <span aria-hidden="true">*</span>
                    </legend>
                    <label className="rsvp-choice">
                      <input
                        type="radio"
                        name="attending"
                        value="yes"
                        checked={values.attending === "yes"}
                        onChange={() => update("attending", "yes")}
                        required
                        {...errorProps("attending")}
                      />
                      <span>Joyfully accept</span>
                      <Heart size={14} />
                    </label>
                    <label className="rsvp-choice">
                      <input
                        type="radio"
                        name="attending"
                        value="no"
                        checked={values.attending === "no"}
                        onChange={() => update("attending", "no")}
                        {...errorProps("attending")}
                      />
                      <span>Regretfully decline</span>
                    </label>
                    {fieldError("attending")}
                  </fieldset>
                  {attending && (
                    <div className="rsvp-attending-fields">
                      <div className="rsvp-field rsvp-count-field">
                        <label htmlFor="rsvp-guestCount">
                          Number of guests <span aria-hidden="true">*</span>
                          <small>Including yourself</small>
                        </label>
                        <input
                          id="rsvp-guestCount"
                          name="guestCount"
                          type="number"
                          min="1"
                          step="1"
                          inputMode="numeric"
                          value={values.guestCount}
                          onChange={(event) =>
                            update("guestCount", event.target.value)
                          }
                          required
                          {...errorProps("guestCount")}
                        />
                        {fieldError("guestCount")}
                      </div>
                      {allowsReception ? (
                        <fieldset className="rsvp-choice-field">
                          <legend>
                            Which celebrations will you attend?{" "}
                            <span aria-hidden="true">*</span>
                          </legend>
                          <div className="rsvp-event-options">
                            {(
                              [
                                { value: "wedding", label: "Wedding" },
                                { value: "reception", label: "Reception" },
                                { value: "both", label: "Both" },
                              ] as const
                            ).map((option) => (
                              <label
                                className="rsvp-event-option"
                                key={option.value}
                              >
                                <input
                                  type="radio"
                                  name="events"
                                  value={option.value}
                                  checked={values.events === option.value}
                                  onChange={() =>
                                    update("events", option.value)
                                  }
                                  {...errorProps("events")}
                                />
                                <span>{option.label}</span>
                              </label>
                            ))}
                          </div>
                          {fieldError("events")}
                        </fieldset>
                      ) : (
                        <p className="rsvp-field-hint">
                          We look forward to seeing you at the wedding ceremony.
                        </p>
                      )}
                      <div className="rsvp-form-divider">
                        <span>A little planning</span>
                      </div>
                      <fieldset className="rsvp-choice-field rsvp-transport">
                        <legend>Would you like arranged transportation?</legend>
                        <p className="rsvp-field-hint">
                          Select the journeys your party needs.
                        </p>
                        {(values.events === "both" ||
                          values.events === "wedding") && (
                          <label className="rsvp-choice rsvp-choice-detailed">
                            <input
                              type="checkbox"
                              name="weddingTransport"
                              checked={values.weddingTransport}
                              onChange={(event) =>
                                update("weddingTransport", event.target.checked)
                              }
                            />
                            <span>
                              Wedding ceremony
                              <small>
                                From the groom’s home · 9:00 AM onwards
                              </small>
                            </span>
                          </label>
                        )}
                        {allowsReception &&
                          (values.events === "both" ||
                            values.events === "reception") && (
                            <label className="rsvp-choice rsvp-choice-detailed">
                              <input
                                type="checkbox"
                                name="receptionTransport"
                                checked={values.receptionTransport}
                                onChange={(event) =>
                                  update(
                                    "receptionTransport",
                                    event.target.checked,
                                  )
                                }
                              />
                              <span>
                                Reception
                                <small>
                                  Departure · 5:00 PM / Return · 8:30 PM
                                </small>
                              </span>
                            </label>
                          )}
                        {allowsReception &&
                          (values.events === "both" ||
                            values.events === "reception") && (
                            <p className="rsvp-field-hint">
                              For an earlier return, please arrange your own
                              transport. The reception continues until 10:00 PM.
                            </p>
                          )}
                      </fieldset>
                      <fieldset className="rsvp-choice-field">
                        <legend>Would you like accommodation?</legend>
                        <p className="rsvp-field-hint">
                          Accommodation is available on request.
                        </p>
                        <div className="rsvp-inline-choices">
                          <label className="rsvp-choice">
                            <input
                              type="radio"
                              name="accommodation"
                              checked={values.accommodation}
                              onChange={() => update("accommodation", true)}
                            />
                            <span>Yes, please</span>
                          </label>
                          <label className="rsvp-choice">
                            <input
                              type="radio"
                              name="accommodation"
                              checked={!values.accommodation}
                              onChange={() => update("accommodation", false)}
                            />
                            <span>No, thank you</span>
                          </label>
                        </div>
                        {values.accommodation && (
                          <div className="rsvp-field rsvp-count-field rsvp-rooms">
                            <label htmlFor="rsvp-rooms">
                              Rooms requested{" "}
                              <small>
                                Optional · we will confirm arrangements
                              </small>
                            </label>
                            <input
                              id="rsvp-rooms"
                              name="rooms"
                              type="number"
                              min="1"
                              step="1"
                              inputMode="numeric"
                              value={values.rooms}
                              onChange={(event) =>
                                update("rooms", event.target.value)
                              }
                              placeholder="1"
                              {...errorProps("rooms")}
                            />
                            {fieldError("rooms")}
                          </div>
                        )}
                      </fieldset>
                      <div className="rsvp-field">
                        <label htmlFor="rsvp-foodAllergies">
                          Food allergies or dietary requirements{" "}
                          <small>
                            Optional · please include the guest’s name
                          </small>
                        </label>
                        <textarea
                          className="resize-none"
                          id="rsvp-foodAllergies"
                          name="foodAllergies"
                          rows={3}
                          value={values.foodAllergies}
                          onChange={(event) =>
                            update("foodAllergies", event.target.value)
                          }
                          placeholder="Anything we should know to look after you?"
                          {...errorProps("foodAllergies")}
                        />
                        {fieldError("foodAllergies")}
                        <p className="rsvp-field-hint">
                          Please tell us about any food allergies so we can plan
                          with care.
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="rsvp-field">
                    <label htmlFor="rsvp-message">
                      A little note for us <small>Optional</small>
                    </label>
                    <textarea
                      className="resize-none"
                      id="rsvp-message"
                      name="message"
                      rows={3}
                      value={values.message}
                      onChange={(event) =>
                        update("message", event.target.value)
                      }
                      placeholder="Your wishes, a favourite memory, or just a hello…"
                      {...errorProps("message")}
                    />
                    {fieldError("message")}
                  </div>
                </fieldset>
                {problem && (
                  <p className="rsvp-form-error" role="alert">
                    {problem}
                  </p>
                )}
                <button className="rsvp-primary" type="submit" disabled={busy}>
                  <span>
                    {busy ? (
                      <>
                        <LoaderCircle className="rsvp-spinner" size={17} />{" "}
                        {isLocal
                          ? "Saving your response…"
                          : "Sending your RSVP…"}
                      </>
                    ) : (
                      <>
                        {isLocal
                          ? "Save my response"
                          : saved
                            ? "Send my updated RSVP"
                            : "Send my RSVP"}{" "}
                        <ArrowRight size={17} />
                      </>
                    )}
                  </span>
                </button>
                {isLocal && (
                  <>
                    <p className="rsvp-storage-note">
                      Saved only in this browser. Not sent to the couple.
                    </p>
                    <button
                      className="rsvp-text-button rsvp-download"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (validate()) downloadRsvp(buildRsvpPayload(values));
                      }}
                    >
                      <Download size={14} /> Download my response
                    </button>
                  </>
                )}
                <p className="rsvp-required-note">* Required details</p>
              </form>
            </>
          )}
        </section>
      </div>
      <footer className="rsvp-page-footer">
        <span className="rsvp-script">with love,</span>
        <p>Visakh S R & Archana A</p>
      </footer>
    </div>
  );
}
