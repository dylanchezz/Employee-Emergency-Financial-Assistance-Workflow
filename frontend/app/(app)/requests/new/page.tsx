"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/app/lib/api";
import { useSession } from "@/app/lib/session";

const CATEGORIES = [
  "Medical Emergency",
  "Bereavement",
  "Hardship/Emergency Assistance",
  "Education Support",
];

// Editable starting drafts, keyed by category. Picking a category pre-fills the
// description with a relevant template the employee can then edit — it never
// overwrites text they've already typed.
const DESCRIPTION_TEMPLATES: Record<string, string> = {
  "Medical Emergency":
    "Requesting assistance with medical expenses for ",
  Bereavement:
    "Requesting bereavement assistance following the passing of ",
  "Hardship/Emergency Assistance":
    "Requesting emergency assistance due to ",
  "Education Support":
    "Requesting education support for ",
};

export default function NewRequestPage() {
  const router = useRouter();

  // Phase 3: who is requesting comes from the shared session (the shell guards sign-in). Works for
  // approvers too (A7/C8) — the backend already accepted their submissions and routes a
  // supervisor's own request to tier 2 (RoutingPolicy, D1).
  const { name: employeeName } = useSession();
  // D1/C7: an "Unassigned" account must choose a department first — say so up front instead of
  // letting them fill the whole form and fail on submit. (The backend enforces it either way.)
  const [needsDepartment, setNeedsDepartment] = useState(false);

  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [salary, setSalary] = useState("");
  const [employmentMonths, setEmploymentMonths] = useState("");
  const [hasDocuments, setHasDocuments] = useState(false);
  const [file, setFile] = useState<File | null>(null);
    // True while the description still holds an unedited template (so switching
  // category may replace it). Flips to false the moment the user edits the text.
  const [descriptionIsTemplate, setDescriptionIsTemplate] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch<{ needsDepartment: boolean }>("/me/department").then((res) => {
      if (res.ok) setNeedsDepartment(res.data.needsDepartment);
    });
  }, []);

  // When a category is chosen, offer a description draft — but only if the
  // description is still empty, so we never discard the employee's own words.
  function handleCategoryChange(next: string) {
    setCategory(next);
    // Fill the draft if the box is empty OR still holds an unedited template —
    // but never overwrite text the user has actually typed themselves.
    if ((description.trim() === "" || descriptionIsTemplate) && DESCRIPTION_TEMPLATES[next]) {
      setDescription(DESCRIPTION_TEMPLATES[next]);
      setDescriptionIsTemplate(true);
    }
  }

  // Live amount-vs-salary signal, mirroring the server's 1.5x rule, shown before
  // submit so there are no surprises. Returns null when we can't yet judge.
  const amountNum = Number(amount);
  const salaryNum = Number(salary);
  const overSalaryThreshold =
    amountNum > 0 && salaryNum > 0 && amountNum > 1.5 * salaryNum;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    // Client-side checks mirror the server's; the server remains the source of truth.
    if (!category) {
      setError("Please choose a category.");
      return;
    }
    if (Number(amount) <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }

    // If a file was chosen, pre-check type and size (convenience — the server
    // re-validates by the file's real signature).
    if (file) {
      const allowed = ["application/pdf", "image/jpeg", "image/png"];
      if (!allowed.includes(file.type)) {
        setError("Only PDF, JPEG, or PNG files are allowed.");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError("File must be 5 MB or smaller.");
        return;
      }
    }

    // Build multipart form data: the request fields plus the optional file.
    const formData = new FormData();
    formData.append("category", category);
    formData.append("amount", String(Number(amount)));
    formData.append("description", description || "");
    formData.append("salary", String(Number(salary)));
    formData.append("employmentDurationMonths", String(Number(employmentMonths)));
    formData.append("hasDocuments", hasDocuments ? "1" : "0");
    if (file) {
      formData.append("document", file);
    }

    setLoading(true);
    const result = await apiFetch<{ requestId: number }>("/requests", {
      method: "POST",
      body: formData,
    });
    setLoading(false);

    if (!result.ok) {
      if (result.status === 401) {
        router.replace("/");
        return;
      }
      setError(result.error);
      return;
    }

    setSuccess(`Request submitted. Reference #${result.data.requestId}.`);
    // Reset the form for another submission.
    setCategory("");
    setAmount("");
    setDescription("");
    setDescriptionIsTemplate(false);
    setSalary("");
    setEmploymentMonths("");
    setHasDocuments(false);
    setFile(null);
  }

  const fieldClass =
    "mt-1.5 w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-ink outline-none transition focus:border-kq-red focus:ring-2 focus:ring-kq-red/20";

  return (
    // Phase 3: content inside the AppShell (the sidebar replaces the old "Back to dashboard",
    // which also assumed every requester was an Employee).
    <div>
      <div className="mx-auto w-full max-w-xl">
        <h1 className="font-[family-name:var(--font-heading)] text-3xl font-bold text-ink">
          New assistance request
        </h1>
        <p className="mt-1 text-ink-soft">
          Tell us what you need help with. Urgent cases are reviewed first.
        </p>

        {needsDepartment && (
          <div className="mt-6 rounded-2xl border border-medium/30 bg-medium/10 p-5 text-sm text-ink" role="status">
            Choose your department before submitting a request — it decides which Department Supervisor
            reviews it first.{" "}
            <Link href="/profile" className="font-medium text-kq-red hover:underline">Go to Profile →</Link>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-8 rounded-2xl border border-line bg-surface p-6 sm:p-8">
          {/* Requesting as — pre-filled from the session, not retyped. */}
          {employeeName && (
            <div className="mb-6 rounded-lg bg-canvas px-4 py-3 text-sm text-ink-soft">
              Requesting as{" "}
              <span className="font-medium text-ink">{employeeName}</span>
            </div>
          )}

          <div>
            <label htmlFor="category" className="block text-sm font-medium text-ink">
              Category
            </label>
            <select
              id="category"
              value={category}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className={fieldClass}
            >
              <option value="">Select a category…</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label htmlFor="amount" className="block text-sm font-medium text-ink">
                Amount requested (KES)
              </label>
              <input
                id="amount"
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={fieldClass}
                placeholder="0"
              />
            </div>
            <div>
              <label htmlFor="salary" className="block text-sm font-medium text-ink">
                Gross monthly salary (KES)
              </label>
              <input
                id="salary"
                type="number"
                min="0"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                className={fieldClass}
                placeholder="0"
              />
            </div>
          </div>

          {/* Live amount-vs-salary signal — mirrors the server's 1.5x review rule. */}
          {overSalaryThreshold && (
            <p className="mt-2 text-sm text-medium" role="status">
              This amount is more than 1.5× the salary entered, so it will be
              flagged for closer review. You can still submit it.
            </p>
          )}

          <div className="mt-5">
            <label htmlFor="employment" className="block text-sm font-medium text-ink">
              Length of employment (months)
            </label>
            <input
              id="employment"
              type="number"
              min="0"
              value={employmentMonths}
              onChange={(e) => setEmploymentMonths(e.target.value)}
              className={fieldClass}
              placeholder="0"
            />
          </div>

          <div className="mt-5">
            <label htmlFor="description" className="block text-sm font-medium text-ink">
              Describe your situation
            </label>
            <textarea
              id="description"
              rows={4}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setDescriptionIsTemplate(false);
              }}
              className={fieldClass}
              placeholder="A short explanation of the emergency…"
            />
            {category && (
              <p className="mt-1.5 text-xs text-ink-soft">
                We&apos;ve started this for you based on the category — edit it to fit your situation.
              </p>
            )}
          </div>

          <label className="mt-5 flex items-center gap-3 text-sm text-ink">
            <input
              type="checkbox"
              checked={hasDocuments}
              onChange={(e) => setHasDocuments(e.target.checked)}
              className="h-4 w-4 accent-kq-red"
            />
            I have supporting documents to provide
          </label>
          {hasDocuments && (
            <div className="mt-3">
              <label htmlFor="document" className="block text-sm font-medium text-ink">
                Attach a document <span className="text-ink-soft">(PDF, JPEG or PNG, max 5 MB)</span>
              </label>
              <input
                id="document"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="mt-1.5 block w-full text-sm text-ink file:mr-4 file:rounded-lg file:border-0 file:bg-kq-red file:px-4 file:py-2 file:text-white file:transition hover:file:bg-kq-red-deep"
              />
              {file && (
                <p className="mt-1.5 text-xs text-ink-soft">
                  Selected: {file.name} ({(file.size / 1024).toFixed(0)} KB)
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="mt-5 text-sm text-kq-red" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="mt-5 text-sm text-low" role="status">
              {success}{" "}
              <Link href="/track" className="font-medium text-kq-red hover:underline">Track it →</Link>
            </p>
          )}

          <button
            type="submit"
            disabled={loading || needsDepartment}
            className="mt-7 w-full rounded-lg bg-kq-red py-2.5 font-medium text-white transition hover:bg-kq-red-deep disabled:opacity-60"
          >
            {loading ? "Submitting…" : "Submit request"}
          </button>
        </form>
      </div>
    </div>
  );
}