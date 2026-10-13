import { useClock } from "../hooks/useClock";
import { ClockIcon } from "./Icons";

function LiveClock() {
  const now = useClock();

  const time = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const date = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="card clock-card">
      <span className="clock-card__icon">
        <ClockIcon size={22} />
      </span>
      <div>
        <p className="clock-card__label"> Philippine Standard Time</p>
        <p className="clock-card__time" role="timer" aria-live="off">
          {time}
        </p>
      </div>
      <p className="clock-card__date">{date}</p>
    </div>
  );
}

export default LiveClock;