"use client";

import { useState } from "react";

interface OverpassHit {
  type: string;
  id: number;
  name: string | null;
  lat: number;
  lng: number;
  tags: Record<string, string>;
}

interface Props {
  onSetCoords: (coords: { lat: number; lng: number } | null) => void;
  activeCoords: { lat: number; lng: number } | null;
}

export default function DebugPanel({ onSetCoords, activeCoords }: Props) {
  const [open, setOpen] = useState(false);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [testing, setTesting] = useState(false);
  const [hits, setHits] = useState<OverpassHit[] | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  async function testOverpass() {
    const la = parseFloat(lat);
    const lo = parseFloat(lng);
    if (isNaN(la) || isNaN(lo)) { setTestError("Invalid coordinates"); return; }

    setTesting(true);
    setHits(null);
    setTestError(null);

    const query =
      `[out:json][timeout:10];` +
      `(node[leisure=fitness_centre](around:50,${la},${lo});` +
      `node[amenity=gym](around:50,${la},${lo});` +
      `way[leisure=fitness_centre](around:50,${la},${lo});` +
      `way[amenity=gym](around:50,${la},${lo});` +
      `);out center 5;`;

    try {
      const res = await fetch("https://overpass.kumi.systems/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
      });
      const data = await res.json();
      const results: OverpassHit[] = (data.elements ?? []).map((el: Record<string, unknown>) => ({
        type: el.type as string,
        id: el.id as number,
        name: (el.tags as Record<string, string>)?.name ?? null,
        lat: el.type === "way" ? (el.center as Record<string, number>)?.lat : el.lat as number,
        lng: el.type === "way" ? (el.center as Record<string, number>)?.lon : el.lon as number,
        tags: (el.tags ?? {}) as Record<string, string>,
      }));
      setHits(results);
      if (results.length === 0) setTestError("No gyms found within 50m");
    } catch (e) {
      setTestError(`Overpass error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTesting(false);
    }
  }

  function inject() {
    const la = parseFloat(lat);
    const lo = parseFloat(lng);
    if (isNaN(la) || isNaN(lo)) return;
    onSetCoords({ lat: la, lng: lo });
  }

  function clear() {
    onSetCoords(null);
    setHits(null);
    setTestError(null);
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto z-50 font-mono text-xs">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full bg-[#1a1a1a] border-t border-yellow-600 text-yellow-500 py-1 text-center tracking-widest"
      >
        {open ? "▼ DEBUG" : "▲ DEBUG"}{activeCoords ? " · coords injected" : ""}
      </button>

      {open && (
        <div className="bg-[#111] border-t border-yellow-600 p-3 space-y-3">
          {/* Coord inputs */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[#666] block mb-1">lat</label>
              <input
                type="number"
                step="any"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="37.7749"
                className="w-full bg-[#1a1a1a] border border-[#333] text-white px-2 py-1 outline-none focus:border-yellow-600"
              />
            </div>
            <div className="flex-1">
              <label className="text-[#666] block mb-1">lng</label>
              <input
                type="number"
                step="any"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="-122.4194"
                className="w-full bg-[#1a1a1a] border border-[#333] text-white px-2 py-1 outline-none focus:border-yellow-600"
              />
            </div>
          </div>

          {/* Reset checkin cache */}
          <button
            onClick={() => { localStorage.removeItem("gg_last_checkin"); localStorage.removeItem("gg_device_uuid"); alert("checkin cache cleared"); }}
            className="w-full bg-[#1a1a1a] border border-red-800 text-red-400 py-1"
          >
            clear checkin cache
          </button>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={testOverpass}
              disabled={testing}
              className="flex-1 bg-[#1a1a1a] border border-yellow-600 text-yellow-500 py-1 disabled:opacity-50"
            >
              {testing ? "querying..." : "test overpass"}
            </button>
            <button
              onClick={inject}
              className="flex-1 bg-yellow-700 text-black py-1 font-bold"
            >
              inject coords
            </button>
            {activeCoords && (
              <button onClick={clear} className="bg-[#333] text-[#888] px-2 py-1">
                clear
              </button>
            )}
          </div>

          {/* Active override indicator */}
          {activeCoords && (
            <p className="text-yellow-500">
              ⚡ GPS overridden → {activeCoords.lat.toFixed(5)}, {activeCoords.lng.toFixed(5)}
              {" "}— next check-in will use these coords
            </p>
          )}

          {/* Overpass results */}
          {testError && <p className="text-red-400">{testError}</p>}
          {hits && hits.length > 0 && (
            <div className="space-y-2">
              <p className="text-green-400">{hits.length} gym(s) found within 50m:</p>
              {hits.map((h) => (
                <div key={h.id} className="border border-[#333] p-2 space-y-0.5">
                  <p className="text-white">{h.name ?? "(no name)"}</p>
                  <p className="text-[#666]">
                    OSM {h.type}/{h.id} · {h.lat?.toFixed(5)}, {h.lng?.toFixed(5)}
                  </p>
                  <a
                    href={`https://www.openstreetmap.org/${h.type}/${h.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-yellow-600 underline"
                  >
                    view on OSM ↗
                  </a>
                  <p className="text-[#555] break-all">
                    {Object.entries(h.tags).map(([k, v]) => `${k}=${v}`).join(" · ")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
