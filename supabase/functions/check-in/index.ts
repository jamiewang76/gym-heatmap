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

    // Rate limit check — block if either ip_hash OR device_uuid checked in within 12h
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

    // Gym detection via Overpass
    const overpassQuery = `[out:json];(node[leisure=fitness_centre](around:200,${lat},${lng});node[amenity=gym](around:200,${lat},${lng}););out;`;
    const overpassUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;

    let gymName: string | null = null;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(overpassUrl, { signal: ctrl.signal });
      clearTimeout(timer);

      if (res.status === 429) return json({ isGym: false, error: "verification_unavailable" });

      const data = await res.json();
      if (!data.elements?.length) return json({ isGym: false });

      gymName = data.elements[0]?.tags?.name ?? null;
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === "AbortError";
      return json({ isGym: false, error: isTimeout ? "verification_unavailable" : "verification_unavailable" });
    }

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

    return json({ isGym: true, gymName, stateId, newCount: stateRow?.count ?? 0 });
  } catch (err) {
    console.error(err);
    return json({ error: "internal_error" }, 500);
  }
});
