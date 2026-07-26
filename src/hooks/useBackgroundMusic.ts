import { useRef, useEffect, useCallback, useState } from "react";
import type { TranscriptionResult } from "@/hooks/useTranscription";

interface BackgroundMusicOptions {
  volume: number; // 0-100
  autoDucking: boolean;
  duckingIntensity: number; // 0-100
  fadeIn: boolean;
  fadeOut: boolean;
  transcription: TranscriptionResult | null;
}

export function useBackgroundMusic(options: BackgroundMusicOptions) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [musicUrl, setMusicUrl] = useState<string | null>(null);
  const animFrameRef = useRef<number>(0);
  const mainMediaRef = useRef<HTMLMediaElement | null>(null);

  // Create or get audio element
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.crossOrigin = "anonymous";
      audioRef.current.loop = true;
    }
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  // Set music source
  const loadMusic = useCallback((url: string | null) => {
    setMusicUrl(url);
    if (audioRef.current) {
      if (url) {
        audioRef.current.src = url;
        audioRef.current.load();
      } else {
        audioRef.current.pause();
        audioRef.current.removeAttribute("src");
        setIsPlaying(false);
      }
    }
  }, []);

  // Set reference to main video/audio for time sync
  const setMainMedia = useCallback((el: HTMLMediaElement | null) => {
    mainMediaRef.current = el;
  }, []);

  // Volume + ducking logic
  useEffect(() => {
    if (!gainRef.current) return;
    const baseVolume = options.volume / 100;
    
    if (!options.autoDucking || !options.transcription || !mainMediaRef.current) {
      gainRef.current.gain.value = baseVolume;
      return;
    }

    // Auto-ducking: reduce volume during speech
    const checkDucking = () => {
      if (!mainMediaRef.current || !gainRef.current || !options.transcription) return;
      const t = mainMediaRef.current.currentTime;
      const isSpeech = options.transcription.segments.some(
        s => s.type === "speech" && t >= s.start && t < s.end
      );
      
      const duckFactor = 1 - (options.duckingIntensity / 100) * 0.8; // e.g., 70% intensity → duck to 0.44x
      const targetGain = isSpeech ? baseVolume * duckFactor : baseVolume;
      
      // Smooth transition
      gainRef.current.gain.value += (targetGain - gainRef.current.gain.value) * 0.1;
      animFrameRef.current = requestAnimationFrame(checkDucking);
    };

    animFrameRef.current = requestAnimationFrame(checkDucking);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [options.volume, options.autoDucking, options.duckingIntensity, options.transcription]);

  // Initialize Web Audio for music
  const ensureAudioContext = useCallback(() => {
    if (!audioRef.current || ctxRef.current) return;
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    if (ctx.state === 'suspended') ctx.resume();
    const source = ctx.createMediaElementSource(audioRef.current);
    sourceRef.current = source;
    const gain = ctx.createGain();
    gainRef.current = gain;
    gain.gain.value = options.volume / 100;
    source.connect(gain);
    gain.connect(ctx.destination);
  }, [options.volume]);

  const play = useCallback(() => {
    if (!audioRef.current || !musicUrl) return;
    ensureAudioContext();
    
    if (options.fadeIn && gainRef.current) {
      gainRef.current.gain.value = 0;
      gainRef.current.gain.linearRampToValueAtTime(options.volume / 100, (ctxRef.current?.currentTime ?? 0) + 1.5);
    }
    
    audioRef.current.play();
    setIsPlaying(true);
  }, [musicUrl, ensureAudioContext, options.fadeIn, options.volume]);

  const pause = useCallback(() => {
    if (!audioRef.current) return;
    
    if (options.fadeOut && gainRef.current && ctxRef.current) {
      gainRef.current.gain.linearRampToValueAtTime(0, ctxRef.current.currentTime + 0.5);
      setTimeout(() => {
        audioRef.current?.pause();
        setIsPlaying(false);
      }, 500);
    } else {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, [options.fadeOut]);

  const togglePlayPause = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, play, pause]);

  // Sync time with main media
  const syncTime = useCallback((time: number) => {
    if (audioRef.current && musicUrl) {
      audioRef.current.currentTime = time % (audioRef.current.duration || 1);
    }
  }, [musicUrl]);

  // Cleanup
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      if (ctxRef.current?.state !== "closed") {
        ctxRef.current?.close();
      }
    };
  }, []);

  return {
    isPlaying,
    loadMusic,
    play,
    pause,
    togglePlayPause,
    syncTime,
    setMainMedia,
    musicUrl,
  };
}
