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
  | "verification_unavailable"
  | "location_denied"
  | "error";

export interface CheckInResult {
  status: CheckInStatus;
  message: string;
  blockedUntil?: Date;
  successStateId?: string;
}

function msToDisplay(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
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

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const res = await fetch(`${supabaseUrl}/functions/v1/check-in`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ lat, lng, deviceUuid: deviceUuid.current, stateId }),
      });
      const data = await res.json();

      // Debug: log detected gym details to browser console
      if (data.isGym && (data.gymLat || data.gymName)) {
        console.log(
          `[Global Gains] Gym detected — name: "${data.gymName ?? "unnamed"}" | ` +
          `OSM ${data.osmType} #${data.osmId} | ` +
          `gym coords: ${data.gymLat}, ${data.gymLng} | ` +
          `your coords: ${lat}, ${lng} | ` +
          `https://www.openstreetmap.org/${data.osmType}/${data.osmId}`
        );
      }

      if (data.blocked) {
        const until = new Date(data.retryAt);
        const remaining = until.getTime() - Date.now();
        localStorage.setItem(LAST_CHECKIN_KEY, (until.getTime() - COOLDOWN_MS).toString());
        setResult({
          status: "blocked",
          message: msToDisplay(remaining),
          blockedUntil: until,
        });
      } else if (data.error === "verification_unavailable") {
        setResult({ status: "verification_unavailable", message: "Couldn't reach gym database. Try again." });
      } else if (!data.isGym) {
        setResult({ status: "gym_not_found", message: "Gym not detected. Get to the gym to light up your city!" });
      } else {
        localStorage.setItem(LAST_CHECKIN_KEY, Date.now().toString());
        setResult({
          status: "success",
          message: data.gymName ? `✓ Locked in at ${data.gymName}` : "✓ Locked In",
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
