"use client";

import type { LeaderboardEntry } from "@/hooks/useLeaderboard";
import { STATE_ID_TO_NAME } from "@/lib/constants";

const MEDALS = ["🥇", "🥈", "🥉"];

interface Props {
  entries: LeaderboardEntry[];
  onClose: () => void;
}

export default function LeaderboardPanel({ entries, onClose }: Props) {
  return (
    <>
      <div className="fixed inset-0 bg-black/70 z-40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-[#1a1a1a] border-t border-[#C5A059] z-50 p-6 panel-slide-up">
        <button
          onClick={onClose}
          className="absolute top-3 right-4 text-[#666] text-xl leading-none"
          aria-label="Close"
        >
          ✕
        </button>
        <h2 className="text-[#C5A059] text-lg font-bold mb-4 tracking-wide uppercase">
          Last Week&apos;s Leaderboard
        </h2>
        {entries.length === 0 ? (
          <p className="text-[#555] text-sm">No data yet — check back after the first reset.</p>
        ) : (
          <div className="space-y-3">
            {entries.map((e) => (
              <div key={e.rank} className="flex justify-between items-center">
                <span className="text-base">
                  {MEDALS[e.rank - 1] ?? `#${e.rank}`}{" "}
                  {STATE_ID_TO_NAME[e.state_id] ?? e.state_id}
                </span>
                <span className="text-[#C5A059] font-bold text-sm">
                  {e.session_count.toLocaleString()} sessions
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
