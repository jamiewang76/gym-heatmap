"use client";

import { useState, useEffect, useRef } from "react";

const DEVICE_UUID_KEY = "gg_device_uuid";
const LAST_CHECKIN_KEY = "gg_last_checkin";
const COOLDOWN_MS = 12 * 60 * 60 * 1000;

export type CheckInStatus =
  | "idle"
  | "requesting_location"
  | "searching"
  | "gym_selected"
  | "verifying"
  | "success"
  | "already_checked_in"
  | "too_far"
  | "blocked"
  | "location_denied"
  | "error";

export interface GymResult {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  distanceM: number;
}

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

export function useCheckin(overrideCoords?: { lat: number; lng: number } | null) {
  const [result, setResult] = useState<CheckInResult>({ status: "idle", message: "" });
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [stateId, setStateId] = useState<string>("");
  const [searchResults, setSearchResults] = useState<GymResult[]>([]);
  const [selectedGym, setSelectedGym] = useState<GymResult | null>(null);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
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
        setResult({
          status: "already_checked_in",
          message: msToDisplay(COOLDOWN_MS - elapsed),
          blockedUntil: new Date(lastMs + COOLDOWN_MS),
        });
      }
    }
  }, []);

  // ── Step 1: get GPS + state, open search UI ─────────────────────────────────
  async function checkIn() {
    if (result.status === "already_checked_in" || result.status === "success") return;

    setResult({ status: "requesting_location", message: "requesting location..." });

    let lat: number, lng: number;
    if (overrideCoords) {
      lat = overrideCoords.lat;
      lng = overrideCoords.lng;
    } else {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
        );
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch {
        setResult({ status: "location_denied", message: "Enable location to check in" });
        return;
      }
    }

    // Reverse geocode state
    try {
      const geo = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
      ).then((r) => r.json());
      const code: string = geo.principalSubdivisionCode ?? "";
      if (!code.startsWith("US-")) {
        setResult({ status: "error", message: "Must be in the US to check in." });
        return;
      }
      setStateId(code.replace("US-", ""));
    } catch {
      setResult({ status: "error", message: "Couldn't determine your location. Try again." });
      return;
    }

    setUserCoords({ lat, lng });
    setSelectedGym(null);
    setResult({ status: "searching", message: "" });
    doSearch(lat, lng, "");
  }

  // ── Gym search (called by GymSearch component via debounce) ─────────────────
  async function doSearch(lat: number, lng: number, query: string) {
    setIsSearchLoading(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/search-gyms`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ lat, lng, query }),
        }
      );
      const data = await res.json();
      setSearchResults(data.results ?? []);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearchLoading(false);
    }
  }

  function searchGyms(query: string) {
    if (!userCoords) return;
    doSearch(userCoords.lat, userCoords.lng, query);
  }

  // ── Step 2: user picks a gym ────────────────────────────────────────────────
  function selectGym(gym: GymResult) {
    setSelectedGym(gym);
    setResult({ status: "gym_selected", message: "" });
  }

  // ── Step 3: verify distance + record check-in ────────────────────────────────
  async function verifyCheckin() {
    if (!userCoords || !selectedGym || result.status === "verifying") return;
    setResult({ status: "verifying", message: "" });

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/check-in`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            lat: userCoords.lat,
            lng: userCoords.lng,
            deviceUuid: deviceUuid.current,
            stateId,
            gymLat: selectedGym.lat,
            gymLng: selectedGym.lng,
            gymName: selectedGym.name,
          }),
        }
      );
      const data = await res.json();

      if (data.blocked) {
        const until = new Date(data.retryAt);
        localStorage.setItem(LAST_CHECKIN_KEY, (until.getTime() - COOLDOWN_MS).toString());
        setResult({
          status: "blocked",
          message: msToDisplay(until.getTime() - Date.now()),
          blockedUntil: until,
        });
      } else if (data.verified === false) {
        setResult({
          status: "too_far",
          message: `${Math.round(data.distanceM)}m away — server says you're too far`,
        });
      } else if (!data.ok) {
        setResult({ status: "error", message: "Something went wrong. Try again." });
      } else {
        localStorage.setItem(LAST_CHECKIN_KEY, Date.now().toString());
        setResult({
          status: "success",
          message: `Clocked into ${selectedGym.name}! glhf`,
          successStateId: data.stateId || stateId,
        });
      }
    } catch {
      setResult({ status: "error", message: "Something went wrong. Try again." });
    }
  }

  function cancelSearch() {
    setUserCoords(null);
    setSearchResults([]);
    setSelectedGym(null);
    setStateId("");
    setResult({ status: "idle", message: "" });
  }

  return {
    result,
    userCoords,
    searchResults,
    selectedGym,
    isSearchLoading,
    checkIn,
    searchGyms,
    selectGym,
    verifyCheckin,
    cancelSearch,
  };
}
