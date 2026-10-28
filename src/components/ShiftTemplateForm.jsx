import { useState } from "react";
import FormField from "./FormField";
import { AlertCircleIcon } from "./Icons";
import { shiftMinutes } from "../utils/shifts";

const FIELD_ORDER = ["name", "startTime", "endTime", "breakMinutes"];

function ShiftTemplateForm({ mode, template, onSubmit, onCancel }) {
  const [values, setValues] = useState({
    name: template?.name ?? "",
    startTime: template?.startTime ?? "08:00",
    endTime: template?.endTime ?? "17:00",
    breakMinutes: String(template?.breakMinutes ?? 60),
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const isAdd = mode === "add";

  // An overnight shift that already exists can be edited, as long as its
  // times are left alone. New overnight shifts are not supported yet.
  const keepsOvernightTimes =
    Boolean(template?.crossesMidnight) &&
    values.startTime === template.startTime &&
    values.endTime === template.endTime;

  function update(field) {
    return (e) => {
      const value = e.target.value;
      setValues((prev) => ({ ...prev, [field]: value }));
      setErrors((prev) => ({ ...prev, [field]: "" }));
    };
  }

  function focusField(field) {
    document.getElementById(`shift-${field}`)?.focus();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;
    setFormError("");

    const name = values.name.trim();
    const breakText = values.breakMinutes.trim();
    const breakMinutes = Number(breakText);
    const nextErrors = { name: "", startTime: "", endTime: "", breakMinutes: "" };

    if (!name) nextErrors.name = "Enter a shift name.";
    if (!values.startTime) nextErrors.startTime = "Choose a start time.";
    if (!values.endTime) nextErrors.endTime = "Choose an end time.";

    const timesPresent = !nextErrors.startTime && !nextErrors.endTime;
    // "HH:MM" text compares correctly as plain text
    if (timesPresent && !keepsOvernightTimes && values.endTime <= values.startTime) {
      nextErrors.endTime =
        "End time must be after the start time. Overnight shifts aren’t supported yet.";
    }

    if (
      breakText === "" ||
      !Number.isInteger(breakMinutes) ||
      breakMinutes < 0 ||
      breakMinutes > 240
    ) {
      nextErrors.breakMinutes = "Enter a whole number from 0 to 240.";
    } else if (
      timesPresent &&
      !nextErrors.endTime &&
      breakMinutes >= shiftMinutes(values.startTime, values.endTime)
    ) {
      nextErrors.breakMinutes = "The break must be shorter than the shift.";
    }

    setErrors(nextErrors);
    const firstInvalid = FIELD_ORDER.find((field) => nextErrors[field]);
    if (firstInvalid) {
      focusField(firstInvalid);
      return;
    }

    // On success the parent closes the dialog, so only handle failure
    setSaving(true);
    const result = await onSubmit({
      name,
      startTime: values.startTime,
      endTime: values.endTime,
      breakMinutes,
    });
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

        {!isAdd && (
          <p className="form-field__hint">
            Changes apply to shifts you schedule from now on. Shifts already
            scheduled keep their times.
          </p>
        )}

        <FormField
          id="shift-name"
          label="Shift name"
          value={values.name}
          onChange={update("name")}
          error={errors.name}
          autoComplete="off"
          maxLength={40}
          disabled={saving}
          data-autofocus
        />
        <FormField
          id="shift-startTime"
          label="Start time"
          type="time"
          value={values.startTime}
          onChange={update("startTime")}
          error={errors.startTime}
          disabled={saving}
        />
        <FormField
          id="shift-endTime"
          label="End time"
          type="time"
          value={values.endTime}
          onChange={update("endTime")}
          error={errors.endTime}
          hint={
            template?.crossesMidnight
              ? "This is an overnight shift. Keep its times as they are, or pick a same-day end time."
              : undefined
          }
          disabled={saving}
        />
        <FormField
          id="shift-breakMinutes"
          label="Unpaid break (minutes)"
          type="number"
          inputMode="numeric"
          min={0}
          max={240}
          step={1}
          value={values.breakMinutes}
          onChange={update("breakMinutes")}
          error={errors.breakMinutes}
          hint="Subtracted from the shift when working out paid hours."
          disabled={saving}
        />
      </div>

      <div className="modal__footer">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "Saving…" : isAdd ? "Add shift" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

export default ShiftTemplateForm;