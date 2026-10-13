import { getInitials } from "../utils/attendance";

function Avatar({ name, size = "md" }) {
  // Same name always gives the same color (adds up character codes, picks 0-4)
  const colorIndex =
    [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 5;

  return (
    <span
      className={`avatar avatar--${size} avatar--${colorIndex}`}
      aria-hidden="true"
    >
      {getInitials(name)}
    </span>
  );
}

export default Avatar;