import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { keywords, category = "video", perPage = 3 } = await req.json();

    const PEXELS_API_KEY = Deno.env.get("PEXELS_API_KEY");
    if (!PEXELS_API_KEY) throw new Error("PEXELS_API_KEY not configured");

    const keywordList = Array.isArray(keywords) ? keywords : [keywords];

    let thumbnails: string[] = [];
    let mediaUrls: string[] = [];

    // Try keywords individually (most specific first), then combined as fallback
    const queriesToTry = [
      ...keywordList,
      keywordList.join(" "),
    ];

    for (const query of queriesToTry) {
      if (thumbnails.length >= perPage) break;

      const remaining = perPage - thumbnails.length;

      if (category === "video") {
        const response = await fetch(
          `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${remaining}&orientation=portrait&size=small`,
          { headers: { Authorization: PEXELS_API_KEY } }
        );
        if (!response.ok) continue;
        const data = await response.json();
        for (const video of data.videos || []) {
          if (thumbnails.length >= perPage) break;
          const thumb = video.image || "";
          if (thumbnails.includes(thumb)) continue;
          thumbnails.push(thumb);
          const file = video.video_files
            ?.sort((a: any, b: any) => (a.width || 0) - (b.width || 0))
            ?.[0];
          mediaUrls.push(file?.link || "");
        }
      } else {
        const response = await fetch(
          `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${remaining}&orientation=portrait&size=small`,
          { headers: { Authorization: PEXELS_API_KEY } }
        );
        if (!response.ok) continue;
        const data = await response.json();
        for (const photo of data.photos || []) {
          if (thumbnails.length >= perPage) break;
          const thumb = photo.src?.small || photo.src?.medium || "";
          if (thumbnails.includes(thumb)) continue;
          thumbnails.push(thumb);
          mediaUrls.push(photo.src?.large || photo.src?.original || "");
        }
      }
    }

    return new Response(JSON.stringify({ thumbnails, mediaUrls }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("search-stock-media error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
