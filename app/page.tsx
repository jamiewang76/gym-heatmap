"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import CountdownTimer from "@/components/CountdownTimer";
import CheckInButton from "@/components/CheckInButton";
import StateBottomSheet from "@/components/StateBottomSheet";
import LeaderboardPanel from "@/components/LeaderboardPanel";
import { useStateCounts } from "@/hooks/useStateCounts";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { useCheckin } from "@/hooks/useCheckin";

const USMap = dynamic(() => import("@/components/USMap"), { ssr: false });

export default function Home() {
  const { stateCounts, totalCount } = useStateCounts();
  const { entries } = useLeaderboard();
  const { result, checkIn } = useCheckin();

  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [isTikTok, setIsTikTok] = useState(false);

  useEffect(() => {
    setIsTikTok(/Musical_ly|BytedanceWebview|TikTok/i.test(navigator.userAgent));
  }, []);

  const successStateId = useMemo(
    () => (result.status === "success" ? result.successStateId ?? null : null),
    [result.status, result.successStateId]
  );

  return (
    <main className="flex flex-col min-h-screen max-w-[430px] mx-auto px-4 pb-8 pt-3">
      {isTikTok && (
        <div className="border border-[#C5A059] text-[#C5A059] text-xs text-center px-3 py-2 mb-3">
          For best results, tap ··· and open in Safari/Chrome.
        </div>
      )}

      {/* Top bar */}
      <div className="flex justify-between items-center mb-3">
        <CountdownTimer />
        <button
          onClick={() => setShowLeaderboard(true)}
          className="text-[#C5A059] text-sm underline underline-offset-2"
        >
          Last week ›
        </button>
      </div>

      {/* Title */}
      <h1 className="text-[#C5A059] text-2xl font-bold text-center mb-3 tracking-[0.2em] uppercase">
        Global Gains
      </h1>

      {/* Map */}
      <div className="w-full">
        <USMap
          stateCounts={stateCounts}
          onStateSelect={setSelectedState}
          selectedState={selectedState}
          pulsedState={successStateId}
        />
      </div>

      {/* Global counter */}
      <p className="text-center text-[#C5A059] text-sm mt-1 mb-5 tracking-wide">
        {totalCount.toLocaleString()} gym sessions this week
      </p>

      {/* Check-in */}
      <CheckInButton result={result} onCheckIn={checkIn} />

      {/* Panels */}
      {selectedState && (
        <StateBottomSheet
          stateId={selectedState}
          count={stateCounts[selectedState] ?? 0}
          onClose={() => setSelectedState(null)}
        />
      )}
      {showLeaderboard && (
        <LeaderboardPanel entries={entries} onClose={() => setShowLeaderboard(false)} />
      )}
    </main>
  );
}
