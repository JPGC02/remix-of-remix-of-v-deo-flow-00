const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url).searchParams.get("url");
  if (!url) {
    return new Response(JSON.stringify({ error: "Missing url param" }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // Security: only allow Pixabay CDN
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith("pixabay.com")) {
      return new Response(JSON.stringify({ error: "Domain not allowed" }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  } catch {
    return new Response(JSON.stringify({ error: "Invalid URL" }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // Forward Range header for seeking
  const headers: Record<string, string> = {};
  const range = req.headers.get("Range");
  if (range) headers["Range"] = range;

  const upstream = await fetch(url, { headers });

  const responseHeaders: Record<string, string> = { ...corsHeaders };
  const ct = upstream.headers.get("Content-Type");
  if (ct) responseHeaders["Content-Type"] = ct;
  const cl = upstream.headers.get("Content-Length");
  if (cl) responseHeaders["Content-Length"] = cl;
  const cr = upstream.headers.get("Content-Range");
  if (cr) responseHeaders["Content-Range"] = cr;
  const accept = upstream.headers.get("Accept-Ranges");
  if (accept) responseHeaders["Accept-Ranges"] = accept;

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
});
