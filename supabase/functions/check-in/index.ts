import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function hashIP(ip: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Try multiple Overpass mirrors in sequence — the main endpoint is often slow
// or rate-limited when called from cloud IPs (Deno Deploy / Supabase Edge)
const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
];

interface OverpassResult {
  found: boolean;
  name: string | null;
  unavailable?: boolean;
}

async function detectGym(lat: number, lng: number): Promise<OverpassResult> {
  // [timeout:20] tells Overpass to give up server-side after 20s (avoids hanging)
  const query = `[out:json][timeout:20];(node[leisure=fitness_centre](around:200,${lat},${lng});node[amenity=gym](around:200,${lat},${lng});way[leisure=fitness_centre](around:200,${lat},${lng});way[amenity=gym](around:200,${lat},${lng}););out 1;`;

  for (const mirror of OVERPASS_MIRRORS) {
    try {
      const ctrl = new AbortController();
      // 22s client-side abort — slightly longer than the Overpass server timeout
      const timer = setTimeout(() => ctrl.abort(), 22000);

      const res = await fetch(mirror, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: ctrl.signal,
      });
      clearTimeout(timer);

      // Rate-limited or server error on this mirror — try the next one
      if (res.status === 429 || res.status >= 500) {
        console.warn(`Mirror ${mirror} returned ${res.status}, trying next`);
        continue;
      }

      const data = await res.json();
      if (!data.elements?.length) return { found: false, name: null };

      return { found: true, name: data.elements[0]?.tags?.name ?? null };
    } catch (err) {
      console.warn(`Mirror ${mirror} failed:`, err instanceof Error ? err.message : err);
      // Timeout or network error — try the next mirror
    }
  }

  // All mirrors failed
  return { found: false, name: null, unavailable: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { lat, lng, deviceUuid, stateId } = await req.json();
    if (!lat || !lng || !deviceUuid || !stateId) return json({ error: "bad_request" }, 400);

    // Hash client IP
    const forwarded = req.headers.get("x-forwarded-for") ?? "unknown";
    const ipHash = await hashIP(forwarded.split(",")[0].trim());

    // Rate limit — block if either ip_hash OR device_uuid checked in within 12h
    const windowStart = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    const { data: hit } = await supabase
      .from("rate_limits")
      .select("checked_in_at")
      .or(`ip_hash.eq.${ipHash},device_uuid.eq.${deviceUuid}`)
      .gt("checked_in_at", windowStart)
      .limit(1)
      .maybeSingle();

    if (hit) {
      const retryAt = new Date(
        new Date(hit.checked_in_at).getTime() + 12 * 60 * 60 * 1000
      ).toISOString();
      return json({ blocked: true, retryAt });
    }

    // Gym detection
    const gym = await detectGym(lat, lng);

    if (gym.unavailable) return json({ isGym: false, error: "verification_unavailable" });
    if (!gym.found) return json({ isGym: false });

    // Record rate limit entry
    await supabase.from("rate_limits").insert({ ip_hash: ipHash, device_uuid: deviceUuid });

    // Atomically increment state
    await supabase.rpc("increment_state", { state_id: stateId });

    // Return new count
    const { data: stateRow } = await supabase
      .from("states")
      .select("count")
      .eq("id", stateId)
      .single();

    return json({ isGym: true, gymName: gym.name, stateId, newCount: stateRow?.count ?? 0 });
  } catch (err) {
    console.error("check-in error:", err);
    return json({ error: "internal_error" }, 500);
  }
});
