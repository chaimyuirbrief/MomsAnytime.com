/**
 * Design reminder — The Keepsake Almanac: the form is a paper note, not a
 * conversion device. Hairline rules instead of boxed inputs, invitations
 * instead of commands.
 */
import { useState } from "react";
import { ArrowUpRight, Send } from "lucide-react";

// Formspree endpoint. Form action URLs are public by design — they live in the
// page's markup either way — so this is not a secret.
const FORMSPREE_ENDPOINT = "https://formspree.io/f/xwlerjkw";

const purposes = [
  {
    value: "A testimonial",
    label: "Share a testimonial",
    hint: "A story about someone who mothered you.",
  },
  {
    value: "An offer to contribute",
    label: "Help make it better",
    hint: "Words, photographs, code, or an idea.",
  },
];

type Status = "idle" | "submitting" | "success" | "error";

export default function ContributeForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Capture the element now: `currentTarget` is nulled out once we await.
    const form = event.currentTarget;

    setStatus("submitting");
    setErrorMessage("");

    try {
      const response = await fetch(FORMSPREE_ENDPOINT, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: new FormData(form),
      });

      if (response.ok) {
        form.reset();
        setStatus("success");
        return;
      }

      const data = await response.json().catch(() => null);
      const detail = Array.isArray(data?.errors)
        ? data.errors.map((item: { message?: string }) => item.message).filter(Boolean).join(" ")
        : "";
      setErrorMessage(detail || "That did not send. Please try once more.");
      setStatus("error");
    } catch {
      setErrorMessage("We could not reach the server. Check your connection and try again.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="contribute-card contribute-thanks" role="status">
        <span className="note-pin" aria-hidden="true" />
        <h3>Thank you — it arrived.</h3>
        <p>
          Someone will read every word. If you left an address, you may hear back;
          either way, your note is part of this now.
        </p>
        <button type="button" className="reflection-button" onClick={() => setStatus("idle")}>
          Write another <ArrowUpRight size={16} aria-hidden="true" />
        </button>
      </div>
    );
  }

  const submitting = status === "submitting";

  return (
    <form className="contribute-card" onSubmit={handleSubmit} noValidate={false}>
      <span className="note-pin" aria-hidden="true" />

      <input type="hidden" name="_subject" value="For All the Moms — a new note" />
      {/* Honeypot: real people never see this, bots fill it in. */}
      <p className="honeypot" aria-hidden="true">
        <label htmlFor="company">Company</label>
        <input id="company" type="text" name="_gotcha" tabIndex={-1} autoComplete="off" />
      </p>

      <fieldset className="field field-purpose">
        <legend className="field-label">What brings you here</legend>
        {purposes.map((purpose, index) => (
          <label className="purpose-option" key={purpose.value}>
            <input
              type="radio"
              name="purpose"
              value={purpose.value}
              defaultChecked={index === 0}
            />
            <span>
              <strong>{purpose.label}</strong>
              <em>{purpose.hint}</em>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="field-row">
        <p className="field">
          <label className="field-label" htmlFor="contribute-name">
            Your name
          </label>
          <input
            id="contribute-name"
            name="name"
            type="text"
            autoComplete="name"
            required
            placeholder="However you'd like to be known"
          />
        </p>
        <p className="field">
          <label className="field-label" htmlFor="contribute-email">
            Email <span className="field-optional">optional</span>
          </label>
          <input
            id="contribute-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="Only if you'd like a reply"
          />
        </p>
      </div>

      <p className="field">
        <label className="field-label" htmlFor="contribute-message">
          Your note
        </label>
        <textarea
          id="contribute-message"
          name="message"
          rows={5}
          required
          placeholder="Name a real act of care, or tell us what you'd like to help build."
        />
      </p>

      <div className="contribute-actions">
        <button type="submit" className="contribute-submit" disabled={submitting}>
          {submitting ? "Sending…" : "Send your note"}
          <Send size={15} aria-hidden="true" />
        </button>
        <p className="contribute-fineprint">
          Shared only with the people tending this page.
        </p>
      </div>

      <p className="form-status" role="status" aria-live="polite">
        {status === "error" ? errorMessage : ""}
      </p>
    </form>
  );
}
