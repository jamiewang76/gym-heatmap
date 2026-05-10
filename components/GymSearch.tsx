"use client";

import { useState, useEffect, useRef } from "react";
import type { GymResult } from "@/hooks/useCheckin";

interface Props {
  results: GymResult[];
  selectedGym: GymResult | null;
  isLoading: boolean;
  status: string;
  onSearch: (query: string) => void;
  onSelect: (gym: GymResult) => void;
  onVerify: () => void;
  onCancel: () => void;
}

function fmtDist(m: number): string {
  const ft = m * 3.28084;
  return ft < 5280 ? `${Math.round(ft)} ft` : `${(ft / 5280).toFixed(1)} mi`;
}

function distCls(m: number): string {
  if (m <= 100) return "text-green-400";
  if (m <= 200) return "text-[#C5A059]";
  return "text-red-400";
}

export default function GymSearch({
  results,
  selectedGym,
  isLoading,
  status,
  onSearch,
  onSelect,
  onVerify,
  onCancel,
}: Props) {
  const [query, setQuery] = useState("");
  const [resultsCollapsed, setResultsCollapsed] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isVerifying = status === "verifying";
  const isTooFar = status === "too_far";
  const canVerify = selectedGym != null && selectedGym.distanceM <= 5000;

  // Debounce search on query change (skip initial mount — already triggered by checkIn)
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => onSearch(query), 400);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    if (selectedGym) setResultsCollapsed(true);
  }, [selectedGym]);

  return (
    <div className="w-full space-y-2">
      {/* Search input */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setResultsCollapsed(false); }}
          placeholder="Search your gym..."
          autoFocus
          className="w-full bg-[#1a1a1a] border border-[#C5A059] text-white px-4 py-3 text-sm outline-none placeholder-[#444] font-mono"
        />
        {isLoading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#C5A059] text-xs animate-pulse">
            searching
          </span>
        )}
      </div>

      {/* Results */}
      {results.length > 0 && !resultsCollapsed && (
        <div className="max-h-44 overflow-y-auto border border-[#2a2a2a] divide-y divide-[#1e1e1e]">
          {results.map((gym) => {
            const selected = selectedGym?.id === gym.id;
            return (
              <button
                key={gym.id}
                onClick={() => onSelect(gym)}
                className={`w-full text-left px-3 py-2.5 flex justify-between items-start transition-colors ${
                  selected
                    ? "bg-[#C5A059]/10 border-l-2 border-[#C5A059]"
                    : "bg-[#1a1a1a] active:bg-[#242424]"
                }`}
              >
                <div className="flex-1 min-w-0 pr-2">
                  <p className="text-white text-sm font-bold truncate leading-snug">{gym.name}</p>
                  <p className="text-[#555] text-xs truncate mt-0.5">{gym.address}</p>
                </div>
                <span className={`text-xs font-bold shrink-0 mt-0.5 ${distCls(gym.distanceM)}`}>
                  {fmtDist(gym.distanceM)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {!isLoading && results.length === 0 && query.trim().length > 0 && (
        <p className="text-[#555] text-xs text-center py-2">no gyms found — try a different name</p>
      )}

      {/* Selected gym summary + action button */}
      {selectedGym && (
        <div className="space-y-2 pt-1">
          <div className="border border-[#333] px-3 py-2 bg-[#1a1a1a] flex justify-between items-center">
            <div className="min-w-0 pr-2">
              <p className="text-white text-sm font-bold truncate">{selectedGym.name}</p>
              <p className="text-[#555] text-xs truncate">{selectedGym.address}</p>
            </div>
            <span className={`text-sm font-bold shrink-0 ${distCls(selectedGym.distanceM)}`}>
              {fmtDist(selectedGym.distanceM)}
            </span>
          </div>

          {canVerify ? (
            <button
              onClick={onVerify}
              disabled={isVerifying}
              className="w-full py-4 bg-[#C5A059] text-[#121212] font-bold text-base tracking-wide disabled:opacity-60 active:opacity-80"
            >
              {isVerifying ? "verifying..." : "⚡ Verify Check-In"}
            </button>
          ) : (
            <button
              disabled
              className="w-full py-3 bg-[#1a1a1a] border border-[#333] text-[#555] text-sm font-bold cursor-not-allowed"
            >
              Too far — get to the gym first
            </button>
          )}

          {isTooFar && (
            <p className="text-red-400 text-xs text-center">{`Server rejected: you're > 200m away`}</p>
          )}
        </div>
      )}

      <button
        onClick={onCancel}
        className="w-full text-[#444] text-xs py-1 hover:text-[#666] transition-colors"
      >
        ← cancel
      </button>
    </div>
  );
}
