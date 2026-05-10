"use client";

import { useState, useEffect } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { STATE_NAME_TO_ID } from "@/lib/constants";

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

interface USMapProps {
  stateCounts: Record<string, number>;
  onStateSelect: (stateId: string | null) => void;
  selectedState: string | null;
  pulsedState: string | null;
}

function stateColor(count: number, maxCount: number): string {
  if (count === 0 || maxCount === 0) return "#1a1a1a";
  const t = Math.min(count / maxCount, 1);
  const r = Math.round(26 + (197 - 26) * t);
  const g = Math.round(26 + (160 - 26) * t);
  const b = Math.round(26 + (89 - 26) * t);
  const a = (0.3 + 0.55 * t).toFixed(2);
  return `rgba(${r},${g},${b},${a})`;
}

export default function USMap({ stateCounts, onStateSelect, selectedState, pulsedState }: USMapProps) {
  const maxCount = Math.max(...Object.values(stateCounts), 1);
  const [pulsingNow, setPulsingNow] = useState<string | null>(null);

  useEffect(() => {
    if (!pulsedState) return;
    setPulsingNow(pulsedState);
    const t = setTimeout(() => setPulsingNow(null), 700);
    return () => clearTimeout(t);
  }, [pulsedState]);

  return (
    <div
      className="w-full"
      onClick={(e) => {
        if ((e.target as Element).tagName === "svg") onStateSelect(null);
      }}
    >
      <ComposableMap
        projection="geoAlbersUsa"
        width={960}
        height={600}
        style={{ width: "100%", height: "auto" }}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const props = geo.properties as Record<string, string>;
              const name: string = props.name ?? props.NAME ?? "";
              const id = STATE_NAME_TO_ID[name];
              const count = id ? (stateCounts[id] ?? 0) : 0;
              const isSelected = selectedState === id;
              const isPulsing = pulsingNow === id;
              const fill = isSelected ? "#C5A059" : stateColor(count, maxCount);
              const glow = count > 0 ? "drop-shadow(0 0 6px rgba(197,160,89,0.6))" : "none";

              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={fill}
                  stroke="#2a2a2a"
                  strokeWidth={isSelected ? 1.5 : 0.5}
                  className={isPulsing ? "state-pulse" : undefined}
                  style={{
                    default: { outline: "none", filter: glow },
                    hover: {
                      outline: "none",
                      fill: "#C5A059",
                      filter: "drop-shadow(0 0 10px rgba(197,160,89,0.9))",
                      cursor: "pointer",
                    },
                    pressed: { outline: "none" },
                  }}
                  onClick={() => id && onStateSelect(isSelected ? null : id)}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>
    </div>
  );
}
