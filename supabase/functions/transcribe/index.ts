import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase configuration missing");
    }

    // Read API key from app_settings table
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: keyData } = await sb.from("app_settings").select("value").eq("key", "GOOGLE_AI_API_KEY").maybeSingle();
    const GOOGLE_AI_API_KEY = keyData?.value;
    if (!GOOGLE_AI_API_KEY) {
      throw new Error("GOOGLE_AI_API_KEY não configurada. Use o botão ⚙ no topo para adicionar sua chave.");
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return new Response(
        JSON.stringify({ error: "No file provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const language = formData.get("language") as string | null;
    const fileSizeMB = (file.size / 1024 / 1024).toFixed(1);
    console.log(`Transcribing ${file.name} (${fileSizeMB}MB) with Gemini (inline base64)...`);

    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64Data = arrayBufferToBase64(arrayBuffer);

    // Determine MIME type
    const ext = file.name.split(".").pop()?.toLowerCase() || "mp3";
    const mimeMap: Record<string, string> = {
      mp3: "audio/mpeg",
      wav: "audio/wav",
      m4a: "audio/mp4",
      ogg: "audio/ogg",
      mp4: "video/mp4",
      webm: "video/webm",
    };
    const mimeType = mimeMap[ext] || "audio/mpeg";

    const langInstruction = language ? `The language is ${language === "pt" ? "Portuguese (pt-BR)" : language}.` : "Detect the language automatically.";

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_AI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Data,
                  },
                },
                {
                  text: `Transcribe this audio file completely. ${langInstruction}

You MUST return the result by calling the transcription_result function.

Rules:
- Return EVERY spoken word with precise timestamps in seconds (decimal, e.g. 1.5).
- Group words into segments (sentences or phrases). Each segment has start, end, and text.
- Also return individual words with their own start and end times.
- Be accurate with timestamps. Use the actual audio timing.
- Do not skip or summarize any content.
- Include all filler words, hesitations, and repetitions exactly as spoken.`,
                },
              ],
            },
          ],
          tools: [
            {
              function_declarations: [
                {
                  name: "transcription_result",
                  description:
                    "Return the full transcription with segment-level and word-level timestamps",
                  parameters: {
                    type: "object",
                    properties: {
                      text: {
                        type: "string",
                        description: "Full transcription text",
                      },
                      language: {
                        type: "string",
                        description: "Detected language code (e.g. pt, en, es)",
                      },
                      duration: {
                        type: "number",
                        description: "Total duration of the audio in seconds",
                      },
                      segments: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            start: { type: "number", description: "Start time in seconds" },
                            end: { type: "number", description: "End time in seconds" },
                            text: { type: "string", description: "Transcribed text" },
                          },
                          required: ["start", "end", "text"],
                        },
                      },
                      words: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            word: { type: "string" },
                            start: { type: "number" },
                            end: { type: "number" },
                          },
                          required: ["word", "start", "end"],
                        },
                      },
                    },
                    required: ["text", "segments", "words"],
                  },
                },
              ],
            },
          ],
          tool_config: {
            function_calling_config: {
              mode: "ANY",
              allowed_function_names: ["transcription_result"],
            },
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini error:", geminiRes.status, errText);
      return new Response(
        JSON.stringify({ error: "Gemini API error", details: errText }),
        { status: geminiRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiResult = await geminiRes.json();

    // Extract function call result
    const parts = geminiResult.candidates?.[0]?.content?.parts;
    const fnCall = parts?.find((p: any) => p.functionCall);

    if (!fnCall) {
      const textPart = parts?.find((p: any) => p.text);
      console.error("No function call in response. Text:", textPart?.text);
      throw new Error("No structured transcription returned from Gemini");
    }

    const transcription = fnCall.functionCall.args;
    console.log(
      `Transcription complete: ${transcription.segments?.length || 0} segments, ${transcription.words?.length || 0} words`
    );

    return new Response(JSON.stringify(transcription), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Transcription error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
