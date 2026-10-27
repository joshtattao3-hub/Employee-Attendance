import { useState } from "react";
import FormField from "./FormField";
import {
  validateName,
  validateEmail,
  validateTextField,
} from "../utils/validation";
import { AlertCircleIcon } from "./Icons";

const FIELD_ORDER = ["name", "email", "branch", "position"];

function EmployeeForm({ mode, employee, emailLocked, branches, onSubmit, onCancel }) {
  const [values, setValues] = useState({
    name: employee?.name ?? "",
    email: employee?.email ?? "",
    branchId: employee?.branchId ?? (branches.length === 1 ? branches[0].id : ""),
    position: employee?.position ?? "",
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  function update(field, errorKey = field) {
    return (e) => {
      const value = e.target.value;
      setValues((prev) => ({ ...prev, [field]: value }));
      setErrors((prev) => ({ ...prev, [errorKey]: "" }));
    };
  }

  function focusField(field) {
    document.getElementById(`emp-${field}`)?.focus();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;
    setFormError("");

    const nextErrors = {
      name: validateName(values.name),
      email: validateEmail(values.email),
      branch: values.branchId ? "" : "Choose a branch.",
      position: validateTextField(values.position, "Enter a position.", 50),
    };
    setErrors(nextErrors);

    const firstInvalid = FIELD_ORDER.find((field) => nextErrors[field]);
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

  const isAdd = mode === "add";

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
          <p className="modal__meta">
            Employee ID <code className="cell-id">{employee.id}</code>
          </p>
        )}

        <FormField
          id="emp-name"
          label="Full name"
          value={values.name}
          onChange={update("name")}
          error={errors.name}
          autoComplete="off"
          maxLength={60}
          disabled={saving}
          data-autofocus
        />
        <FormField
          id="emp-email"
          label="Work email"
          type="email"
          value={values.email}
          onChange={update("email")}
          error={errors.email}
          hint={
            emailLocked
              ? "This employee has a login, so their email can’t be changed here."
              : "Used to create their sign-in later."
          }
          readOnly={emailLocked}
          autoComplete="off"
          maxLength={254}
          disabled={saving}
        />

        <div className="form-field">
          <label htmlFor="emp-branch" className="form-field__label">
            Branch
          </label>
          <select
            id="emp-branch"
            className={`form-field__input ${errors.branch ? "form-field__input--error" : ""}`}
            value={values.branchId}
            onChange={update("branchId", "branch")}
            aria-invalid={errors.branch ? true : undefined}
            aria-describedby={errors.branch ? "emp-branch-error" : undefined}
            disabled={saving}
          >
            <option value="">Choose a branch</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
          {errors.branch && (
            <p id="emp-branch-error" className="form-field__error" role="alert">
              {errors.branch}
            </p>
          )}
        </div>

        <FormField
          id="emp-position"
          label="Position"
          value={values.position}
          onChange={update("position")}
          error={errors.position}
          autoComplete="off"
          maxLength={50}
          disabled={saving}
        />
      </div>

      <div className="modal__footer">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "Saving…" : isAdd ? "Add employee" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

export default EmployeeForm;