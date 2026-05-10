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

const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
];

interface OverpassResult {
  found: boolean;
  name: string | null;
  gymLat: number | null;
  gymLng: number | null;
  osmType: string | null;
  osmId: number | null;
  unavailable?: boolean;
}

async function detectGym(lat: number, lng: number): Promise<OverpassResult> {
  // out center 1 — returns center coords for both node and way elements
  const query = `[out:json][timeout:7];(node[leisure=fitness_centre](around:50,${lat},${lng});node[amenity=gym](around:50,${lat},${lng});way[leisure=fitness_centre](around:50,${lat},${lng});way[amenity=gym](around:50,${lat},${lng}););out center 1;`;

  for (const mirror of OVERPASS_MIRRORS) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);

      const res = await fetch(mirror, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: ctrl.signal,
      });
      clearTimeout(timer);

      if (res.status === 429 || res.status >= 500) {
        console.warn(`Mirror ${mirror} returned ${res.status}, trying next`);
        continue;
      }

      const data = await res.json();
      if (!data.elements?.length) {
        return { found: false, name: null, gymLat: null, gymLng: null, osmType: null, osmId: null };
      }

      const el = data.elements[0];
      const gymLat: number = el.type === "way" ? el.center?.lat : el.lat;
      const gymLng: number = el.type === "way" ? el.center?.lon : el.lon;
      const gymName: string | null = el.tags?.name ?? null;

      console.log(
        `[check-in] OSM match — type=${el.type} id=${el.id} name="${gymName}" ` +
        `gymLat=${gymLat} gymLng=${gymLng} userLat=${lat} userLng=${lng} ` +
        `tags=${JSON.stringify(el.tags)}`
      );

      return { found: true, name: gymName, gymLat, gymLng, osmType: el.type, osmId: el.id };
    } catch (err) {
      console.warn(`Mirror ${mirror} failed:`, err instanceof Error ? err.message : err);
    }
  }

  return { found: false, name: null, gymLat: null, gymLng: null, osmType: null, osmId: null, unavailable: true };
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

    const forwarded = req.headers.get("x-forwarded-for") ?? "unknown";
    const ipHash = await hashIP(forwarded.split(",")[0].trim());

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

    const gym = await detectGym(lat, lng);

    if (!gym.unavailable && !gym.found) return json({ isGym: false });

    await supabase.from("rate_limits").insert({ ip_hash: ipHash, device_uuid: deviceUuid });
    await supabase.rpc("increment_state", { state_id: stateId });

    const { data: stateRow } = await supabase
      .from("states")
      .select("count")
      .eq("id", stateId)
      .single();

    return json({
      isGym: true,
      gymName: gym.found ? gym.name : null,
      gymLat: gym.gymLat,
      gymLng: gym.gymLng,
      osmType: gym.osmType,
      osmId: gym.osmId,
      stateId,
      newCount: stateRow?.count ?? 0,
    });
  } catch (err) {
    console.error("check-in error:", err);
    return json({ error: "internal_error" }, 500);
  }
});
