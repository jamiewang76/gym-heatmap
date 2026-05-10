"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export function useStateCounts() {
  const [stateCounts, setStateCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    async function fetchCounts() {
      const { data } = await supabase.from("states").select("id, count");
      if (data) {
        const counts: Record<string, number> = {};
        for (const row of data) counts[row.id] = row.count;
        setStateCounts(counts);
      }
    }
    fetchCounts();

    const channel = supabase
      .channel("states-realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "states" },
        (payload) => {
          const row = payload.new as { id: string; count: number };
          setStateCounts((prev) => ({ ...prev, [row.id]: row.count }));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const totalCount = Object.values(stateCounts).reduce((s, n) => s + n, 0);

  return { stateCounts, totalCount };
}
