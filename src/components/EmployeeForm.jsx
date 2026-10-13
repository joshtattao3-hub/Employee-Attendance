import { useState } from "react";
import FormField from "./FormField";
import {
  validateName,
  validateEmail,
  validateTextField,
} from "../utils/validation";
import { AlertCircleIcon } from "./Icons";

const DEPARTMENTS = ["Engineering", "Finance", "Human Resources", "Operations", "Sales"];
const FIELD_ORDER = ["name", "email", "department", "position"];

function EmployeeForm({ mode, employee, emailLocked, onSubmit, onCancel }) {
  const [values, setValues] = useState({
    name: employee?.name ?? "",
    email: employee?.email ?? "",
    department: employee?.department ?? "",
    position: employee?.position ?? "",
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");

  function update(field) {
    return (e) => {
      const value = e.target.value;
      setValues((prev) => ({ ...prev, [field]: value }));
      setErrors((prev) => ({ ...prev, [field]: "" }));
    };
  }

  function focusField(field) {
    document.getElementById(`emp-${field}`)?.focus();
  }

  function handleSubmit(e) {
    e.preventDefault();
    setFormError("");

    const nextErrors = {
      name: validateName(values.name),
      email: validateEmail(values.email),
      department: validateTextField(values.department, "Enter a department.", 40),
      position: validateTextField(values.position, "Enter a position.", 50),
    };
    setErrors(nextErrors);

    const firstInvalid = FIELD_ORDER.find((field) => nextErrors[field]);
    if (firstInvalid) {
      focusField(firstInvalid);
      return;
    }

    // On success the parent closes the dialog, so only handle failure
    const result = onSubmit(values);
    if (!result.ok) {
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
              ? "Tied to this employee’s login, so it can’t be changed in this demo."
              : isAdd
                ? "If this person signs up with this email, their account links to this record."
                : undefined
          }
          readOnly={emailLocked}
          autoComplete="off"
          maxLength={254}
        />
        <FormField
          id="emp-department"
          label="Department"
          value={values.department}
          onChange={update("department")}
          error={errors.department}
          list="department-options"
          autoComplete="off"
          maxLength={40}
        />
        <datalist id="department-options">
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
        <FormField
          id="emp-position"
          label="Position"
          value={values.position}
          onChange={update("position")}
          error={errors.position}
          autoComplete="off"
          maxLength={50}
        />
      </div>

      <div className="modal__footer">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn-primary">
          {isAdd ? "Add employee" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

export default EmployeeForm;