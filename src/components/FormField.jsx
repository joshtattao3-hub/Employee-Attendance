import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "./Icons";

// Label + input + error/hint. Password fields get a show/hide toggle.
function FormField({ id, label, type = "text", error, hint, onChange, ...inputProps }) {
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";

  // The show/hide button only appears once something has been typed
  const hasValue = String(inputProps.value ?? "").length > 0;
  const showToggle = isPassword && hasValue;

  // When the box is emptied, go back to hidden so the next password starts hidden
  function handleChange(e) {
    if (!e.target.value) setVisible(false);
    onChange?.(e);
  }

  const messageId = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  const inputClass = [
    "form-field__input",
    error ? "form-field__input--error" : "",
    isPassword ? "form-field__input--toggle" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="form-field">
      <label htmlFor={id} className="form-field__label">
        {label}
      </label>

      <div className="form-field__control">
        <input
          id={id}
          type={isPassword && visible && hasValue ? "text" : type}
          className={inputClass}
          aria-invalid={error ? true : undefined}
          aria-describedby={messageId}
          {...inputProps}
          onChange={handleChange}
        />
        {showToggle && (
          <button
            type="button"
            className="icon-btn form-field__toggle"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
          >
            {visible ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
          </button>
        )}
      </div>

      {error ? (
        <p id={`${id}-error`} className="form-field__error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="form-field__hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export default FormField;