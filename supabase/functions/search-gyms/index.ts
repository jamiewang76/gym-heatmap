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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { lat, lng, query } = await req.json();
    if (lat == null || lng == null) return json({ error: "bad_request" }, 400);

    const params = new URLSearchParams({
      ll: `${lat},${lng}`,
      radius: "5000",
      limit: "8",
      fsq_category_ids: "4bf58dd8d48988d175941735",
    });
    if (query?.trim()) params.set("query", query.trim());

    const fsqKey = Deno.env.get("FSQ_API_KEY");
    if (!fsqKey) {
      console.error("FSQ_API_KEY secret is not set");
      return json({ results: [] });
    }

    const res = await fetch(
      `https://places-api.foursquare.com/places/search?${params}`,
      {
        headers: {
          Authorization: `Bearer ${fsqKey}`,
          "X-Places-Api-Version": "2025-06-17",
          Accept: "application/json",
        },
      }
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "(unreadable)");
      console.error(`Foursquare ${res.status}: ${body}`);
      return json({ results: [] });
    }

    let data: { results?: unknown[] };
    try {
      data = await res.json();
    } catch {
      console.error("Foursquare non-JSON response");
      return json({ results: [] });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = (data.results ?? []).map((p: any) => ({
      id: p.fsq_place_id,
      name: p.name,
      address: p.location?.formatted_address ?? "",
      lat: p.latitude ?? null,
      lng: p.longitude ?? null,
      distanceM: p.distance ?? 0,
    }));

    return json({ results });
  } catch (err) {
    console.error("search-gyms error:", err);
    return json({ error: "internal_error", results: [] }, 500);
  }
});
