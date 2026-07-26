import { useRef, useEffect, useCallback, useState } from "react";

export interface AudioProcessingSettings {
  noiseReduction: boolean;
  noiseLevel: number;
  deReverb: boolean;
  autoEQ: boolean;
  compression: boolean;
  normalize: boolean;
  deEsser: boolean;
}

const DEFAULT_SETTINGS: AudioProcessingSettings = {
  noiseReduction: true,
  noiseLevel: 60,
  deReverb: true,
  autoEQ: true,
  compression: false,
  normalize: true,
  deEsser: false,
};

// Module-level cache: prevents "already connected to a different MediaElementSourceNode" errors
// WeakMap ensures entries are garbage-collected when the media element is removed from the DOM
const audioSourceCache = new WeakMap<
  HTMLMediaElement,
  { ctx: AudioContext; source: MediaElementAudioSourceNode }
>();

export function useAudioProcessing(mediaElement: HTMLMediaElement | null, settings: AudioProcessingSettings = DEFAULT_SETTINGS) {
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const chainNodesRef = useRef<AudioNode[]>([]);
  const bypassGainRef = useRef<GainNode | null>(null);
  const processedGainRef = useRef<GainNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const analyserOriginalRef = useRef<AnalyserNode | null>(null);
  const analyserProcessedRef = useRef<AnalyserNode | null>(null);
  const initializedRef = useRef(false);
  const [isProcessed, setIsProcessed] = useState(true);
  const [chainReady, setChainReady] = useState(false);
  const [fallbackMode, setFallbackMode] = useState(false);
  const [corsBlocked, setCorsBlocked] = useState(false);

  // Create persistent analysers and gain nodes once
  const ensureInfrastructure = useCallback((ctx: AudioContext) => {
    if (!analyserOriginalRef.current) {
      const a = ctx.createAnalyser();
      a.fftSize = 2048;
      a.smoothingTimeConstant = 0.8;
      analyserOriginalRef.current = a;
    }
    if (!analyserProcessedRef.current) {
      const a = ctx.createAnalyser();
      a.fftSize = 2048;
      a.smoothingTimeConstant = 0.8;
      analyserProcessedRef.current = a;
    }
    if (!bypassGainRef.current) {
      bypassGainRef.current = ctx.createGain();
    }
    if (!processedGainRef.current) {
      processedGainRef.current = ctx.createGain();
    }
    if (!masterGainRef.current) {
      masterGainRef.current = ctx.createGain();
    }
  }, []);

  const buildChain = useCallback(() => {
    if (!ctxRef.current || !sourceRef.current || ctxRef.current.state === "closed") {
      console.warn("[AudioProcessing] Cannot build chain: ctx or source missing");
      return;
    }
    const ctx = ctxRef.current;
    const source = sourceRef.current;

    try {
      // Disconnect old processing chain nodes only
      chainNodesRef.current.forEach(n => { try { n.disconnect(); } catch {} });
      chainNodesRef.current = [];
      try { source.disconnect(); } catch {}

      ensureInfrastructure(ctx);

      const bypassGain = bypassGainRef.current!;
      const processedGain = processedGainRef.current!;
      const analyserOrig = analyserOriginalRef.current!;
      const analyserProc = analyserProcessedRef.current!;
      const masterGain = masterGainRef.current!;

      // Disconnect infrastructure to rewire
      try { bypassGain.disconnect(); } catch {}
      try { processedGain.disconnect(); } catch {}
      try { masterGain.disconnect(); } catch {}
      try { analyserOrig.disconnect(); } catch {}
      try { analyserProc.disconnect(); } catch {}

      // Set A/B gains
      bypassGain.gain.value = isProcessed ? 0 : 1;
      processedGain.gain.value = isProcessed ? 1 : 0;

      // Master gain → destination
      masterGain.connect(ctx.destination);

      // Bypass path: source → analyserOrig → bypassGain → masterGain
      source.connect(analyserOrig);
      analyserOrig.connect(bypassGain);
      bypassGain.connect(masterGain);

      // Build processed chain
      const chain: AudioNode[] = [];

      if (settings.noiseReduction) {
        const highpass = ctx.createBiquadFilter();
        highpass.type = "highpass";
        highpass.frequency.value = 100 + (settings.noiseLevel / 100) * 200;
        highpass.Q.value = 0.7;
        chain.push(highpass);

        const lowpass = ctx.createBiquadFilter();
        lowpass.type = "lowpass";
        lowpass.frequency.value = 10000 - (settings.noiseLevel / 100) * 4000;
        lowpass.Q.value = 0.7;
        chain.push(lowpass);
      }

      if (settings.deReverb) {
        for (const freq of [300, 600, 900]) {
          const notch = ctx.createBiquadFilter();
          notch.type = "notch";
          notch.frequency.value = freq;
          notch.Q.value = 0.8;
          chain.push(notch);
        }
      }

      if (settings.autoEQ) {
        const cutMud = ctx.createBiquadFilter();
        cutMud.type = "peaking";
        cutMud.frequency.value = 300;
        cutMud.gain.value = -6;
        cutMud.Q.value = 1;
        chain.push(cutMud);

        const boostPresence = ctx.createBiquadFilter();
        boostPresence.type = "peaking";
        boostPresence.frequency.value = 3000;
        boostPresence.gain.value = 8;
        boostPresence.Q.value = 0.8;
        chain.push(boostPresence);

        const air = ctx.createBiquadFilter();
        air.type = "highshelf";
        air.frequency.value = 8000;
        air.gain.value = 4;
        chain.push(air);
      }

      if (settings.deEsser) {
        const deEsserBand = ctx.createBiquadFilter();
        deEsserBand.type = "peaking";
        deEsserBand.frequency.value = 6000;
        deEsserBand.gain.value = -10;
        deEsserBand.Q.value = 2;
        chain.push(deEsserBand);
      }

      if (settings.compression) {
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -18;
        compressor.knee.value = 10;
        compressor.ratio.value = 6;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;
        chain.push(compressor);
      }

      if (settings.normalize) {
        const gainNode = ctx.createGain();
        gainNode.gain.value = 2.0;
        chain.push(gainNode);
      }

      // Wire: source → [chain] → analyserProc → processedGain → masterGain
      let prev: AudioNode = source;
      for (const node of chain) {
        prev.connect(node);
        prev = node;
      }
      prev.connect(analyserProc);
      analyserProc.connect(processedGain);
      processedGain.connect(masterGain);

      chainNodesRef.current = chain;
      setChainReady(true);
      setFallbackMode(false);
      setCorsBlocked(false);
      console.log("[AudioProcessing] Chain built successfully with", chain.length, "nodes");

      // CORS probe: schedule a check after a short playback to detect zeroed output
      if (mediaElement) {
        const probeTimeout = setTimeout(() => {
          const analyser = analyserProcessedRef.current;
          if (!analyser || !mediaElement || mediaElement.paused) return;
          const buf = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(buf);
          const sum = buf.reduce((a, b) => a + b, 0);
          if (sum === 0) {
            console.warn("[AudioProcessing] CORS probe: analyser output is all zeroes — likely CORS blocked");
            setCorsBlocked(true);
          }
        }, 500);
        // Clean up probe on next rebuild
        return () => clearTimeout(probeTimeout);
      }
    } catch (e) {
      console.error("[AudioProcessing] Failed to build chain, activating fallback:", e);
      // FALLBACK: connect source directly to destination so audio still plays
      try {
        source.connect(ctx.destination);
        setFallbackMode(true);
        setChainReady(true);
      } catch (fallbackErr) {
        console.error("[AudioProcessing] Even fallback failed:", fallbackErr);
        setChainReady(false);
      }
    }
  }, [settings, ensureInfrastructure, isProcessed]);

  // Initialize AudioContext on first play — idempotent via WeakMap cache
  useEffect(() => {
    if (!mediaElement) return;

    const initAudio = () => {
      if (initializedRef.current) return;
      try {
        // Check cache first — reuse existing source if the element was captured before
        const cached = audioSourceCache.get(mediaElement);
        if (cached) {
          console.log("[AudioProcessing] Reusing cached AudioContext for element");
          ctxRef.current = cached.ctx;
          sourceRef.current = cached.source;
          // Resume in case it was suspended
          if (cached.ctx.state === "suspended") {
            cached.ctx.resume().catch(e => console.warn("[AudioProcessing] Failed to resume cached ctx:", e));
          }
        } else {
          console.log("[AudioProcessing] Creating new AudioContext");
          const ctx = new AudioContext();
          if (ctx.state === "suspended") {
            ctx.resume().catch(e => console.warn("[AudioProcessing] Failed to resume new ctx:", e));
          }
          const source = ctx.createMediaElementSource(mediaElement);
          ctxRef.current = ctx;
          sourceRef.current = source;
          // Cache for future remounts
          audioSourceCache.set(mediaElement, { ctx, source });
        }
        initializedRef.current = true;
        buildChain();
      } catch (e) {
        console.error("[AudioProcessing] AudioContext init failed:", e);
        // Mark initialized to prevent retries, audio plays natively as fallback
        initializedRef.current = true;
        setFallbackMode(true);
        setChainReady(false);
      }
    };

    // If already playing, init immediately
    if (!mediaElement.paused) {
      initAudio();
    }
    mediaElement.addEventListener("play", initAudio);
    return () => {
      mediaElement.removeEventListener("play", initAudio);
    };
  }, [mediaElement, buildChain]);

  // Persistent listener: resume AudioContext on every play (handles suspended state)
  useEffect(() => {
    if (!mediaElement) return;
    const resumeCtx = () => {
      const ctx = ctxRef.current;
      if (ctx && ctx.state === "suspended") {
        console.log("[AudioProcessing] Resuming suspended AudioContext on play");
        ctx.resume().catch(e => console.warn("[AudioProcessing] Resume failed:", e));
      }
    };
    mediaElement.addEventListener("play", resumeCtx);
    return () => mediaElement.removeEventListener("play", resumeCtx);
  }, [mediaElement]);

  // Rebuild chain when settings change
  useEffect(() => {
    if (initializedRef.current && ctxRef.current && sourceRef.current) {
      buildChain();
    }
  }, [buildChain]);

  // Sync A/B gain values without rebuilding
  useEffect(() => {
    if (bypassGainRef.current && processedGainRef.current) {
      bypassGainRef.current.gain.value = isProcessed ? 0 : 1;
      processedGainRef.current.gain.value = isProcessed ? 1 : 0;
    }
  }, [isProcessed]);

  const toggleAB = useCallback(() => {
    setIsProcessed(prev => !prev);
  }, []);

  const setMasterVolume = useCallback((value: number) => {
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = value;
    }
  }, []);

  // Cleanup: only disconnect chain nodes, do NOT close the AudioContext (cached in WeakMap)
  useEffect(() => {
    return () => {
      chainNodesRef.current.forEach(n => { try { n.disconnect(); } catch {} });
      chainNodesRef.current = [];
      // Reset infrastructure refs (nodes belong to the context, will be recreated)
      analyserOriginalRef.current = null;
      analyserProcessedRef.current = null;
      bypassGainRef.current = null;
      processedGainRef.current = null;
      masterGainRef.current = null;
      // Don't null out ctxRef/sourceRef — they live in the WeakMap cache
      ctxRef.current = null;
      sourceRef.current = null;
      initializedRef.current = false;
    };
  }, []);

  return {
    isProcessed,
    toggleAB,
    setMasterVolume,
    analyserOriginal: analyserOriginalRef.current,
    analyserProcessed: analyserProcessedRef.current,
    chainReady,
    fallbackMode,
    corsBlocked,
  };
}
