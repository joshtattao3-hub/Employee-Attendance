import { useState, useEffect } from "react";

// Returns the current Date and updates it every second
export function useClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id); // cleanup: stop the timer on unmount
  }, []);

  return now;
}