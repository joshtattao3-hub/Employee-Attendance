import { getPasswordStrength } from "../utils/validation";

function PasswordStrength({ password }) {
  const { score, label } = getPasswordStrength(password);

  return (
    <div className="strength">
      <div className="strength__bars" aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <span
            key={n}
            className={`strength__bar ${n <= score ? `strength__bar--${score}` : ""}`}
          />
        ))}
      </div>
      <p className="strength__text" aria-live="polite">
        {password
          ? `Password strength: ${label}.`
          : "Use at least 8 characters with a letter and a number."}
      </p>
    </div>
  );
}

export default PasswordStrength;