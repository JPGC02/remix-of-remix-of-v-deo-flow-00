import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { segments, frequency = 50, defaultDuration = 3 } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Build transcript text from speech segments
    const speechSegments = segments.filter(
      (s: any) => s.type === "speech" && s.status === "kept"
    );

    if (speechSegments.length === 0) {
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const transcript = speechSegments
      .map((s: any) => `[${s.start.toFixed(1)}s-${s.end.toFixed(1)}s] ${s.text}`)
      .join("\n");

    // Map frequency 0-100 to suggestion count guidance
    const minSuggestions = Math.max(1, Math.round((frequency / 100) * speechSegments.length * 0.3));
    const maxSuggestions = Math.max(minSuggestions + 1, Math.round((frequency / 100) * speechSegments.length * 0.6));

    const systemPrompt = `You are a professional video editor and cinematographer AI assistant. Analyze the transcript and suggest B-Roll insertion points.

For each suggestion, determine:
- timestamp: the exact start time in seconds where B-Roll should begin (within a speech segment)
- duration: how long the B-Roll should last (default around ${defaultDuration}s)
- context: a brief description in Portuguese of what is being discussed AT THAT EXACT MOMENT
- keywords: 2-3 English search terms for finding stock footage/images (for Pexels API)
- category: "video" for motion footage, "image" for static images, "text" for text overlays
- transcriptExcerpt: the exact words from the transcript that motivated this suggestion
- veoPrompt: a DETAILED documentary-style prompt in English for AI video generation (VEO 3). This must describe:
  * Camera movement (e.g. "smooth dolly-in", "slow pan right", "static tripod shot", "aerial drone flyover")
  * Lighting — prefer NATURAL lighting descriptions (e.g. "natural ambient office lighting", "soft window light", "overcast daylight") — AVOID dramatic/cinematic lighting
  * Depth of field (e.g. "shallow depth of field with bokeh background", "deep focus sharp throughout")
  * Visual subject with specific details (e.g. "a modern calendar app on a MacBook screen" NOT just "calendar")
  * Mood and color tone — prefer natural/documentary tones (e.g. "natural color palette, editorial feel", "warm but muted tones")
  * MUST include "Any text or UI visible must be in Brazilian Portuguese" in the prompt
  * MUST include "RAW photo style, shot on real camera, natural lighting, authentic textures, natural grain" for realism
  * MUST include "no people visible, no faces, no talking heads, no text overlays, NOT AI-generated, NOT plastic, NOT glossy" at the end
  * Example: "Smooth dolly-in shot of a modern calendar app on a laptop screen, natural ambient office lighting, shallow depth of field, shot on real camera, documentary photography style, natural color grading, any text visible in Brazilian Portuguese, no people visible, no faces, NOT AI-generated, NOT plastic, NOT glossy"

CRITICAL RULES FOR KEYWORD ACCURACY:
- Keywords MUST represent the EXACT visual concept mentioned in the specific transcript excerpt, NOT general themes of the video
- Each suggestion must be tied to a SPECIFIC sentence or phrase — include that phrase in transcriptExcerpt
- Do NOT use keywords from adjacent or surrounding segments — only from the exact timestamp range
- Prefer concrete, visually searchable concepts (e.g. "calendar planner schedule" for time blocking, "tomato timer pomodoro" for Pomodoro technique)
- If a segment has no clear visual concept, DO NOT suggest B-Roll for it — skip it

CRITICAL RULES FOR veoPrompt:
- The veoPrompt must be a complete, self-contained documentary-style visual description — do NOT reference the transcript or context
- Focus on VISUAL description with NATURAL/REAL photography aesthetics, not hyper-cinematic AI aesthetics
- Always specify natural lighting conditions, not dramatic/artificial lighting
- Any text, UI, labels, screens, or written content visible in the scene MUST be described as being in Brazilian Portuguese
- Always include "RAW photo style, shot on real camera, authentic textures, natural grain" for photorealism
- Always end with "no people visible, no faces, no talking heads, no text overlays, NOT AI-generated, NOT plastic, NOT glossy"

General rules:
- Suggest between ${minSuggestions} and ${maxSuggestions} B-Roll moments
- Place B-Roll during explanations, examples, or visual concepts — NOT during direct-to-camera personal stories
- Keywords must be in English for stock media search
- Context must be in Portuguese
- Duration should be between 2-6 seconds
- Spread suggestions across the video, don't cluster them`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analyze this transcript and suggest B-Roll insertion points:\n\n${transcript}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_broll",
              description: "Return B-Roll suggestions for the video",
              parameters: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        timestamp: { type: "number", description: "Start time in seconds" },
                        duration: { type: "number", description: "Duration in seconds" },
                        context: { type: "string", description: "Brief description in Portuguese" },
                        keywords: {
                          type: "array",
                          items: { type: "string" },
                          description: "2-3 English search terms for stock media",
                        },
                        category: {
                          type: "string",
                          enum: ["video", "image", "text"],
                          description: "Type of B-Roll",
                        },
                        transcriptExcerpt: {
                          type: "string",
                          description: "The exact words from the transcript that motivated this B-Roll suggestion",
                        },
                        veoPrompt: {
                          type: "string",
                          description: "Detailed cinematic prompt in English for AI video generation with camera movement, lighting, depth of field, visual subject, mood, and negative constraints",
                        },
                      },
                      required: ["timestamp", "duration", "context", "keywords", "category", "transcriptExcerpt", "veoPrompt"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["suggestions"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "suggest_broll" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error("No tool call in AI response");
    }

    const args = JSON.parse(toolCall.function.arguments);
    const suggestions = (args.suggestions || []).map((s: any, i: number) => ({
      id: `br-${Date.now()}-${i}`,
      timestamp: s.timestamp,
      duration: s.duration,
      context: s.context,
      keywords: s.keywords,
      category: s.category,
      transcriptExcerpt: s.transcriptExcerpt || "",
      veoPrompt: s.veoPrompt || "",
      thumbnails: [],
      status: "pending",
      source: "IA",
    }));

    return new Response(JSON.stringify({ suggestions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("suggest-broll error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
