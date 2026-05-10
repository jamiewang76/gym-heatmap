"use client";

import { useState, useEffect } from "react";

function msUntilReset(): number {
  const now = new Date();
  const next = new Date(now);
  // Next Monday 07:59 UTC
  const day = now.getUTCDay(); // 0=Sun 1=Mon
  let daysUntil = (1 - day + 7) % 7;
  if (daysUntil === 0) {
    const pastReset = now.getUTCHours() > 7 || (now.getUTCHours() === 7 && now.getUTCMinutes() >= 59);
    if (pastReset) daysUntil = 7;
  }
  next.setUTCDate(now.getUTCDate() + daysUntil);
  next.setUTCHours(7, 59, 0, 0);
  return next.getTime() - now.getTime();
}

export default function CountdownTimer() {
  const [ms, setMs] = useState(msUntilReset);

  useEffect(() => {
    const id = setInterval(() => setMs(msUntilReset()), 60000);
    return () => clearInterval(id);
  }, []);

  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);

  return (
    <div className="text-xs">
      <span className="text-[#C5A059]">{d}d {h}h {m}m</span>
      <span className="text-[#555] ml-1">· resets Sunday midnight PT</span>
    </div>
  );
}
