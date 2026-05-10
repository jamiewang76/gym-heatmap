"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export interface LeaderboardEntry {
  rank: number;
  state_id: string;
  session_count: number;
}

export function useLeaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data: latest } = await supabase
        .from("leaderboard_history")
        .select("week_ending")
        .order("week_ending", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latest) {
        const { data } = await supabase
          .from("leaderboard_history")
          .select("rank, state_id, session_count")
          .eq("week_ending", latest.week_ending)
          .order("rank", { ascending: true });
        if (data) setEntries(data);
      }
      setLoading(false);
    }
    fetch();
  }, []);

  return { entries, loading };
}
