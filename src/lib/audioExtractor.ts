/**
 * Extract audio from a video file using OfflineAudioContext.
 * Memory-optimized: releases intermediate buffers aggressively.
 * Encodes as MP3 (64kbps mono) using lamejs for ~10x compression vs WAV.
 *
 * MP3 at 64kbps mono ≈ 0.48 MB/min → ~52 min fits in 25MB (Whisper limit).
 */

// @ts-ignore — no types for lamejs
import lamejs from "@breezystack/lamejs";

const MP3_SAMPLE_RATE = 44100;
const MP3_KBPS = 64;
const MAX_AUDIO_SIZE = 25 * 1024 * 1024;

// Chunk size for processing to avoid holding everything in memory at once
const RENDER_CHUNK_SECONDS = 60; // Process 60s at a time

export async function extractAudioFromVideo(
  file: File,
  onProgress?: (percent: number) => void
): Promise<File> {
  onProgress?.(5);

  // Step 1: Read file as ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();
  onProgress?.(10);

  const tempCtx = new AudioContext();
  let audioBuffer: AudioBuffer;
  try {
    // decodeAudioData consumes the buffer, so we pass a copy
    audioBuffer = await tempCtx.decodeAudioData(arrayBuffer.slice(0));
  } catch (err) {
    await tempCtx.close();
    throw new Error("Não foi possível decodificar o áudio do vídeo. Formato não suportado.");
  }
  await tempCtx.close();
  onProgress?.(20);

  const totalDuration = audioBuffer.duration;
  const totalChannels = audioBuffer.numberOfChannels;
  const srcRate = audioBuffer.sampleRate;

  console.log(
    `Decoded audio: ${totalDuration.toFixed(1)}s, ${totalChannels}ch, ${srcRate}Hz`
  );

  // Step 2: Resample to 44.1kHz mono + encode to MP3 in chunks
  // This avoids holding the full resampled buffer in memory
  const encoder = new lamejs.Mp3Encoder(1, MP3_SAMPLE_RATE, MP3_KBPS);
  const mp3Data: ArrayBuffer[] = [];
  const numChunks = Math.ceil(totalDuration / RENDER_CHUNK_SECONDS);

  for (let chunkIdx = 0; chunkIdx < numChunks; chunkIdx++) {
    const chunkStart = chunkIdx * RENDER_CHUNK_SECONDS;
    const chunkDur = Math.min(RENDER_CHUNK_SECONDS, totalDuration - chunkStart);
    const chunkSamples = Math.ceil(chunkDur * MP3_SAMPLE_RATE);

    // Resample this chunk
    const offlineCtx = new OfflineAudioContext(1, chunkSamples, MP3_SAMPLE_RATE);
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    // Start from the chunk offset
    source.start(0, chunkStart, chunkDur);

    const rendered = await offlineCtx.startRendering();
    const float32 = rendered.getChannelData(0);

    // Convert to Int16 and encode — process in sub-blocks to yield to GC
    const blockSize = 1152;
    for (let i = 0; i < float32.length; i += blockSize) {
      const end = Math.min(i + blockSize, float32.length);
      const int16 = new Int16Array(end - i);
      for (let j = 0; j < int16.length; j++) {
        const s = Math.max(-1, Math.min(1, float32[i + j]));
        int16[j] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      const mp3buf = encoder.encodeBuffer(int16);
      if (mp3buf.length > 0) {
        mp3Data.push(new Uint8Array(mp3buf).buffer);
      }
    }

    // Progress: 20% to 90% across chunks
    const progress = 20 + Math.round(((chunkIdx + 1) / numChunks) * 70);
    onProgress?.(progress);

    // Allow GC to reclaim this chunk's rendered buffer
    // (float32 and rendered go out of scope here)
  }

  // Release the original decoded audio buffer — no longer needed
  // @ts-ignore — help GC
  audioBuffer = null!;

  const mp3End = encoder.flush();
  if (mp3End.length > 0) {
    mp3Data.push(new Uint8Array(mp3End).buffer);
  }
  onProgress?.(92);

  const mp3Blob = new Blob(mp3Data, { type: "audio/mp3" });
  const audioFile = new File([mp3Blob], "audio.mp3", { type: "audio/mpeg" });

  console.log(
    `Audio extracted: ${(file.size / 1024 / 1024).toFixed(1)}MB video → ${(audioFile.size / 1024 / 1024).toFixed(2)}MB MP3 @ ${MP3_KBPS}kbps (${totalDuration.toFixed(1)}s)`
  );

  if (audioFile.size > MAX_AUDIO_SIZE) {
    throw new Error(
      `O áudio extraído (${(audioFile.size / 1024 / 1024).toFixed(1)}MB) excede o limite de 25MB da API. Tente um vídeo mais curto.`
    );
  }

  onProgress?.(100);
  return audioFile;
}

/** Max duration estimate in seconds: 25MB at 64kbps mono MP3 ≈ 52 min */
export const MAX_WHISPER_DURATION = Math.floor((MAX_AUDIO_SIZE * 8) / (MP3_KBPS * 1000));
