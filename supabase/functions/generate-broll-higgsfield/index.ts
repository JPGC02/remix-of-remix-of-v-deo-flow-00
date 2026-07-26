import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BASE_URL = "https://platform.higgsfield.ai";

const VIDEO_MODEL_MAP: Record<string, string> = {
  "dop-lite": "higgsfield-ai/dop/lite",
  "dop-standard": "higgsfield-ai/dop/standard",
  "dop-turbo": "higgsfield-ai/dop/turbo",
  "dop-lite-flf": "higgsfield-ai/dop/lite/first-last-frame",
  "dop-standard-flf": "higgsfield-ai/dop/standard/first-last-frame",
  "dop-turbo-flf": "higgsfield-ai/dop/turbo/first-last-frame",
  "kling-2.1-pro": "kling-video/v2.1/pro/image-to-video",
  "seedance-1.0-pro": "bytedance/seedance/v1/pro/image-to-video",
};

const IMAGE_MODEL_MAP: Record<string, string> = {
  "soul-standard": "higgsfield-ai/soul/standard",
  "popcorn-auto": "higgsfield-ai/popcorn/auto",
};
const MAX_POLL_TIME_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 5_000;

interface GenerateRequest {
  prompt: string;
  duration?: number;
  keywords?: string[];
  model?: string;
  imageModel?: string;
  aspectRatio?: string;
  lastFramePrompt?: string;
}

// ─── Prompt Engineering ───

const MOTION_KEYWORDS = [
  "dolly", "pan", "tilt", "tracking", "zoom", "crane", "orbit",
  "push-in", "pull-out", "steadicam", "handheld", "aerial",
  "sweeping", "glide", "follow", "reveal", "parallax",
];

const MOTION_REGEX = new RegExp(
  `\\b(${MOTION_KEYWORDS.join("|")})(\\s+(shot|move|movement|motion|in|out|up|down|left|right))?\\b`,
  "gi",
);

const COMPOSITION_HINTS: Record<string, string> = {
  "9:16": "Vertical portrait composition, tall narrow frame, subject centered vertically, shot in portrait orientation.",
  "16:9": "Wide horizontal composition, cinematic widescreen frame, landscape orientation.",
  "1:1": "Square composition, centered subject, balanced symmetrical framing.",
  "4:5": "Slightly tall portrait composition, social media format, vertical emphasis.",
  "4:3": "Classic 4:3 frame, balanced composition, standard broadcast format.",
};

const MOTION_HINTS: Record<string, string> = {
  "9:16": "slow cinematic tilt up with subtle vertical parallax",
  "16:9": "slow cinematic pan with subtle horizontal parallax",
  "1:1": "slow cinematic push-in with subtle parallax",
  "4:5": "slow cinematic tilt up with subtle vertical parallax",
  "4:3": "slow cinematic push-in with subtle parallax",
};

