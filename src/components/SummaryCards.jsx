import { getSummary } from "../utils/attendance";
import {
  UsersIcon,
  LogInIcon,
  CheckCircleIcon,
  ClockIcon,
} from "./Icons";

// Each card: which number to show, its label, icon, and color tone
const CARDS = [
  { key: "total", label: "Total Employees", hint: "Registered staff", icon: UsersIcon, tone: "neutral" },
  { key: "clockedIn", label: "Currently Clocked In", hint: "Working now", icon: LogInIcon, tone: "success" },
  { key: "completed", label: "Completed Shifts", hint: "Finished today", icon: CheckCircleIcon, tone: "info" },
  { key: "notYet", label: "Not Yet Clocked In", hint: "Awaiting clock-in", icon: ClockIcon, tone: "warning" },
];

function SummaryCards({ employees, records }) {
  // Calculated fresh on every render, so it always matches the data
  const summary = getSummary(employees, records);

  return (
    <ul className="summary-grid">
      {CARDS.map(({ key, label, hint, icon: CardIcon, tone }) => (
        <li key={key} className="card summary-card">
          <span className={`summary-card__icon summary-card__icon--${tone}`}>
            <CardIcon size={20} />
          </span>
          <div>
            <p className="summary-card__label">{label}</p>
            <p className="summary-card__value">{summary[key]}</p>
            <p className="summary-card__hint">{hint}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default SummaryCards;