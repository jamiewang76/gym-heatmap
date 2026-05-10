"use client";

import { useState, useEffect, useRef } from "react";

const DEVICE_UUID_KEY = "gg_device_uuid";
const LAST_CHECKIN_KEY = "gg_last_checkin";
const COOLDOWN_MS = 12 * 60 * 60 * 1000;

export type CheckInStatus =
  | "idle"
  | "requesting_location"
  | "finding_gym"
  | "success"
  | "already_checked_in"
  | "gym_not_found"
  | "blocked"
  | "location_denied"
  | "error";

export interface CheckInResult {
  status: CheckInStatus;
  message: string;
  blockedUntil?: Date;
  successStateId?: string;
}

interface GymMatch {
  found: boolean;
  name: string | null;
  gymLat: number | null;
  gymLng: number | null;
  osmType: string | null;
  osmId: number | null;
}

function msToDisplay(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Runs in the browser — residential/mobile IPs are allowed by Overpass
async function queryOverpass(lat: number, lng: number): Promise<GymMatch> {
  const query =
    `[out:json][timeout:10];` +
    `(node[leisure=fitness_centre](around:50,${lat},${lng});` +
    `node[amenity=gym](around:50,${lat},${lng});` +
    `way[leisure=fitness_centre](around:50,${lat},${lng});` +
    `way[amenity=gym](around:50,${lat},${lng});` +
    `);out center 1;`;

  // overpass-api.de blocks CORS from production browser origins — omit it here.
  // These mirrors send Access-Control-Allow-Origin headers.
  const mirrors = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
  ];

  for (const mirror of mirrors) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(mirror, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: ctrl.signal,
      });
      clearTimeout(timer);

      if (!res.ok) continue;

      const data = await res.json();
      if (!data.elements?.length) {
        return { found: false, name: null, gymLat: null, gymLng: null, osmType: null, osmId: null };
      }

      const el = data.elements[0];
      const gymLat: number = el.type === "way" ? el.center?.lat : el.lat;
      const gymLng: number = el.type === "way" ? el.center?.lon : el.lon;
      const gymName: string | null = el.tags?.name ?? null;

      console.log(
        `[Global Gains] ✅ Gym found — "${gymName ?? "unnamed"}" | ` +
        `OSM ${el.type}/${el.id} | gym: ${gymLat}, ${gymLng} | ` +
        `your GPS: ${lat}, ${lng} | ` +
        `https://www.openstreetmap.org/${el.type}/${el.id}`
      );

      return { found: true, name: gymName, gymLat, gymLng, osmType: el.type, osmId: el.id };
    } catch {
      // mirror unreachable, try next
    }
  }

  // All mirrors failed from this browser — treat as unverified but don't block
  console.warn(`[Global Gains] ⚠️ Overpass unreachable from browser, proceeding unverified | GPS: ${lat}, ${lng}`);
  return { found: true, name: null, gymLat: null, gymLng: null, osmType: null, osmId: null };
}

export function useCheckin() {
  const [result, setResult] = useState<CheckInResult>({ status: "idle", message: "" });
  const [isChecking, setIsChecking] = useState(false);
  const deviceUuid = useRef("");

  useEffect(() => {
    let uuid = localStorage.getItem(DEVICE_UUID_KEY);
    if (!uuid) {
      uuid = crypto.randomUUID();
      localStorage.setItem(DEVICE_UUID_KEY, uuid);
    }
    deviceUuid.current = uuid;

    const lastMs = parseInt(localStorage.getItem(LAST_CHECKIN_KEY) ?? "0", 10);
    if (lastMs) {
      const elapsed = Date.now() - lastMs;
      if (elapsed < COOLDOWN_MS) {
        const remaining = COOLDOWN_MS - elapsed;
        setResult({
          status: "already_checked_in",
          message: msToDisplay(remaining),
          blockedUntil: new Date(lastMs + COOLDOWN_MS),
        });
      }
    }
  }, []);

  async function checkIn() {
    if (isChecking || result.status === "success" || result.status === "already_checked_in") return;
    setIsChecking(true);

    try {
      // Step 1: GPS
      setResult({ status: "requesting_location", message: "requesting location..." });
      let lat: number, lng: number;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
        );
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch {
        setResult({ status: "location_denied", message: "Enable location to check in" });
        setIsChecking(false);
        return;
      }

      // Step 2: Reverse geocode state
      setResult({ status: "finding_gym", message: "finding your gym..." });
      let stateId: string;
      try {
        const geo = await fetch(
          `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
        ).then((r) => r.json());
        const code: string = geo.principalSubdivisionCode ?? "";
        if (!code.startsWith("US-")) {
          setResult({ status: "gym_not_found", message: "Gym not detected. Get to the gym to light up your city!" });
          setIsChecking(false);
          return;
        }
        stateId = code.replace("US-", "");
      } catch {
        setResult({ status: "error", message: "Couldn't determine your location. Try again." });
        setIsChecking(false);
        return;
      }

      // Step 3: Gym detection — runs in browser, not on server
      const gym = await queryOverpass(lat, lng);
      if (!gym.found) {
        setResult({ status: "gym_not_found", message: "Gym not detected. Get to the gym to light up your city!" });
        setIsChecking(false);
        return;
      }

      // Step 4: Record check-in on server (rate limiting + DB write)
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const res = await fetch(`${supabaseUrl}/functions/v1/check-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
        body: JSON.stringify({
          lat, lng, deviceUuid: deviceUuid.current, stateId,
          gymName: gym.name, gymLat: gym.gymLat, gymLng: gym.gymLng,
          osmType: gym.osmType, osmId: gym.osmId,
        }),
      });
      const data = await res.json();

      if (data.blocked) {
        const until = new Date(data.retryAt);
        const remaining = until.getTime() - Date.now();
        localStorage.setItem(LAST_CHECKIN_KEY, (until.getTime() - COOLDOWN_MS).toString());
        setResult({ status: "blocked", message: msToDisplay(remaining), blockedUntil: until });
      } else if (!data.ok) {
        setResult({ status: "error", message: "Something went wrong. Try again." });
      } else {
        localStorage.setItem(LAST_CHECKIN_KEY, Date.now().toString());
        setResult({
          status: "success",
          message: gym.name ? `✓ Locked in at ${gym.name}` : "✓ Locked In",
          successStateId: data.stateId || stateId,
        });
      }
    } catch {
      setResult({ status: "error", message: "Something went wrong. Try again." });
    } finally {
      setIsChecking(false);
    }
  }

  return { result, checkIn };
}
