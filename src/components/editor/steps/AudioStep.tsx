import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useResilientPlayer } from "@/hooks/useResilientPlayer";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Play, Pause, Upload, Search, Volume2, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { audioPresets, mockMusics, formatTime } from "@/data/mockData";
import type { MockMusic } from "@/data/mockData";
import { Timeline } from "@/components/editor/Timeline";
import { useAudioProcessing } from "@/hooks/useAudioProcessing";
import { SpectrumVisualizer } from "@/components/editor/SpectrumVisualizer";
import { useBackgroundMusic } from "@/hooks/useBackgroundMusic";
import { useLoudnessMeter } from "@/hooks/useLoudnessMeter";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import type { TranscriptionResult } from "@/hooks/useTranscription";
import type { WordSegment } from "@/data/mockData";

interface CustomMusicEntry {
  id: string;
  title: string;
  artist: string;
  duration: number;
  storagePath: string;
}

interface AudioStepProps {
  videoUrl?: string | null;
  transcription?: TranscriptionResult | null;
  projectId?: string;
  initialSettings?: Record<string, unknown>;
  onSettingsChange?: (settings: Record<string, unknown>) => void;
  onVideoError?: () => Promise<string | null>;
  isLoadingUrl?: boolean;
}

// Procedural waveform from transcription segments
function generateWaveformFromSegments(
  segments: Array<{ start: number; end: number; type: string; text?: string }>,
  duration: number,
  numBars: number
): number[] {
  const bars: number[] = [];
  for (let i = 0; i < numBars; i++) {
    const t = (i / numBars) * duration;
    const seg = segments.find(s => t >= s.start && t < s.end);
    if (!seg) {
      bars.push(0.03 + Math.sin(i * 0.7) * 0.02);
    } else if (seg.type === "silence") {
      bars.push(0.03 + Math.sin(i * 0.5) * 0.015);
    } else if (seg.type === "filler") {
      bars.push(0.15 + Math.abs(Math.sin(i * 1.2)) * 0.15);
    } else {
      const seed = (seg.text?.length || 5) + i;
      bars.push(Math.min(1, Math.max(0.12, 0.3 + Math.abs(Math.sin(seed * 0.8) * Math.cos(seed * 1.7 + 1)) * 0.5 + Math.sin(i * 3.1) * 0.08)));
    }
  }
  return bars;
}

// Fake waveform for when there's no transcription
function generateFakeWaveform(numBars: number): number[] {
  return Array.from({ length: numBars }, (_, i) =>
    0.2 + Math.sin(i * 0.3) * 0.15 + Math.cos(i * 0.8) * 0.1 + Math.random() * 0.1
  );
}

// Mini waveform component for music cards
function MiniWaveform({ isActive, isPlaying, progress }: { isActive: boolean; isPlaying: boolean; progress: number }) {
  return (
    <div className="flex items-center gap-px h-6 w-full">
      {Array.from({ length: 40 }).map((_, i) => {
        const barPos = i / 40;
        const isPast = barPos < progress && isPlaying;
        return (
          <div
            key={i}
            className={cn(
              "flex-1 rounded-full transition-all duration-150",
              isPast ? "bg-primary" : isActive ? "bg-primary/40" : "bg-muted-foreground/30"
            )}
            style={{
              height: `${20 + Math.sin(i * 0.5) * 40 + Math.cos(i * 0.8) * 20}%`,
            }}
          />
        );
      })}
    </div>
  );
}

