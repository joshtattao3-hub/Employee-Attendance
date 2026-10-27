import { useMemo, useState } from "react";
import FormField from "./FormField";
import { AlertCircleIcon } from "./Icons";

const DEFAULT_ZONE = "Asia/Manila";
const FALLBACK_ZONES = [
  "Asia/Manila",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Dubai",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Sydney",
  "UTC",
];

// Real time zones only: the database rejects made-up ones
function getTimeZones(current) {
  let zones;
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch {
    zones = FALLBACK_ZONES;
  }
  if (current && !zones.includes(current)) zones = [current, ...zones];
  return zones;
}

function BranchForm({ mode, branch, onSubmit, onCancel }) {
  const [values, setValues] = useState({
    name: branch?.name ?? "",
    address: branch?.address ?? "",
    timezone: branch?.timezone ?? DEFAULT_ZONE,
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const zones = useMemo(() => getTimeZones(branch?.timezone), [branch]);
  const isAdd = mode === "add";

  function update(field) {
    return (e) => {
      const value = e.target.value;
      setValues((prev) => ({ ...prev, [field]: value }));
      setErrors((prev) => ({ ...prev, [field]: "" }));
    };
  }

  function focusField(field) {
    document.getElementById(`branch-${field}`)?.focus();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;
    setFormError("");

    const name = values.name.trim();
    const nextErrors = {
      name: name ? "" : "Enter a branch name.",
      timezone: values.timezone ? "" : "Choose a time zone.",
    };
    setErrors(nextErrors);

    const firstInvalid = ["name", "timezone"].find((field) => nextErrors[field]);
    if (firstInvalid) {
      focusField(firstInvalid);
      return;
    }

    // On success the parent closes the dialog, so only handle failure
    setSaving(true);
    const result = await onSubmit(values);
    if (!result.ok) {
      setSaving(false);
      if (result.field) {
        setErrors((prev) => ({ ...prev, [result.field]: result.error }));
        focusField(result.field);
      } else {
        setFormError(result.error);
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="modal__body">
        {formError && (
          <div className="alert alert--error" role="alert">
            <AlertCircleIcon size={18} />
            <span>{formError}</span>
          </div>
        )}

        <FormField
          id="branch-name"
          label="Branch name"
          value={values.name}
          onChange={update("name")}
          error={errors.name}
          autoComplete="off"
          maxLength={60}
          disabled={saving}
          data-autofocus
        />
        <FormField
          id="branch-address"
          label="Address (optional)"
          value={values.address}
          onChange={update("address")}
          error={errors.address}
          autoComplete="off"
          maxLength={120}
          disabled={saving}
        />

        <div className="form-field">
          <label htmlFor="branch-timezone" className="form-field__label">
            Time zone
          </label>
          <select
            id="branch-timezone"
            className={`form-field__input ${errors.timezone ? "form-field__input--error" : ""}`}
            value={values.timezone}
            onChange={update("timezone")}
            aria-invalid={errors.timezone ? true : undefined}
            aria-describedby="branch-timezone-hint"
            disabled={saving}
          >
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
          <p id="branch-timezone-hint" className="form-field__hint">
            {isAdd
              ? "Decides which calendar day a clock-in counts for at this branch."
              : "Changing this affects new clock-ins only. Existing records keep their work dates."}
          </p>
          {errors.timezone && (
            <p className="form-field__error" role="alert">
              {errors.timezone}
            </p>
          )}
        </div>
      </div>

      <div className="modal__footer">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "Saving…" : isAdd ? "Add branch" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

export default BranchForm;