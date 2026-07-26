import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface GenerateRequest {
  prompt: string;
  duration?: number;
  keywords?: string[];
  model?: string;
  aspectRatio?: string;
}

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const MODEL_MAP: Record<string, string> = {
  "3.0": "veo-3.0-generate-001",
  "3.0-fast": "veo-3.0-fast-generate-001",
  "3.1": "veo-3.1-generate-preview",
  "3.1-fast": "veo-3.1-fast-generate-preview",
};
const MAX_POLL_TIME_MS = 5 * 60 * 1000; // 5 minutes
const POLL_INTERVAL_MS = 10_000; // 10 seconds

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Read API key from app_settings table (configured via Settings ⚙ button)
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: keyData } = await sb.from("app_settings").select("value").eq("key", "GOOGLE_AI_API_KEY").maybeSingle();
    const GOOGLE_AI_API_KEY = keyData?.value;
    if (!GOOGLE_AI_API_KEY) {
      return new Response(JSON.stringify({ error: "GOOGLE_AI_API_KEY não configurada. Use o botão ⚙ no topo para adicionar sua chave." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { prompt, duration = 5, keywords = [], model = "3.1-fast", aspectRatio = "9:16" }: GenerateRequest = await req.json();
    const MODEL = MODEL_MAP[model] || MODEL_MAP["3.1-fast"];

    if (!prompt) {
      return new Response(JSON.stringify({ error: "prompt is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use the prompt directly (already enriched by suggest-broll or edited by user)
    // Only append keywords if prompt doesn't seem enriched (fallback for legacy calls)
    const finalPrompt = prompt.length > 100
      ? prompt
      : keywords.length > 0
        ? `${prompt}. Visual elements: ${keywords.join(", ")}. No people visible, no faces, no talking heads, no text overlays.`
        : `${prompt}. No people visible, no faces, no talking heads, no text overlays.`;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;
        const safeClose = () => {
          if (!closed) { closed = true; controller.close(); }
        };
        const sendEvent = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        try {
          sendEvent("progress", { phase: "starting", message: "Iniciando geração de vídeo...", percent: 0 });

          // Step 1: Start video generation via predictLongRunning
          sendEvent("progress", { phase: "generating", message: "Enviando para VEO 3...", percent: 10 });

          const generateUrl = `${BASE_URL}/models/${MODEL}:predictLongRunning?key=${GOOGLE_AI_API_KEY}`;

          const generateBody = {
            instances: [
              {
                prompt: finalPrompt,
              },
            ],
            parameters: {
              aspectRatio: aspectRatio,
            },
          };

          const generateResponse = await fetch(generateUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(generateBody),
          });

          if (!generateResponse.ok) {
            const errText = await generateResponse.text();
            console.error("VEO 3 API error:", generateResponse.status, errText);

            if (generateResponse.status === 429) {
              sendEvent("error", { message: "Limite de requisições excedido. Tente novamente em alguns segundos." });
            } else if (generateResponse.status === 402 || generateResponse.status === 403) {
              sendEvent("error", { message: "Créditos insuficientes ou acesso negado à API VEO 3." });
            } else {
              sendEvent("error", { message: `Erro na API VEO 3: ${generateResponse.status} - ${errText.slice(0, 200)}` });
            }
            safeClose();
            return;
          }

          const initResult = await generateResponse.json();
          const operationName = initResult.name;

          if (!operationName) {
            console.error("No operation name returned:", JSON.stringify(initResult).slice(0, 500));
            sendEvent("error", { message: "VEO 3 não retornou uma operação válida." });
            safeClose();
            return;
          }

          sendEvent("progress", { phase: "generating", message: "Vídeo sendo gerado pelo VEO 3...", percent: 20 });

          // Step 2: Poll operation until done
          const startTime = Date.now();
          let pollCount = 0;

          while (true) {
            const elapsed = Date.now() - startTime;
            if (elapsed > MAX_POLL_TIME_MS) {
              sendEvent("error", { message: "Timeout: geração excedeu 5 minutos." });
              safeClose();
              return;
            }

            await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
            pollCount++;

            const percent = Math.min(20 + Math.floor((elapsed / MAX_POLL_TIME_MS) * 70), 90);
            sendEvent("progress", { phase: "processing", message: `Processando... (${Math.floor(elapsed / 1000)}s)`, percent });

            const pollUrl = `${BASE_URL}/${operationName}?key=${GOOGLE_AI_API_KEY}`;
            const pollResponse = await fetch(pollUrl, {
              headers: { "Content-Type": "application/json" },
            });

            if (!pollResponse.ok) {
              const pollErr = await pollResponse.text();
              console.error("Poll error:", pollResponse.status, pollErr);
              // Retry on transient errors
              if (pollCount < 3 && pollResponse.status >= 500) continue;
              sendEvent("error", { message: `Erro ao verificar status: ${pollResponse.status}` });
              safeClose();
              return;
            }

            const pollResult = await pollResponse.json();

            if (pollResult.done) {
              // Check for errors in the operation result
              if (pollResult.error) {
                console.error("Operation error:", JSON.stringify(pollResult.error));
                sendEvent("error", { message: `Erro na geração: ${pollResult.error.message || "Erro desconhecido"}` });
                safeClose();
                return;
              }

              sendEvent("progress", { phase: "downloading", message: "Baixando vídeo gerado...", percent: 90 });

              // Extract video URI from response
              const generatedSamples = pollResult.response?.generateVideoResponse?.generatedSamples;
              if (!generatedSamples || generatedSamples.length === 0) {
                console.error("No generated samples:", JSON.stringify(pollResult).slice(0, 500));
                sendEvent("error", { message: "VEO 3 não gerou nenhum vídeo." });
                safeClose();
                return;
              }

              const videoUri = generatedSamples[0].video?.uri;
              if (!videoUri) {
                console.error("No video URI:", JSON.stringify(generatedSamples[0]).slice(0, 500));
                sendEvent("error", { message: "VEO 3 não retornou URL do vídeo." });
                safeClose();
                return;
              }

              // Download the video and convert to base64
              const videoResponse = await fetch(`${videoUri}&key=${GOOGLE_AI_API_KEY}`, {
                redirect: "follow",
              });

              if (!videoResponse.ok) {
                // Try with ? instead of & in case URI has no query params
                const altUrl = videoUri.includes("?")
                  ? `${videoUri}&key=${GOOGLE_AI_API_KEY}`
                  : `${videoUri}?key=${GOOGLE_AI_API_KEY}`;
                const altResponse = await fetch(altUrl, { redirect: "follow" });
                if (!altResponse.ok) {
                  console.error("Video download failed:", videoResponse.status);
                  sendEvent("error", { message: "Falha ao baixar o vídeo gerado." });
                  safeClose();
                  return;
                }
                const arrayBuf = await altResponse.arrayBuffer();
                const bytes = new Uint8Array(arrayBuf);
                let binary = "";
                for (let i = 0; i < bytes.length; i++) {
                  binary += String.fromCharCode(bytes[i]);
                }
                const videoData = btoa(binary);
                const videoUrl = `data:video/mp4;base64,${videoData}`;

                sendEvent("complete", { videoUrl, duration, prompt: finalPrompt });
                sendEvent("progress", { phase: "done", message: "Vídeo gerado com sucesso!", percent: 100 });
                safeClose();
                return;
              }

              const arrayBuf = await videoResponse.arrayBuffer();
              const bytes = new Uint8Array(arrayBuf);
              let binary = "";
              for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
              }
              const videoData = btoa(binary);
              const videoUrl = `data:video/mp4;base64,${videoData}`;

              sendEvent("complete", { videoUrl, duration, prompt: finalPrompt });
              sendEvent("progress", { phase: "done", message: "Vídeo gerado com sucesso!", percent: 100 });
              safeClose();
              return;
            }
          }
        } catch (err) {
          console.error("SSE stream error:", err);
          sendEvent("error", { message: err instanceof Error ? err.message : "Erro desconhecido na geração." });
        } finally {
          safeClose();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("generate-broll-video error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
