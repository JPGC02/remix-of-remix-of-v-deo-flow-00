import { useState, useMemo, useCallback } from "react";
import { VideoPreview } from "@/components/editor/VideoPreview";
import { SubtitleOverlay, type SubtitleStyle } from "@/components/editor/SubtitleOverlay";
import { Timeline } from "@/components/editor/Timeline";
import type { StepSettings } from "@/pages/Editor";
import type { TranscriptionResult } from "@/hooks/useTranscription";
import type { BRollSuggestion, WordSegment } from "@/data/mockData";
import { generateWordSegments } from "@/data/mockData";
import { Check, X, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

interface PreviewStepProps {
  videoUrl?: string | null;
  transcription?: TranscriptionResult | null;
  stepSettings: StepSettings;
  onVideoError?: () => Promise<string | null>;
  isLoadingUrl?: boolean;
}

const NEUTRAL = { brightness: 50, contrast: 50, saturation: 50, temperature: 50, sharpness: 50 };

function buildFilterStyle(settings: Record<string, unknown>): string {
  const brightness = (settings.brightness as number) ?? NEUTRAL.brightness;
  const contrast = (settings.contrast as number) ?? NEUTRAL.contrast;
  const saturation = (settings.saturation as number) ?? NEUTRAL.saturation;
  const temperature = (settings.temperature as number) ?? NEUTRAL.temperature;
  const intensity = (settings.intensity as number) ?? 100;

  const lerp = (val: number, neutral: number) => neutral + (val - neutral) * (intensity / 100);

  const b = lerp(brightness, NEUTRAL.brightness) / 50;
  const c = lerp(contrast, NEUTRAL.contrast) / 50;
  const s = lerp(saturation, NEUTRAL.saturation) / 50;

  const tempVal = lerp(temperature, NEUTRAL.temperature);
  const sepiaAmount = tempVal > 50 ? ((tempVal - 50) / 50) * 0.3 : 0;
  const hueShift = tempVal < 50 ? ((50 - tempVal) / 50) * -30 : ((tempVal - 50) / 50) * 15;

  const parts = [
    `brightness(${b.toFixed(2)})`,
    `contrast(${c.toFixed(2)})`,
    `saturate(${s.toFixed(2)})`,
  ];
  if (sepiaAmount > 0.01) parts.push(`sepia(${sepiaAmount.toFixed(2)})`);
  if (Math.abs(hueShift) > 0.5) parts.push(`hue-rotate(${hueShift.toFixed(1)}deg)`);

  return parts.join(" ");
}

interface CheckItem {
  label: string;
  detail: string;
  active: boolean;
}

export function PreviewStep({ videoUrl, transcription, stepSettings, onVideoError, isLoadingUrl }: PreviewStepProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(2);

  const duration = transcription?.segments?.[transcription.segments.length - 1]?.end ?? 0;

  const brollSuggestions = useMemo(() => {
    const broll = stepSettings.broll;
    if (!broll?.suggestions) return [];
    return (broll.suggestions as unknown as BRollSuggestion[]).filter(s => s.status === "accepted");
  }, [stepSettings.broll]);

  const wordSegments = useMemo(() => {
    if (!transcription?.segments) return [];
    return generateWordSegments(transcription.segments);
  }, [transcription]);

  const subtitleStyle = useMemo((): SubtitleStyle | null => {
    const sub = stepSettings.subtitles;
    if (!sub || sub.subtitlesEnabled === false) return null;
    return {
      preset: (sub.activePreset as string) ?? "hormozi",
      fontSize: ((sub.fontSize as number[]) ?? [24])[0],
      position: (sub.position as "top" | "center" | "bottom") ?? "bottom",
      maxWords: parseInt((sub.maxWords as string) ?? "2", 10),
      textCase: (sub.textCase as "upper" | "lower" | "normal") ?? "upper",
      textColor: (sub.textColor as string) ?? "#FFFFFF",
      highlightColor: (sub.highlightColor as string) ?? "#FFD700",
      font: (sub.font as string) ?? "montserrat",
      animation: (sub.animation as string) ?? "pop",
    };
  }, [stepSettings.subtitles]);

  const colorFilter = useMemo(() => {
    const color = stepSettings.color;
    if (!color) return undefined;
    return buildFilterStyle(color);
  }, [stepSettings.color]);

  const musicTrack = useMemo(() => {
    const audio = stepSettings.audio;
    if (!audio?.musicUrl) return undefined;
    return {
      title: (audio.musicTitle as string) ?? "Música",
      active: true,
      url: audio.musicUrl as string,
      startTime: (audio.musicStart as number) ?? 0,
      endTime: (audio.musicEnd as number) ?? duration,
    };
  }, [stepSettings.audio, duration]);

  const checklist = useMemo((): CheckItem[] => [
    { label: "B-Roll", detail: `${brollSuggestions.length} clip${brollSuggestions.length !== 1 ? "s" : ""}`, active: brollSuggestions.length > 0 },
    { label: "Legendas", detail: subtitleStyle ? subtitleStyle.preset : "desativadas", active: !!subtitleStyle },
    { label: "Cor", detail: stepSettings.color?.activePreset ? String(stepSettings.color.activePreset) : "padrão", active: !!stepSettings.color },
    { label: "Música", detail: musicTrack ? musicTrack.title : "nenhuma", active: !!musicTrack },
  ], [brollSuggestions.length, subtitleStyle, stepSettings.color, musicTrack]);

  const handleTimeChange = useCallback((t: number) => {
    setCurrentTime(t);
  }, []);

  const handlePlayPause = useCallback(() => setIsPlaying(p => !p), []);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 flex min-h-0">
        {/* Checklist sidebar */}
        <div className="w-56 border-r border-border bg-card flex-shrink-0 p-4 flex flex-col gap-1">
          <div className="flex items-center gap-2 mb-3">
            <Eye className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Preview Final</span>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Visualize todas as edições compostas antes de exportar.
          </p>
          <div className="space-y-2">
            {checklist.map(item => (
              <div
                key={item.label}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  item.active ? "bg-primary/10 text-foreground" : "bg-muted/40 text-muted-foreground"
                )}
              >
                {item.active ? (
                  <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                ) : (
                  <X className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0" />
                )}
                <span className="font-medium">{item.label}</span>
                <span className="ml-auto text-xs opacity-70">{item.detail}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Video preview */}
        <div className="flex-1 flex items-center justify-center bg-background min-h-0 relative">
          <div className="w-full h-full relative" style={{ filter: colorFilter }}>
            <VideoPreview
              videoUrl={videoUrl}
              currentTime={currentTime}
              onTimeChange={handleTimeChange}
              isPlaying={isPlaying}
              onPlayPause={handlePlayPause}
              brollSuggestions={brollSuggestions}
              onVideoError={onVideoError}
              isLoadingUrl={isLoadingUrl}
            />
            {subtitleStyle && (
              <SubtitleOverlay
                currentTime={currentTime}
                wordSegments={wordSegments}
                style={subtitleStyle}
              />
            )}
          </div>
        </div>
      </div>

      {/* Timeline */}
      <Timeline
        currentTime={currentTime}
        onTimeChange={handleTimeChange}
        zoom={zoom}
        onZoomChange={setZoom}
        duration={duration}
        brollSuggestions={brollSuggestions}
        videoUrl={videoUrl}
        musicTrack={musicTrack}
      />
    </div>
  );
}
