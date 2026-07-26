import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MIME_MAP: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
};

// Step 1: Upload file to Google's File API using resumable upload
async function uploadToGoogleFiles(
  signedUrl: string,
  mimeType: string,
  fileName: string,
  apiKey: string
): Promise<string> {
  // Initiate resumable upload
  const initRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Type": mimeType,
      },
      body: JSON.stringify({
        file: { display_name: fileName },
      }),
    }
  );

  if (!initRes.ok) {
    const errText = await initRes.text();
    console.error("Google Files init error:", initRes.status, errText);
    throw new Error(`Failed to initiate Google file upload: ${initRes.status}`);
  }

  const uploadUrl = initRes.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) {
    throw new Error("No upload URL returned from Google Files API");
  }

  // Download file from storage as stream and upload to Google
  const fileRes = await fetch(signedUrl);
  if (!fileRes.ok) {
    throw new Error(`Failed to download file from storage: ${fileRes.status}`);
  }

  const fileBytes = await fileRes.arrayBuffer();
  console.log(`File downloaded: ${fileBytes.byteLength} bytes, uploading to Google...`);

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Length": fileBytes.byteLength.toString(),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: fileBytes,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    console.error("Google Files upload error:", uploadRes.status, errText);
    throw new Error(`Failed to upload file to Google: ${uploadRes.status}`);
  }

  const uploadResult = await uploadRes.json();
  const fileUri = uploadResult.file?.uri;

  if (!fileUri) {
    console.error("No file URI in response:", JSON.stringify(uploadResult));
    throw new Error("No file URI returned from Google Files API");
  }

  console.log(`File uploaded to Google: ${fileUri}`);

  // Wait for file to be processed
  const fileName2 = uploadResult.file?.name;
  if (fileName2) {
    let state = uploadResult.file?.state;
    let attempts = 0;
    while (state === "PROCESSING" && attempts < 60) {
      await new Promise((r) => setTimeout(r, 3000));
      const statusRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${fileName2}?key=${apiKey}`
      );
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        state = statusData.state;
        console.log(`File state: ${state} (attempt ${attempts + 1})`);
      }
      attempts++;
    }
    if (state === "FAILED") {
      throw new Error("Google file processing failed");
    }
  }

  return fileUri;
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

    // Read API key from app_settings table (configured via Settings ⚙ button)
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: keyData } = await sb.from("app_settings").select("value").eq("key", "GOOGLE_AI_API_KEY").maybeSingle();
    const GOOGLE_AI_API_KEY = keyData?.value;
    if (!GOOGLE_AI_API_KEY) {
      throw new Error("GOOGLE_AI_API_KEY não configurada. Use o botão ⚙ no topo para adicionar sua chave.");
    }

    const { filePath } = await req.json();
    if (!filePath) {
      return new Response(JSON.stringify({ error: "filePath is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Processing file: ${filePath}`);

    // Create signed URL for the file
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: signedData, error: signError } = await supabaseAdmin.storage
      .from("videos")
      .createSignedUrl(filePath, 3600);

    if (signError || !signedData?.signedUrl) {
      console.error("Signed URL error:", signError);
      throw new Error(`Failed to create signed URL: ${signError?.message || "no URL"}`);
    }

    // Determine MIME type
    const ext = filePath.split(".").pop()?.toLowerCase() || "mp4";
    const mimeType = MIME_MAP[ext] || "video/mp4";

    // Upload to Google Files API
    const fileUri = await uploadToGoogleFiles(
      signedData.signedUrl,
      mimeType,
      filePath.split("/").pop() || "video.mp4",
      GOOGLE_AI_API_KEY
    );

    // Call Gemini with the uploaded file reference
    console.log("Calling Gemini for transcription...");

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
                  file_data: {
                    mime_type: mimeType,
                    file_uri: fileUri,
                  },
                },
                {
                  text: `Transcribe this media file completely. The language is Portuguese (pt-BR).

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
      throw new Error(`Gemini API error: ${geminiRes.status}`);
    }

    const geminiResult = await geminiRes.json();

    // Extract function call result
    const parts = geminiResult.candidates?.[0]?.content?.parts;
    const fnCall = parts?.find((p: any) => p.functionCall);

    if (!fnCall) {
      // Fallback: check if there's text response
      const textPart = parts?.find((p: any) => p.text);
      console.error("No function call in Gemini response. Text:", textPart?.text);
      console.error("Full response:", JSON.stringify(geminiResult).slice(0, 500));
      throw new Error("No structured transcription returned from Gemini");
    }

    const transcription = fnCall.functionCall.args;
    console.log(
      `Transcription complete: ${transcription.segments?.length || 0} segments, ${transcription.words?.length || 0} words`
    );

    // Clean up: delete file from storage
    try {
      await supabaseAdmin.storage.from("videos").remove([filePath]);
      console.log("File deleted from storage");
    } catch (e) {
      console.warn("Failed to delete file from storage:", e);
    }

    // Also delete from Google Files API
    try {
      const googleFileName = fileUri.split("/").slice(-1)[0];
      await fetch(
        `https://generativelanguage.googleapis.com/v1beta/files/${googleFileName}?key=${GOOGLE_AI_API_KEY}`,
        { method: "DELETE" }
      );
    } catch (e) {
      console.warn("Failed to delete Google file:", e);
    }

    return new Response(JSON.stringify(transcription), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("transcribe-large error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
