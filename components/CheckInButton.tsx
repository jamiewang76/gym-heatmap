"use client";

import { useState, useEffect } from "react";
import type { CheckInResult } from "@/hooks/useCheckin";

interface Props {
  result: CheckInResult;
  onCheckIn: () => void;
}

function msRemaining(until: Date): number {
  return Math.max(0, until.getTime() - Date.now());
}

function fmtMs(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function CheckInButton({ result, onCheckIn }: Props) {
  const { status, message, blockedUntil } = result;
  const [, tick] = useState(0);

  useEffect(() => {
    if (status !== "already_checked_in" && status !== "blocked") return;
    const id = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, [status]);

  const isLoading = status === "requesting_location" || status === "finding_gym";
  const isLocked = status === "already_checked_in" || status === "blocked";
  const isSuccess = status === "success";
  const isDisabled = isLoading || isLocked || isSuccess;
  const isError = ["gym_not_found", "verification_unavailable", "location_denied", "error"].includes(status);

  let btnText = "⚡ I'm Locked In";
  let btnCls = "bg-[#C5A059] text-[#121212]";

  if (isLoading) {
    btnText = message;
    btnCls = "bg-[#8a7040] text-[#121212] opacity-70";
  } else if (isSuccess) {
    btnText = "✓ Locked In";
    btnCls = "bg-[#1a5c1a] text-white";
  } else if (isLocked) {
    const remaining = blockedUntil ? fmtMs(msRemaining(blockedUntil)) : message;
    btnText = `Locked in for today · ${remaining} remaining`;
    btnCls = "bg-[#2a2a2a] text-[#666]";
  }

  return (
    <div className="w-full">
      <button
        onClick={onCheckIn}
        disabled={isDisabled}
        className={`w-full py-4 text-base font-bold tracking-wide transition-opacity ${btnCls} ${
          isDisabled ? "cursor-not-allowed" : "active:opacity-70"
        }`}
      >
        {btnText}
      </button>
      {isError && (
        <p className="text-center text-sm mt-2 text-[#C5A059]">{message}</p>
      )}
    </div>
  );
}