/** Split an incoming prompt into a static image prompt and a motion video prompt. */
function buildSpecializedPrompts(
  rawPrompt: string,
  keywords: string[],
  aspectRatio: string,
): { imagePrompt: string; videoPrompt: string } {
  // Collect motion phrases from the original prompt
  const motionPhrases: string[] = [];
  const matches = rawPrompt.match(MOTION_REGEX);
  if (matches) motionPhrases.push(...matches.map((m) => m.trim()));

  // Strip motion phrases from the description to get a purely visual description
  const visualDescription = rawPrompt
    .replace(MOTION_REGEX, "")
    .replace(/,\s*,/g, ",")
    .replace(/\.\s*\./g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();

  const compositionHint = COMPOSITION_HINTS[aspectRatio] || COMPOSITION_HINTS["16:9"];
  const defaultMotion = MOTION_HINTS[aspectRatio] || MOTION_HINTS["16:9"];

  // ── Image prompt: composition, lighting, style ──
  const keywordClause = keywords.length > 0
    ? ` Key visual elements: ${keywords.join(", ")}.`
    : "";

  const imagePrompt = [
    compositionHint,
    "RAW photo, shot on Sony A7IV with 35mm lens, natural ambient lighting.",
    visualDescription || rawPrompt,
    keywordClause,
    "Real-world environment, documentary photography style, authentic textures, natural film grain, shallow depth of field, unedited look.",
    "No text, no letters, no words, no signs with writing, no readable signage, no neon text, no labels, no UI elements, no screens with text. Avoid any scene that would naturally contain prominent text or lettering.",
    "No people visible, no faces, no talking heads, no text overlays, no watermarks, no written words, no typography, no signage with letters.",
    "NOT AI-generated, NOT 3D render, NOT illustration, NOT plastic, NOT glossy, NOT over-processed, NOT hyper-realistic, NOT containing any text or letters.",
  ]
    .filter(Boolean)
    .join(" ");

  // ── Video prompt: camera movement & animation ──
  const cameraDirection =
    motionPhrases.length > 0
      ? motionPhrases.join(", ")
      : defaultMotion;

  const videoPrompt = [
    `Smooth ${cameraDirection}.`,
    "Gentle natural ambient motion, real camera movement, subtle handheld micro-shake, natural motion blur.",
    "Documentary style, professional, seamless loop.",
    "No sudden movements, no cuts, no flicker.",
  ].join(" ");

  // ── Last frame prompt for FLF models ──
  const lastFrameImagePrompt = [
    compositionHint,
    "RAW photo, shot on Sony A7IV with 35mm lens, natural ambient lighting.",
    `End of scene: ${visualDescription || rawPrompt}. Subtle shift in lighting, slightly different angle, settled composition.`,
    keywordClause,
    "Real-world environment, documentary photography style, authentic textures, natural film grain, shallow depth of field, unedited look.",
    "No text, no letters, no words, no signs with writing, no readable signage, no neon text, no labels, no UI elements, no screens with text.",
    "No people visible, no faces, no talking heads, no text overlays, no watermarks.",
    "NOT AI-generated, NOT 3D render, NOT illustration, NOT plastic, NOT glossy, NOT over-processed.",
  ]
    .filter(Boolean)
    .join(" ");

  return { imagePrompt, videoPrompt, lastFrameImagePrompt };
}

async function pollUntilDone(
  requestId: string,
  authHeader: string,
  sendEvent: (event: string, data: unknown) => void,
  phaseLabel: string,
  percentStart: number,
  percentEnd: number,
): Promise<any> {
  const startTime = Date.now();

  while (true) {
    const elapsed = Date.now() - startTime;
    if (elapsed > MAX_POLL_TIME_MS) {
      throw new Error(`Timeout: ${phaseLabel} excedeu 5 minutos.`);
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const percent = Math.min(
      percentStart + Math.floor((elapsed / MAX_POLL_TIME_MS) * (percentEnd - percentStart)),
      percentEnd - 1,
    );
    sendEvent("progress", { phase: phaseLabel, message: `${phaseLabel}... (${Math.floor(elapsed / 1000)}s)`, percent });

    const statusRes = await fetch(`${BASE_URL}/requests/${requestId}/status`, {
      headers: { Authorization: authHeader },
    });

    if (!statusRes.ok) {
      const errText = await statusRes.text();
      console.error(`Poll error (${phaseLabel}):`, statusRes.status, errText);
      if (statusRes.status >= 500) continue; // retry on transient
      throw new Error(`Erro ao verificar status (${phaseLabel}): ${statusRes.status}`);
    }

    const statusData = await statusRes.json();
    const status = statusData.status;

    if (status === "completed") {
      return statusData;
    } else if (status === "failed") {
      throw new Error(`${phaseLabel} falhou: ${statusData.error || "Erro desconhecido"}`);
    } else if (status === "nsfw") {
      throw new Error(`Conteúdo bloqueado por filtro NSFW na fase ${phaseLabel}.`);
    }
    // queued, in_progress → continue polling
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Load Higgsfield credentials from app_settings
    const { data: keyData } = await sb.from("app_settings").select("value").eq("key", "HIGGSFIELD_API_KEY").maybeSingle();
    const { data: secretData } = await sb.from("app_settings").select("value").eq("key", "HIGGSFIELD_API_SECRET").maybeSingle();

    const apiKey = keyData?.value;
    const apiSecret = secretData?.value;

    if (!apiKey || !apiSecret) {
      return new Response(
        JSON.stringify({ error: "Credenciais Higgsfield não configuradas. Use o botão ⚙ no topo para adicionar sua API Key e Secret." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const authHeader = `Key ${apiKey}:${apiSecret}`;

    const { prompt, duration = 5, keywords = [], model = "dop-standard", imageModel = "soul-standard", aspectRatio = "9:16", lastFramePrompt }: GenerateRequest = await req.json();

    if (!prompt) {
      return new Response(JSON.stringify({ error: "prompt is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { imagePrompt, videoPrompt, lastFrameImagePrompt } = buildSpecializedPrompts(prompt, keywords, aspectRatio);
    const isFLF = model.includes("flf");
    console.log("Image prompt:", imagePrompt.slice(0, 300));
    console.log("Video prompt:", videoPrompt.slice(0, 300));
    if (isFLF) console.log("Last frame prompt:", lastFrameImagePrompt.slice(0, 300));
    const videoModelId = VIDEO_MODEL_MAP[model] || VIDEO_MODEL_MAP["dop-standard"];
    const imageModelId = IMAGE_MODEL_MAP[imageModel] || IMAGE_MODEL_MAP["soul-standard"];

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;
        const safeClose = () => {
          if (!closed) { closed = true; controller.close(); }
        };
        const sendEvent = (event: string, data: unknown) => {
          if (!closed) {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          }
        };

        try {
          // ─── Step 1: Text → First Image ───
          const imgPhaseEnd = isFLF ? 25 : 45;
          sendEvent("progress", { phase: "image", message: "Gerando imagem de referência (frame inicial)...", percent: 5 });

          const imgRes = await fetch(`${BASE_URL}/${imageModelId}`, {
            method: "POST",
            headers: {
              Authorization: authHeader,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              prompt: imagePrompt,
              aspect_ratio: aspectRatio,
              resolution: "1600p",
            }),
          });

          if (!imgRes.ok) {
            const errText = await imgRes.text();
            console.error("Higgsfield image API error:", imgRes.status, errText);
            sendEvent("error", { message: `Erro na API Higgsfield (imagem): ${imgRes.status} - ${errText.slice(0, 200)}` });
            safeClose();
            return;
          }

          const imgResult = await imgRes.json();
          const imgRequestId = imgResult.request_id;

          if (!imgRequestId) {
            console.error("No request_id from image API:", JSON.stringify(imgResult).slice(0, 500));
            sendEvent("error", { message: "Higgsfield não retornou um request_id para a imagem." });
            safeClose();
            return;
          }

          sendEvent("progress", { phase: "image", message: "Aguardando geração da imagem...", percent: 10 });

          const imgStatus = await pollUntilDone(imgRequestId, authHeader, sendEvent, "Gerando imagem 1", 10, imgPhaseEnd);

          const imageUrl = imgStatus?.images?.[0]?.url;
          if (!imageUrl) {
            console.error("No image URL in result:", JSON.stringify(imgStatus).slice(0, 500));
            sendEvent("error", { message: "Higgsfield não retornou URL da imagem gerada." });
            safeClose();
            return;
          }

          // ─── Step 2 (FLF only): Generate Last Frame Image ───
          let lastImageUrl: string | undefined;
          if (isFLF) {
            sendEvent("progress", { phase: "image2", message: "Gerando imagem do último frame...", percent: 25 });

            const lastFramePromptText = lastFramePrompt || lastFrameImagePrompt;
            const img2Res = await fetch(`${BASE_URL}/${imageModelId}`, {
              method: "POST",
              headers: {
                Authorization: authHeader,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                prompt: lastFramePromptText,
                aspect_ratio: aspectRatio,
                resolution: "1600p",
              }),
            });

            if (!img2Res.ok) {
              const errText = await img2Res.text();
              console.error("Higgsfield last frame image API error:", img2Res.status, errText);
              sendEvent("error", { message: `Erro na API Higgsfield (último frame): ${img2Res.status} - ${errText.slice(0, 200)}` });
              safeClose();
              return;
            }

            const img2Result = await img2Res.json();
            const img2RequestId = img2Result.request_id;

            if (!img2RequestId) {
              sendEvent("error", { message: "Higgsfield não retornou request_id para o último frame." });
              safeClose();
              return;
            }

            const img2Status = await pollUntilDone(img2RequestId, authHeader, sendEvent, "Gerando imagem 2", 28, 45);
            lastImageUrl = img2Status?.images?.[0]?.url;

            if (!lastImageUrl) {
              sendEvent("error", { message: "Higgsfield não retornou URL do último frame." });
              safeClose();
              return;
            }
          }

          sendEvent("progress", { phase: "video", message: isFLF ? "Frames prontos! Gerando vídeo FLF..." : "Imagem gerada! Iniciando vídeo...", percent: 45 });

          // ─── Video Generation ───
          const videoBody: Record<string, unknown> = {
            prompt: videoPrompt,
            duration: duration <= 7 ? 5 : 10,
          };

          if (isFLF) {
            videoBody.first_image_url = imageUrl;
            videoBody.last_image_url = lastImageUrl;
          } else {
            videoBody.image_url = imageUrl;
          }

          const vidRes = await fetch(`${BASE_URL}/${videoModelId}`, {
            method: "POST",
            headers: {
              Authorization: authHeader,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(videoBody),
          });

          if (!vidRes.ok) {
            const errText = await vidRes.text();
            console.error("Higgsfield video API error:", vidRes.status, errText);
            sendEvent("error", { message: `Erro na API Higgsfield (vídeo): ${vidRes.status} - ${errText.slice(0, 200)}` });
            safeClose();
            return;
          }

          const vidResult = await vidRes.json();
          const vidRequestId = vidResult.request_id;

          if (!vidRequestId) {
            console.error("No request_id from video API:", JSON.stringify(vidResult).slice(0, 500));
            sendEvent("error", { message: "Higgsfield não retornou um request_id para o vídeo." });
            safeClose();
            return;
          }

          sendEvent("progress", { phase: "video", message: "Aguardando geração do vídeo...", percent: 50 });

          // Poll video generation
          const vidStatus = await pollUntilDone(vidRequestId, authHeader, sendEvent, "Gerando vídeo", 50, 90);

          const videoUrl = vidStatus?.video?.url;
          if (!videoUrl) {
            console.error("No video URL in result:", JSON.stringify(vidStatus).slice(0, 500));
            sendEvent("error", { message: "Higgsfield não retornou URL do vídeo gerado." });
            safeClose();
            return;
          }

          // ─── Step 3: Download video and upload to Storage ───
          sendEvent("progress", { phase: "downloading", message: "Baixando e salvando vídeo...", percent: 90 });

          const videoResponse = await fetch(videoUrl);
          if (!videoResponse.ok) {
            sendEvent("error", { message: "Falha ao baixar o vídeo gerado." });
            safeClose();
            return;
          }

          const videoBytes = new Uint8Array(await videoResponse.arrayBuffer());
          const storagePath = `broll/higgsfield/${crypto.randomUUID()}.mp4`;

          const { error: uploadError } = await sb.storage
            .from("videos")
            .upload(storagePath, videoBytes, { contentType: "video/mp4", upsert: false });

          if (uploadError) {
            console.error("Storage upload error:", uploadError);
            // Fallback: return remote URL directly
            sendEvent("complete", { videoUrl, duration, prompt: imagePrompt });
          } else {
            const { data: signedData } = await sb.storage
              .from("videos")
              .createSignedUrl(storagePath, 7200);

            const finalUrl = signedData?.signedUrl || videoUrl;
            sendEvent("complete", { videoUrl: finalUrl, storagePath, duration, prompt: imagePrompt });
          }

          sendEvent("progress", { phase: "done", message: "Vídeo gerado com sucesso!", percent: 100 });
          safeClose();
        } catch (err) {
          console.error("Higgsfield SSE stream error:", err);
          sendEvent("error", { message: err instanceof Error ? err.message : "Erro desconhecido na geração." });
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
    console.error("generate-broll-higgsfield error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
