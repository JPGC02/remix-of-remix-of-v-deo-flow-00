import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Segment, WordSegment } from "@/data/mockData";
import { generateWordSegments } from "@/data/mockData";
import { extractAudioFromVideo, MAX_WHISPER_DURATION } from "@/lib/audioExtractor";

const MAX_WHISPER_SIZE = 25 * 1024 * 1024; // 25MB - Whisper API limit
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB input video limit

// Only unambiguous hesitation sounds — never real words that could start sentences
const FILLER_WORDS = new Set([
  "hm", "hmm", "hmmm", "hum", "humm",
  "éh", "eh", "ehh",
  "ah", "ahh", "aah",
  "uh", "uhh", "uhm", "uhmm",
  "ãh", "ã", "ãhm",
  "ahn", "ehn", "uhn",
]);

// Normalize filler: collapse repeated chars ("tipooo" → "tipo") and lowercase
function isFillerWord(word: string): boolean {
  const clean = word.trim().toLowerCase().replace(/[.,!?;:'"()]/g, "");
  if (FILLER_WORDS.has(clean)) return true;
  // Collapse repeated trailing chars: "tipooo" → "tipo", "ahhh" → "ah"
  const collapsed = clean.replace(/(.)\1{2,}/g, "$1");
  if (FILLER_WORDS.has(collapsed)) return true;
  // Also try with 2 chars: "ehh" → "eh"
  const collapsed2 = clean.replace(/(.)\1+/g, "$1");
  if (FILLER_WORDS.has(collapsed2)) return true;
  return false;
}

const SILENCE_THRESHOLD = 0.5; // seconds — silences longer than this get auto-removed
const SILENCE_PADDING = 0.12; // seconds — padding on each side of silence to avoid clipping adjacent words

interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

interface WhisperResponse {
  text: string;
  segments?: WhisperSegment[];
  words?: WhisperWord[];
}

export interface TranscriptionResult {
  segments: Segment[];
  wordSegments: WordSegment[];
}

export type TranscriptionPhase =
  | "preparing"
  | "extracting"
  | "uploading"
  | "transcribing"
  | "processing"
  | "done"
  | "error";

export interface TranscriptionProgress {
  phase: TranscriptionPhase;
  phaseLabel: string;
  percent: number;
  chunkInfo?: string;
}

export function useTranscription() {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<TranscriptionResult | null>(null);
  const [progress, setProgress] = useState<TranscriptionProgress>({
    phase: "preparing",
    phaseLabel: "",
    percent: 0,
  });

  const updateProgress = (phase: TranscriptionPhase, phaseLabel: string, percent: number, chunkInfo?: string) => {
    setProgress({ phase, phaseLabel, percent, chunkInfo });
  };

  const transcribeWithWhisper = async (audioFile: File): Promise<WhisperResponse> => {
    const formData = new FormData();
    formData.append("file", audioFile, audioFile.name);
    formData.append("language", "pt");

    const { data, error: fnError } = await supabase.functions.invoke("transcribe", {
      body: formData,
    });

    if (fnError) throw new Error(fnError.message || "Transcription failed");
    return data as WhisperResponse;
  };

  const transcribe = async (file: File): Promise<TranscriptionResult | null> => {
    setIsTranscribing(true);
    setError(null);

    try {
      updateProgress("preparing", "Validando arquivo...", 0);

      if (file.size > MAX_FILE_SIZE) {
        throw new Error(
          `Arquivo muito grande (${Math.round(file.size / 1024 / 1024)}MB). O limite é ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB.`
        );
      }

      // Step 1: Extract audio from video (produces small 16kHz mono WAV)
      updateProgress("extracting", "Extraindo áudio do vídeo...", 0);
      console.log(`Extracting audio from ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)...`);

      let audioFile: File;
      try {
        audioFile = await extractAudioFromVideo(file, (pct) => {
          updateProgress("extracting", "Extraindo áudio do vídeo...", pct);
        });
      } catch (extractErr: any) {
        console.error("Audio extraction failed:", extractErr);
        throw new Error(
          "Falha ao extrair áudio do vídeo. Verifique se o formato é suportado (MP4, MOV, WebM)."
        );
      }

      console.log(`Audio extracted: ${(audioFile.size / 1024 / 1024).toFixed(1)}MB WAV`);

      // Check if WAV fits Whisper's 25MB limit
      if (audioFile.size > MAX_WHISPER_SIZE) {
        throw new Error(
          `O áudio extraído (${(audioFile.size / 1024 / 1024).toFixed(0)}MB) excede o limite do Whisper (25MB). ` +
          `O vídeo deve ter no máximo ~${MAX_WHISPER_DURATION / 60 | 0} minutos de duração.`
        );
      }

      // Step 2: Transcribe with Whisper (precise word-level timestamps)
      updateProgress("transcribing", "Transcrevendo com IA...", 0);
      const whisperData = await transcribeWithWhisper(audioFile);
      updateProgress("transcribing", "Transcrevendo com IA...", 100);

      console.log(
        `Whisper returned: ${whisperData.segments?.length || 0} segments, ${whisperData.words?.length || 0} words`
      );

      // Step 3: Process results
      updateProgress("processing", "Processando transcrição...", 30);

      const segments = convertToSegments(whisperData);

      let wordSegs: WordSegment[];
      if (whisperData.words && whisperData.words.length > 0) {
        wordSegs = convertWordsToWordSegments(whisperData.words, segments);

        // Check if any speech segments are missing word-level coverage
        const coveredParents = new Set(wordSegs.filter(w => w.type === "speech").map(w => w.parentId));
        const uncoveredSpeech = segments.filter(s => s.type === "speech" && !coveredParents.has(s.id));
        
        if (uncoveredSpeech.length > 0) {
          console.warn(
            `⚠️ ${uncoveredSpeech.length} speech segments without word timestamps — filling with interpolation:`,
            uncoveredSpeech.map(s => `${s.id}: "${s.text.substring(0, 30)}..."`)
          );
          const interpolated = generateWordSegments(uncoveredSpeech);
          wordSegs = [...wordSegs, ...interpolated].sort((a, b) => a.start - b.start);
        }

        const realTimestampCount = whisperData.words.length;
        const totalWordCount = wordSegs.filter(w => w.type === "speech").length;
        console.log(
          `✅ Timestamps: ${realTimestampCount}/${totalWordCount} words have REAL timestamps from AI ` +
          `(${((realTimestampCount / Math.max(totalWordCount, 1)) * 100).toFixed(0)}% precision)`
        );
      } else {
        console.warn("⚠️ No word-level timestamps from AI — using interpolation for ALL words");
        wordSegs = generateWordSegments(segments);
      }

      // Step 4: AI-powered bad-take detection
      updateProgress("processing", "Analisando erros com IA...", 60);
      try {
        const speechWords = wordSegs.filter(w => w.type === "speech");
        console.log(`🤖 Sending ${speechWords.length} speech words for AI bad-take analysis...`);
        
        const { data: aiResult, error: aiError } = await supabase.functions.invoke("analyze-bad-takes", {
          body: { words: speechWords.map(w => ({ id: w.id, start: w.start, end: w.end, text: w.text, parentId: w.parentId })) },
        });

        if (aiError) {
          console.warn("⚠️ AI bad-take analysis failed, continuing without:", aiError.message);
        } else if (aiResult?.removedWordIds?.length > 0) {
          const removedSet = new Set<string>(aiResult.removedWordIds);
          let count = 0;
          for (const ws of wordSegs) {
            if (removedSet.has(ws.id)) {
              ws.status = "removed";
              count++;
            }
          }
          console.log(`🤖 AI marked ${count} words as bad takes. Reasoning: ${aiResult.reasoning}`);
        } else {
          console.log("🤖 AI found no bad takes in this video.");
        }
      } catch (aiErr: any) {
        console.warn("⚠️ AI bad-take analysis error:", aiErr?.message || aiErr);
      }

      const result: TranscriptionResult = { segments, wordSegments: wordSegs };

      updateProgress("done", "Concluído!", 100);
      setTranscription(result);
      return result;
    } catch (err: any) {
      const msg = err?.message || "Erro na transcrição";
      setError(msg);
      updateProgress("error", msg, 0);
      console.error("Transcription error:", err);
      return null;
    } finally {
      setIsTranscribing(false);
    }
  };

  return { transcribe, isTranscribing, error, transcription, progress };
}

function convertToSegments(data: WhisperResponse): Segment[] {
  if (!data.segments || data.segments.length === 0) {
    return [
      {
        id: "s1",
        start: 0,
        end: 10,
        type: "speech",
        text: data.text,
        status: "kept",
      },
    ];
  }

  const result: Segment[] = [];
  let segIndex = 1;

  for (let i = 0; i < data.segments.length; i++) {
    const seg = data.segments[i];

    const prevEnd = i > 0 ? data.segments[i - 1].end : 0;
    const gap = seg.start - prevEnd;
    if (gap > 0.3) {
      // Add padding so silence boundaries don't clip adjacent words
      const silStart = prevEnd + SILENCE_PADDING;
      const silEnd = seg.start - SILENCE_PADDING;
      if (silEnd > silStart) {
        result.push({
          id: `s${segIndex++}`,
          start: silStart,
          end: silEnd,
          type: "silence",
          text: "",
          status: (silEnd - silStart) >= SILENCE_THRESHOLD ? "removed" : "kept",
        });
      }
    }

    const isFiller = isFillerWord(seg.text);

    result.push({
      id: `s${segIndex++}`,
      start: seg.start,
      end: seg.end,
      type: isFiller ? "filler" : "speech",
      text: seg.text.trim(),
      status: isFiller ? "removed" : "kept",
    });
  }

  // Debug: log raw Whisper segments so we can see how they were split
  console.log("🔍 [DEBUG] Raw Whisper segments → our segments mapping:");
  result.forEach((s, i) => {
    console.log(`  ${s.id} [${s.start.toFixed(2)}-${s.end.toFixed(2)}] ${s.type} ${s.status}: "${s.text.substring(0, 80)}"`);
  });

  // No heuristic bad-take detection — handled by AI in a separate step

  return result;
}

// Heuristic detection functions removed — bad-take analysis is now done by AI

function convertWordsToWordSegments(
  words: WhisperWord[],
  segments: Segment[]
): WordSegment[] {
  const result: WordSegment[] = [];

  // Add non-speech segments (silences, fillers)
  for (const seg of segments) {
    if (seg.type !== "speech") {
      result.push({
        id: seg.id,
        parentId: seg.id,
        start: seg.start,
        end: seg.end,
        text: seg.text,
        type: seg.type,
        status: seg.status,
      });
    }
  }

  // Add word-level segments with REAL timestamps from Whisper
  for (const word of words) {
    const isFiller = isFillerWord(word.word);

    const parent = segments.find(
      (s) => s.type === "speech" && word.start >= s.start - 0.5 && word.end <= s.end + 0.5
    );

    if (!parent) {
      // Still include the word even without a parent — use closest speech segment
      const closest = segments
        .filter(s => s.type === "speech")
        .reduce((best, s) => {
          const dist = Math.abs(s.start - word.start);
          return dist < Math.abs(best.start - word.start) ? s : best;
        });
      
      if (closest) {
        result.push({
          id: `${closest.id}-w${result.filter(r => r.parentId === closest.id).length}`,
          parentId: closest.id,
          start: word.start,
          end: word.end,
          text: word.word.trim(),
          type: isFiller ? "filler" : "speech",
          status: isFiller ? "removed" : closest.status || "kept",
        });
      }
      continue;
    }

    const parentId = parent.id;
    const wordIndex = result.filter(
      (r) => r.parentId === parentId && r.type === "speech"
    ).length;

    result.push({
      id: `${parentId}-w${wordIndex}`,
      parentId,
      start: word.start,
      end: word.end,
      text: word.word.trim(),
      type: isFiller ? "filler" : "speech",
      status: isFiller ? "removed" : parent.status || "kept",
    });
  }

  result.sort((a, b) => a.start - b.start);

  result.sort((a, b) => a.start - b.start);

  // Debug: log word segments for first 30 words
  console.log("🔍 [DEBUG] First 30 word segments:");
  result.slice(0, 30).forEach(ws => {
    console.log(`  ${ws.id} [${ws.start.toFixed(2)}-${ws.end.toFixed(2)}] ${ws.type} ${ws.status}: "${ws.text}"`);
  });

  return result;
}

// Intra-segment detection removed — bad-take analysis is now done by AI