export function AudioStep({ videoUrl, transcription, projectId, initialSettings, onSettingsChange, onVideoError }: AudioStepProps) {
  const { user } = useAuth();
  // Media element state (callback ref triggers re-render)
  const [mediaEl, setMediaEl] = useState<HTMLVideoElement | null>(null);
  const mediaElRef = useRef<HTMLVideoElement | null>(null);
  const setMediaElBoth = useCallback((el: HTMLVideoElement | null) => {
    mediaElRef.current = el;
    setMediaEl(el);
  }, []);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const { safePlay, recoverFromError, restoreAfterSourceChange } = useResilientPlayer(mediaElRef, {
    onVideoError,
    onPlayBlocked: (reason) => console.warn(`[AudioStep] Play blocked: ${reason}`),
  });
  const [duration, setDuration] = useState(124);
  const [zoom, setZoom] = useState(2);
  const [musicStartTime, setMusicStartTime] = useState((initialSettings?.musicStartTime as number) ?? 0);
  const [musicEndTime, setMusicEndTime] = useState((initialSettings?.musicEndTime as number) ?? duration);

  // Voice processing settings
  const [activePreset, setActivePreset] = useState((initialSettings?.activePreset as string) ?? "phone");
  const [noiseReduction, setNoiseReduction] = useState((initialSettings?.noiseReduction as boolean) ?? true);
  const [noiseLevel, setNoiseLevel] = useState((initialSettings?.noiseLevel as number[]) ?? [60]);
  const [deReverb, setDeReverb] = useState((initialSettings?.deReverb as boolean) ?? true);
  const [autoEQ, setAutoEQ] = useState((initialSettings?.autoEQ as boolean) ?? true);
  const [compression, setCompression] = useState((initialSettings?.compression as boolean) ?? false);
  const [normalize, setNormalize] = useState((initialSettings?.normalize as boolean) ?? true);
  const [deEsser, setDeEsser] = useState((initialSettings?.deEsser as boolean) ?? false);

  // Music settings
  const [selectedMusic, setSelectedMusic] = useState<string | null>((initialSettings?.selectedMusic as string) ?? null);
  const [musicVolume, setMusicVolume] = useState((initialSettings?.musicVolume as number[]) ?? [30]);
  const [autoDucking, setAutoDucking] = useState((initialSettings?.autoDucking as boolean) ?? true);
  const [duckingIntensity, setDuckingIntensity] = useState((initialSettings?.duckingIntensity as number[]) ?? [70]);
  const [fadeIn, setFadeIn] = useState((initialSettings?.fadeIn as boolean) ?? true);
  const [fadeOut, setFadeOut] = useState((initialSettings?.fadeOut as boolean) ?? true);
  const [musicSearch, setMusicSearch] = useState("");
  const [activeMoods, setActiveMoods] = useState<string[]>([]);
  const [activeGenres, setActiveGenres] = useState<string[]>([]);
  const [previewingMusic, setPreviewingMusic] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);
  const [previewAudioEl, setPreviewAudioEl] = useState<HTMLAudioElement | null>(null);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [previewTime, setPreviewTime] = useState(0);

  // Persist settings on change (skip first render to avoid mount-time loop)
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    onSettingsChange?.({
      selectedMusic, musicVolume, autoDucking, duckingIntensity, fadeIn, fadeOut,
      activePreset, noiseReduction, noiseLevel, deReverb, autoEQ, compression, normalize, deEsser,
      musicStartTime, musicEndTime,
    });
  }, [selectedMusic, musicVolume, autoDucking, duckingIntensity, fadeIn, fadeOut,
    activePreset, noiseReduction, noiseLevel, deReverb, autoEQ, compression, normalize, deEsser,
    musicStartTime, musicEndTime]);

  // Custom music upload
  const [customMusics, setCustomMusics] = useState<MockMusic[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load custom musics from project on mount
  useEffect(() => {
    if (!projectId) return;
    const loadCustomMusic = async () => {
      const { data } = await supabase
        .from("projects")
        .select("custom_music")
        .eq("id", projectId)
        .single();
      if (!data?.custom_music) return;
      const entries = data.custom_music as unknown as CustomMusicEntry[];
      if (!Array.isArray(entries) || entries.length === 0) return;

      const musics: MockMusic[] = [];
      for (const entry of entries) {
        const { data: urlData } = await supabase.storage
          .from("videos")
          .createSignedUrl(entry.storagePath, 3600);
        if (urlData?.signedUrl) {
          musics.push({
            id: entry.id,
            title: entry.title,
            artist: entry.artist,
            duration: entry.duration,
            mood: ["custom"],
            genre: "Custom",
            bpm: 0,
            previewUrl: urlData.signedUrl,
            downloadUrl: urlData.signedUrl,
          });
        }
      }
      setCustomMusics(musics);
    };
    loadCustomMusic();
  }, [projectId]);

  // Handle music file upload
  const handleMusicUpload = useCallback(async (file: File) => {
    if (!user || !projectId) {
      toast({ title: "Erro", description: "Faça login para fazer upload de músicas.", variant: "destructive" });
      return;
    }
    const maxSize = 20 * 1024 * 1024; // 20MB
    if (file.size > maxSize) {
      toast({ title: "Arquivo muito grande", description: "Máximo de 20MB.", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      // Get audio duration
      const audioDuration = await new Promise<number>((resolve, reject) => {
        const audio = new Audio();
        audio.addEventListener("loadedmetadata", () => resolve(audio.duration));
        audio.addEventListener("error", () => reject(new Error("Não foi possível ler o arquivo de áudio")));
        audio.src = URL.createObjectURL(file);
      });

      const fileId = crypto.randomUUID();
      const ext = file.name.split(".").pop() || "mp3";
      const storagePath = `music/${user.id}/${fileId}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("videos")
        .upload(storagePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = await supabase.storage
        .from("videos")
        .createSignedUrl(storagePath, 3600);

      if (!urlData?.signedUrl) throw new Error("Não foi possível gerar URL");

      const newEntry: CustomMusicEntry = {
        id: fileId,
        title: file.name.replace(/\.[^/.]+$/, ""),
        artist: "Meu Upload",
        duration: audioDuration,
        storagePath,
      };

      // Persist to project
      const { data: projData } = await supabase
        .from("projects")
        .select("custom_music")
        .eq("id", projectId)
        .single();

      const existing = (projData?.custom_music as unknown as CustomMusicEntry[]) || [];
      await supabase
        .from("projects")
        .update({ custom_music: JSON.parse(JSON.stringify([...existing, newEntry])) })
        .eq("id", projectId);

      // Add to local state
      const newMusic: MockMusic = {
        id: fileId,
        title: newEntry.title,
        artist: newEntry.artist,
        duration: audioDuration,
        mood: ["custom"],
        genre: "Custom",
        bpm: 0,
        previewUrl: urlData.signedUrl,
        downloadUrl: urlData.signedUrl,
      };
      setCustomMusics(prev => [...prev, newMusic]);
      toast({ title: "Música adicionada!", description: newEntry.title });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao fazer upload";
      toast({ title: "Erro no upload", description: msg, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  }, [user, projectId]);

  // Audio processing hook
  const processingSettings = useMemo(() => ({
    noiseReduction,
    noiseLevel: noiseLevel[0],
    deReverb,
    autoEQ,
    compression,
    normalize,
    deEsser,
  }), [noiseReduction, noiseLevel, deReverb, autoEQ, compression, normalize, deEsser]);

  const { isProcessed, toggleAB, setMasterVolume, analyserOriginal, analyserProcessed, chainReady, fallbackMode, corsBlocked } = useAudioProcessing(
    mediaEl,
    processingSettings
  );

  // Voice volume control
  const [voiceVolume, setVoiceVolume] = useState([100]);
  useEffect(() => {
    setMasterVolume(voiceVolume[0] / 100);
  }, [voiceVolume, setMasterVolume]);

  const lufs = useLoudnessMeter(analyserProcessed, isPlaying);

  // Background music hook
  const bgMusic = useBackgroundMusic({
    volume: musicVolume[0],
    autoDucking,
    duckingIntensity: duckingIntensity[0],
    fadeIn,
    fadeOut,
    transcription: transcription ?? null,
  });

  const handleRemoveCustomMusic = useCallback(async (musicId: string) => {
    if (!projectId) return;
    const music = customMusics.find(m => m.id === musicId);
    if (!music) return;

    const { data: projData } = await supabase
      .from("projects")
      .select("custom_music")
      .eq("id", projectId)
      .single();
    const existing = (projData?.custom_music as unknown as CustomMusicEntry[]) || [];
    const updated = existing.filter(e => e.id !== musicId);
    await supabase
      .from("projects")
      .update({ custom_music: JSON.parse(JSON.stringify(updated)) })
      .eq("id", projectId);

    const entry = existing.find(e => e.id === musicId);
    if (entry) {
      await supabase.storage.from("videos").remove([entry.storagePath]);
    }

    setCustomMusics(prev => prev.filter(m => m.id !== musicId));
    if (selectedMusic === musicId) {
      setSelectedMusic(null);
      bgMusic.loadMusic(null);
    }
    toast({ title: "Música removida" });
  }, [projectId, customMusics, selectedMusic, bgMusic]);

  // Set main media reference for ducking sync
  useEffect(() => {
    bgMusic.setMainMedia(mediaEl);
  }, [mediaEl]);

  // Apply presets
  const applyPreset = useCallback((presetId: string) => {
    setActivePreset(presetId);
    switch (presetId) {
      case "phone":
        setNoiseReduction(true); setNoiseLevel([80]);
        setDeReverb(true); setAutoEQ(true);
        setCompression(true); setNormalize(true); setDeEsser(false);
        break;
      case "noisy":
        setNoiseReduction(true); setNoiseLevel([90]);
        setDeReverb(true); setAutoEQ(false);
        setCompression(false); setNormalize(true); setDeEsser(false);
        break;
      case "pro-mic":
        setNoiseReduction(true); setNoiseLevel([30]);
        setDeReverb(false); setAutoEQ(true);
        setCompression(false); setNormalize(true); setDeEsser(true);
        break;
      case "podcast":
        setNoiseReduction(true); setNoiseLevel([50]);
        setDeReverb(false); setAutoEQ(true);
        setCompression(true); setNormalize(true); setDeEsser(true);
        break;
    }
  }, []);

  // Media events
  const handleLoadedMetadata = useCallback(() => {
    if (mediaEl) {
      setDuration(mediaEl.duration);
    }
    restoreAfterSourceChange();
  }, [mediaEl, restoreAfterSourceChange]);

  const seekingRef = useRef(false);

  const handleTimeUpdate = useCallback(() => {
    if (seekingRef.current) return;
    if (mediaEl) {
      setCurrentTime(mediaEl.currentTime);
    }
  }, [mediaEl]);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    bgMusic.pause();
  }, [bgMusic]);

  // Simulated playback when no video
  useEffect(() => {
    if (videoUrl) return;
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentTime(t => {
        if (t >= duration) { setIsPlaying(false); return 0; }
        return t + 0.1;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [isPlaying, videoUrl, duration]);

  const handlePlayPause = useCallback(() => {
    if (videoUrl && mediaEl) {
      if (mediaEl.paused) {
        safePlay().then(ok => {
          if (ok) {
            setIsPlaying(true);
            if (bgMusic.musicUrl) bgMusic.play();
          } else {
            setIsPlaying(false);
          }
        });
      } else {
        mediaEl.pause();
        setIsPlaying(false);
        bgMusic.pause();
      }
    } else {
      setIsPlaying(p => {
        const next = !p;
        if (next && bgMusic.musicUrl) bgMusic.play();
        else bgMusic.pause();
        return next;
      });
    }
  }, [videoUrl, mediaEl, bgMusic]);

  const handleTimeChange = useCallback((t: number) => {
    setCurrentTime(t);
    seekingRef.current = true;
    if (mediaEl) {
      mediaEl.currentTime = t;
      const onSeeked = () => { seekingRef.current = false; mediaEl.removeEventListener("seeked", onSeeked); };
      mediaEl.addEventListener("seeked", onSeeked);
    } else {
      seekingRef.current = false;
    }
    bgMusic.syncTime(t);
  }, [bgMusic, mediaEl]);

  // Waveform data
  const waveformBars = useMemo(() => {
    const numBars = 80;
    if (transcription?.segments) {
      return generateWaveformFromSegments(transcription.segments, duration, numBars);
    }
    return generateFakeWaveform(numBars);
  }, [transcription, duration]);

  // "Processed" waveform: slightly tighter dynamic range
  const processedBars = useMemo(() => {
    return waveformBars.map(v => {
      const compressed = 0.15 + (v - 0.15) * 0.7;
      return Math.max(0.05, Math.min(0.85, compressed));
    });
  }, [waveformBars]);

  const allMusics = useMemo(() => [...mockMusics, ...customMusics], [customMusics]);

  // Restore selected music on remount (when coming back from another step)
  useEffect(() => {
    if (selectedMusic && !bgMusic.musicUrl) {
      const music = allMusics.find(m => m.id === selectedMusic);
      if (music) {
        const proxyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy-audio?url=${encodeURIComponent(music.downloadUrl)}`;
        bgMusic.loadMusic(proxyUrl);
      }
    }
  }, [selectedMusic, allMusics]);

  const availableMoods = useMemo(() => [...new Set(allMusics.flatMap(m => m.mood))], [allMusics]);
  const availableGenres = useMemo(() => [...new Set(allMusics.map(m => m.genre))], [allMusics]);

  const toggleMood = (mood: string) => setActiveMoods(prev => prev.includes(mood) ? prev.filter(m => m !== mood) : [...prev, mood]);
  const toggleGenre = (genre: string) => setActiveGenres(prev => prev.includes(genre) ? prev.filter(g => g !== genre) : [...prev, genre]);
  const clearFilters = () => { setActiveMoods([]); setActiveGenres([]); };
  const hasActiveFilters = activeMoods.length > 0 || activeGenres.length > 0;

  const filteredMusics = allMusics.filter((m) => {
    if (musicSearch) {
      const q = musicSearch.toLowerCase();
      const matchesSearch = m.title.toLowerCase().includes(q) || m.artist.toLowerCase().includes(q) || m.mood.some((mood) => mood.toLowerCase().includes(q)) || m.genre.toLowerCase().includes(q);
      if (!matchesSearch) return false;
    }
    if (activeMoods.length > 0 && !m.mood.some(mood => activeMoods.includes(mood))) return false;
    if (activeGenres.length > 0 && !activeGenres.includes(m.genre)) return false;
    return true;
  });

  // Preview audio management
   useEffect(() => {
    if (!previewAudioEl) {
      const el = new Audio();
      el.volume = 0.5;
      // No crossOrigin for simple preview playback (avoids CORS blocks from Pixabay CDN)
      el.addEventListener('timeupdate', () => {
        if (el.duration) {
          setPreviewProgress((el.currentTime / el.duration) * 100);
          setPreviewTime(el.currentTime);
        }
      });
      el.addEventListener('ended', () => {
        setPreviewingMusic(null);
        setPreviewProgress(0);
        setPreviewTime(0);
      });
      setPreviewAudioEl(el);
    }
    return () => {
      previewAudioEl?.pause();
    };
  }, []);

  const handlePreviewToggle = useCallback((musicId: string, previewUrl: string) => {
    if (!previewAudioEl) return;
    if (previewingMusic === musicId) {
      previewAudioEl.pause();
      setPreviewingMusic(null);
      setPreviewProgress(0);
      setPreviewTime(0);
    } else {
      const proxyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy-audio?url=${encodeURIComponent(previewUrl)}`;
      previewAudioEl.src = proxyUrl;
      previewAudioEl.currentTime = 0;
      previewAudioEl.load();
      setPreviewLoading(musicId);
      setPreviewingMusic(musicId);
      setPreviewProgress(0);
      setPreviewTime(0);

      const onCanPlay = () => {
        previewAudioEl.removeEventListener("loadeddata", onCanPlay);
        previewAudioEl.removeEventListener("error", onError);
        setPreviewLoading(null);
        previewAudioEl.play().catch(err => {
          console.warn("Preview play failed:", err);
          setPreviewingMusic(null);
        });
      };
      const onError = () => {
        previewAudioEl.removeEventListener("loadeddata", onCanPlay);
        previewAudioEl.removeEventListener("error", onError);
        setPreviewLoading(null);
        console.warn("Preview load failed");
        setPreviewingMusic(null);
        setPreviewProgress(0);
        setPreviewTime(0);
      };
      previewAudioEl.addEventListener("loadeddata", onCanPlay);
      previewAudioEl.addEventListener("error", onError);
    }
  }, [previewAudioEl, previewingMusic]);

  const handleSelectMusic = useCallback((music: typeof mockMusics[0]) => {
    setSelectedMusic(music.id);
    // Stop preview if playing
    if (previewAudioEl) {
      previewAudioEl.pause();
      setPreviewingMusic(null);
      setPreviewProgress(0);
    }
    // Load into background music hook
    const proxyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy-audio?url=${encodeURIComponent(music.downloadUrl)}`;
    bgMusic.loadMusic(proxyUrl);
  }, [previewAudioEl, bgMusic]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Video element moved to center panel */}

      <div className="flex-1 flex min-h-0">
        {/* Left — Controls */}
        <div className="w-72 border-r border-border bg-card flex-shrink-0 flex flex-col min-h-0">
          <Tabs defaultValue="voice" className="flex flex-col h-full">
            <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent h-auto p-0 gap-0">
              <TabsTrigger value="voice" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2 text-xs gap-1.5">
                🎙️ Voz
              </TabsTrigger>
              <TabsTrigger value="music" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2 text-xs gap-1.5">
                🎵 Música
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1">
              <TabsContent value="voice" className="mt-0">
                <div className="space-y-4 p-3">
                  {/* Presets */}
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Presets Rápidos</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {audioPresets.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => applyPreset(p.id)}
                          className={cn(
                            "flex flex-col items-center p-2 rounded-lg border transition-all text-center",
                            activePreset === p.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                          )}
                        >
                          <span className="text-lg">{p.icon}</span>
                          <span className="text-[10px] font-medium mt-0.5">{p.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Individual controls */}
                  <div className="space-y-3">
                    <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Controles</label>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs">Redução de Ruído</label>
                        <Switch checked={noiseReduction} onCheckedChange={setNoiseReduction} />
                      </div>
                      {noiseReduction && (
                        <div className="pl-2">
                          <Slider value={noiseLevel} onValueChange={setNoiseLevel} max={100} step={1} />
                          <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
                            <span>Sutil</span><span>Agressivo</span>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs">Remover Eco/Reverb</label>
                      <Switch checked={deReverb} onCheckedChange={setDeReverb} />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs">EQ Automático</label>
                      <Switch checked={autoEQ} onCheckedChange={setAutoEQ} />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs">Compressão</label>
                      <Switch checked={compression} onCheckedChange={setCompression} />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs">Normalizar (-14 LUFS)</label>
                      <Switch checked={normalize} onCheckedChange={setNormalize} />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs">De-Esser</label>
                      <Switch checked={deEsser} onCheckedChange={setDeEsser} />
                    </div>
                  </div>

                  <Button
                    variant={isProcessed ? "default" : "outline"}
                    size="sm"
                    className="w-full text-xs"
                    onClick={toggleAB}
                  >
                    {isProcessed ? "🔊 Ouvindo: Processado" : "🔇 Ouvindo: Original"} — Preview A/B
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="music" className="mt-0">
                <div className="space-y-4 p-3">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por mood, gênero, nome..."
                      value={musicSearch}
                      onChange={(e) => setMusicSearch(e.target.value)}
                      className="h-8 pl-8 text-xs bg-surface-raised border-border"
                    />
                  </div>

                  {/* Mood & Genre Filters */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Mood</span>
                      {hasActiveFilters && (
                        <button onClick={clearFilters} className="text-[10px] text-primary hover:underline">Limpar filtros</button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {availableMoods.map(mood => (
                        <Badge
                          key={mood}
                          variant={activeMoods.includes(mood) ? "default" : "outline"}
                          className="text-[10px] px-2 py-0.5 cursor-pointer select-none transition-colors"
                          onClick={() => toggleMood(mood)}
                        >
                          {mood}
                        </Badge>
                      ))}
                    </div>
                    <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block mt-1">Gênero</span>
                    <div className="flex flex-wrap gap-1">
                      {availableGenres.map(genre => (
                        <Badge
                          key={genre}
                          variant={activeGenres.includes(genre) ? "default" : "outline"}
                          className="text-[10px] px-2 py-0.5 cursor-pointer select-none transition-colors"
                          onClick={() => toggleGenre(genre)}
                        >
                          {genre}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Music cards */}
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Músicas Sugeridas</label>
                    {filteredMusics.map((m) => (
                      <div
                        key={m.id}
                        onClick={() => handleSelectMusic(m)}
                        className={cn(
                          "w-full text-left rounded-lg border transition-all overflow-hidden cursor-pointer",
                          selectedMusic === m.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                        )}
                      >
                        <div className="p-2.5 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium">{m.title}</span>
                            <span className="text-[10px] text-muted-foreground font-mono">{formatTime(m.duration)}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground block">{m.artist}</span>

                          <div className="h-6 w-full">
                            <MiniWaveform
                              isActive={selectedMusic === m.id}
                              isPlaying={previewingMusic === m.id}
                              progress={previewingMusic === m.id ? previewProgress : 0}
                            />
                          </div>

                          <div className="flex flex-wrap gap-1">
                            {m.mood.map((mood) => (
                              <Badge key={mood} variant={activeMoods.includes(mood) ? "default" : "secondary"} className="text-[8px] px-1.5 py-0 cursor-pointer" onClick={(e) => { e.stopPropagation(); toggleMood(mood); }}>{mood}</Badge>
                            ))}
                            <Badge variant={activeGenres.includes(m.genre) ? "default" : "outline"} className="text-[8px] px-1.5 py-0 cursor-pointer" onClick={(e) => { e.stopPropagation(); toggleGenre(m.genre); }}>{m.genre}</Badge>
                            {m.bpm > 0 && <Badge variant="outline" className="text-[8px] px-1.5 py-0">{m.bpm} BPM</Badge>}
                          </div>

                          <div className="flex items-center gap-2 pt-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePreviewToggle(m.id, m.previewUrl);
                              }}
                              className="w-6 h-6 rounded-full bg-primary/10 hover:bg-primary/20 flex items-center justify-center transition-colors"
                            >
                              {previewLoading === m.id ? (
                                <Loader2 className="w-3 h-3 text-primary animate-spin" />
                              ) : previewingMusic === m.id ? (
                                <Pause className="w-3 h-3 text-primary" />
                              ) : (
                                <Play className="w-3 h-3 text-primary ml-0.5" />
                              )}
                            </button>
                            <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary/50 rounded-full transition-all"
                                style={{ width: `${previewingMusic === m.id ? previewProgress * 100 : 0}%` }}
                              />
                            </div>
                            <span className="text-[9px] font-mono text-muted-foreground">
                              {previewingMusic === m.id ? formatTime(previewTime) : "0:00"}
                            </span>
                            {m.genre === "Custom" && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveCustomMusic(m.id);
                                }}
                                className="w-5 h-5 rounded-full hover:bg-destructive/20 flex items-center justify-center transition-colors"
                                title="Remover música"
                              >
                                <X className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}

                    {filteredMusics.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">Nenhuma música encontrada</p>
                    )}
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/mpeg,audio/wav,audio/mp3,.mp3,.wav"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleMusicUpload(file);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-1.5 text-xs"
                    disabled={isUploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {isUploading ? (
                      <><Loader2 className="w-3 h-3 animate-spin" /> Enviando...</>
                    ) : (
                      <><Upload className="w-3 h-3" /> Upload Próprio</>
                    )}
                  </Button>

                  {/* Music settings */}
                  {selectedMusic && (
                    <div className="space-y-3 border-t border-border pt-3">
                      <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Configurações</label>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Volume2 className="w-3 h-3" /> Volume
                          </label>
                          <span className="text-[10px] font-mono text-muted-foreground">{musicVolume[0]}%</span>
                        </div>
                        <Slider value={musicVolume} onValueChange={setMusicVolume} max={100} step={1} />
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs">Auto-Ducking</label>
                          <Switch checked={autoDucking} onCheckedChange={setAutoDucking} />
                        </div>
                        {autoDucking && (
                          <div className="pl-2 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-muted-foreground">Intensidade</span>
                              <span className="text-[10px] font-mono text-muted-foreground">{duckingIntensity[0]}%</span>
                            </div>
                            <Slider value={duckingIntensity} onValueChange={setDuckingIntensity} max={100} step={1} />
                            <div className="flex justify-between text-[9px] text-muted-foreground">
                              <span>Sutil</span><span>Forte</span>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <label className="text-xs">Fade In</label>
                        <Switch checked={fadeIn} onCheckedChange={setFadeIn} />
                      </div>
                      <div className="flex items-center justify-between">
                        <label className="text-xs">Fade Out</label>
                        <Switch checked={fadeOut} onCheckedChange={setFadeOut} />
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </div>

        {/* Center — Waveform/Preview */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <div className="flex-1 flex items-center justify-center p-4 min-h-0">
            <div className="w-full max-w-2xl space-y-3">
              {/* Video Preview */}
              <div className="w-full">
                {videoUrl ? (
                  <video
                    ref={setMediaElBoth}
                    src={videoUrl}
                    crossOrigin="anonymous"
                    playsInline
                    className="w-full max-h-[200px] aspect-video object-contain bg-black rounded-lg shadow-lg"
                    onLoadedMetadata={handleLoadedMetadata}
                    onTimeUpdate={handleTimeUpdate}
                    onEnded={handleEnded}
                    onError={() => { recoverFromError(); }}
                    preload="auto"
                  />
                ) : (
                  <div className="w-full max-h-[200px] aspect-video bg-muted rounded-lg flex items-center justify-center">
                    <span className="text-xs text-muted-foreground">Sem vídeo</span>
                  </div>
                )}
              </div>

              {/* Audio diagnostic */}
              {videoUrl && (
                <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                  {corsBlocked ? (
                    <span className="text-destructive">● CORS bloqueado — áudio inacessível</span>
                  ) : chainReady ? (
                    <span className="text-primary">● Áudio ativo</span>
                  ) : (
                    <span className="text-muted-foreground">○ Inicializando...</span>
                  )}
                  {fallbackMode && !corsBlocked && <span className="text-muted-foreground">⚠ Modo nativo</span>}
                  {isProcessed && chainReady && !fallbackMode && !corsBlocked && <span>🎛 Processado</span>}
                </div>
              )}

              {/* Spectrum Visualizer */}
              <SpectrumVisualizer
                analyserOriginal={analyserOriginal}
                analyserProcessed={analyserProcessed}
                isPlaying={isPlaying}
              />

              {/* Waveform */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Waveform do Áudio</span>
                  <span className={cn("text-xs font-mono", lufs !== null ? (lufs >= -16 && lufs <= -12 ? "text-green-400" : "text-yellow-400") : "text-muted-foreground")}>{lufs !== null ? `${lufs.toFixed(1)} LUFS` : "-- LUFS"}</span>
                </div>
                <div className="h-16 bg-surface-raised rounded-lg relative overflow-hidden">
                  {/* Original waveform (ghost) */}
                  <div className="absolute inset-0 flex items-center px-2">
                    {waveformBars.map((h, i) => (
                      <div
                        key={`ghost-${i}`}
                        className="flex-1 mx-px bg-[hsl(var(--segment-audio))]/15 rounded-full"
                        style={{ height: `${h * 100}%` }}
                      />
                    ))}
                  </div>
                  {/* Processed waveform */}
                  <div className="absolute inset-0 flex items-center px-2">
                    {processedBars.map((h, i) => (
                      <div
                        key={`proc-${i}`}
                        className="flex-1 mx-px bg-[hsl(var(--segment-audio))]/60 rounded-full"
                        style={{ height: `${h * 100}%` }}
                      />
                    ))}
                  </div>
                  {/* Playhead */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-primary z-10"
                    style={{ left: `${(currentTime / duration) * 100}%` }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-1 bg-[hsl(var(--segment-audio))]/15 rounded" />
                    <span className="text-[9px] text-muted-foreground">Original</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-1 bg-[hsl(var(--segment-audio))]/60 rounded" />
                    <span className="text-[9px] text-muted-foreground">Processado</span>
                  </div>
                </div>
              </div>

              {/* Playback controls */}
              <div className="flex items-center justify-center gap-4">
                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full bg-primary/10 hover:bg-primary/20" onClick={handlePlayPause}>
                  {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                </Button>
                <span className="text-xs font-mono text-muted-foreground">{formatTime(currentTime)} / {formatTime(duration)}</span>
                <div className="flex items-center gap-2 ml-4">
                  <Volume2 className="w-4 h-4 text-muted-foreground" />
                  <Slider
                    value={voiceVolume}
                    onValueChange={setVoiceVolume}
                    min={0}
                    max={150}
                    step={1}
                    className="w-24"
                  />
                  <span className="text-xs font-mono text-muted-foreground w-8">{voiceVolume[0]}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 px-3 pb-3">
        <Timeline
          currentTime={currentTime}
          onTimeChange={handleTimeChange}
          zoom={zoom}
          onZoomChange={setZoom}
          musicTrack={selectedMusic ? (() => { const m = allMusics.find(x => x.id === selectedMusic); return { title: m?.title ?? "Música", active: true, url: m?.previewUrl, startTime: musicStartTime, endTime: musicEndTime }; })() : undefined}
          onMusicRegionChange={(start, end) => { setMusicStartTime(start); setMusicEndTime(end); }}
        />
      </div>
    </div>
  );
}
