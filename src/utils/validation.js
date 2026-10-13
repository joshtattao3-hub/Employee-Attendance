const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value) {
  const email = value.trim();
  if (!email) return "Enter your email address.";
  if (!EMAIL_PATTERN.test(email)) return "Enter a valid email address.";
  return "";
}

export function validateRequired(value, message) {
  return value ? "" : message;
}
export function validateName(value) {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) return "Enter your full name.";
  if (name.length < 2) return "Name must be at least 2 characters.";
  if (name.length > 60) return "Name must be 60 characters or fewer.";
  if (!/\p{L}/u.test(name)) return "Name must include letters.";
  return "";
}

export function validatePassword(password) {
  if (!password) return "Create a password.";
  if (password.length < 8) return "Use at least 8 characters.";
  if (password.length > 128) return "Use 128 characters or fewer.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "Include at least one letter and one number.";
  }
  return "";
}

export function validateConfirm(password, confirm) {
  if (!confirm) return "Re-enter your password.";
  if (confirm !== password) return "Passwords don’t match.";
  return "";
}

// score: 0 (empty) to 4. Only the minimum rules in validatePassword block signup.
export function getPasswordStrength(password) {
  if (!password) return { score: 0, label: "" };

  const meetsMinimum = validatePassword(password) === "";
  if (!meetsMinimum) return { score: 1, label: "Weak" };

  const extras = [
    password.length >= 12,
    /[a-z]/.test(password) && /[A-Z]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;

  const score = 2 + Math.min(extras, 2);
  return { score, label: ["", "Weak", "Fair", "Good", "Strong"][score] };
}

// For short required text such as department and position
export function validateTextField(value, emptyMessage, max = 60) {
  const text = value.trim();
  if (!text) return emptyMessage;
  if (text.length > max) return `Use ${max} characters or fewer.`;
  return "";
}