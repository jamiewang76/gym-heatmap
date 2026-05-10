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

    const { lat, lng, deviceUuid, stateId, gymName, gymLat, gymLng, osmType, osmId } = await req.json();
    if (!lat || !lng || !deviceUuid || !stateId) return json({ error: "bad_request" }, 400);

    // Rate limit — block if either ip_hash OR device_uuid checked in within 12h
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

    // Record and increment
    await supabase.from("rate_limits").insert({ ip_hash: ipHash, device_uuid: deviceUuid });
    await supabase.rpc("increment_state", { state_id: stateId });

    const { data: stateRow } = await supabase
      .from("states")
      .select("count")
      .eq("id", stateId)
      .single();

    console.log(
      `[check-in] state=${stateId} gym="${gymName ?? "unverified"}" ` +
      `gymLat=${gymLat} gymLng=${gymLng} osmType=${osmType} osmId=${osmId} ` +
      `userLat=${lat} userLng=${lng}`
    );

    return json({ ok: true, stateId, newCount: stateRow?.count ?? 0 });
  } catch (err) {
    console.error("check-in error:", err);
    return json({ error: "internal_error" }, 500);
  }
});
