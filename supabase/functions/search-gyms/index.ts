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
      categories: "18011,18021,18029",
      limit: "8",
      fields: "fsq_id,name,geocodes,location,distance",
    });
    if (query?.trim()) params.set("query", query.trim());

    const fsqKey = Deno.env.get("FSQ_API_KEY")!;
    const res = await fetch(
      `https://places-api.foursquare.com/places/search?${params}`,
      {
        headers: {
          Authorization: `fsq3${fsqKey}`,
          Accept: "application/json",
        },
      }
    );

    if (!res.ok) {
      console.error(`Foursquare ${res.status}: ${await res.text()}`);
      return json({ results: [] });
    }

    const data = await res.json();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = (data.results ?? []).map((p: any) => ({
      id: p.fsq_id,
      name: p.name,
      address: p.location?.formatted_address ?? "",
      lat: p.geocodes?.main?.latitude ?? null,
      lng: p.geocodes?.main?.longitude ?? null,
      distanceM: p.distance ?? 0,
    }));

    return json({ results });
  } catch (err) {
    console.error("search-gyms error:", err);
    return json({ error: "internal_error", results: [] }, 500);
  }
});
