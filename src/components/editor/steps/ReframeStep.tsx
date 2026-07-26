import { useState, useEffect, useCallback } from "react";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ReframePreview } from "@/components/editor/ReframePreview";
import { Timeline } from "@/components/editor/Timeline";
import { useFaceTracking } from "@/hooks/useFaceTracking";

type AspectRatio = "9:16" | "16:9" | "1:1" | "4:5";
type FramingMode = "auto" | "manual" | "fixed";

const ASPECT_RATIOS: { value: AspectRatio; label: string; desc: string }[] = [
  { value: "9:16", label: "9:16", desc: "TikTok / Reels / Shorts" },
  { value: "16:9", label: "16:9", desc: "YouTube" },
  { value: "1:1", label: "1:1", desc: "Instagram Feed" },
  { value: "4:5", label: "4:5", desc: "Instagram Retrato" },
];

const FRAMING_MODES: { value: FramingMode; icon: string; label: string; desc: string }[] = [
  { value: "auto", icon: "🤖", label: "Automático", desc: "IA faz tracking do speaker" },
  { value: "manual", icon: "🎯", label: "Manual", desc: "Posicione o crop com drag" },
  { value: "fixed", icon: "🔒", label: "Fixo", desc: "Crop estático, sem tracking" },
];

interface ReframeStepProps {
  videoUrl?: string | null;
  initialSettings?: Record<string, unknown>;
  onSettingsChange?: (settings: Record<string, unknown>) => void;
  onVideoError?: () => Promise<string | null>;
  isLoadingUrl?: boolean;
}

export function ReframeStep({ videoUrl, initialSettings, onSettingsChange, onVideoError }: ReframeStepProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(2);
  const [duration, setDuration] = useState<number | undefined>(undefined);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>((initialSettings?.aspectRatio as AspectRatio) ?? "9:16");
  const [framingMode, setFramingMode] = useState<FramingMode>((initialSettings?.framingMode as FramingMode) ?? "auto");
  const [verticalPosition, setVerticalPosition] = useState((initialSettings?.verticalPosition as number) ?? 50);
  const [zoomLevel, setZoomLevel] = useState((initialSettings?.zoomLevel as number) ?? 100);
  const [trackingSpeed, setTrackingSpeed] = useState((initialSettings?.trackingSpeed as number[]) ?? [50]);
  const [showBoundingBox, setShowBoundingBox] = useState(false);

  // Persist settings on change
  useEffect(() => {
    onSettingsChange?.({ aspectRatio, framingMode, verticalPosition, zoomLevel, trackingSpeed });
  }, [aspectRatio, framingMode, verticalPosition, zoomLevel, trackingSpeed]);

  // Face tracking for auto mode
  const { keyframes: faceKeyframes, isAnalyzing, progress: analysisProgress, error: analysisError } =
    useFaceTracking(videoUrl, framingMode === "auto");

  // Fallback simulated playback when no video
  useEffect(() => {
    if (!isPlaying || videoUrl) return;
    const interval = setInterval(() => {
      setCurrentTime((t) => {
        if (t >= (duration ?? 124)) { setIsPlaying(false); return 0; }
        return t + 0.1;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [isPlaying, videoUrl, duration]);

  const handlePlayPause = useCallback(() => setIsPlaying((p) => !p), []);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 flex min-h-0">
        {/* Left — Controls */}
        <div className="w-72 border-r border-border bg-card flex-shrink-0 flex flex-col min-h-0">
          <ScrollArea className="flex-1">
            <div className="space-y-5 p-3">
              {/* Aspect Ratio */}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Formato de Saída</label>
                <div className="grid grid-cols-2 gap-2">
                  {ASPECT_RATIOS.map((ar) => (
                    <button
                      key={ar.value}
                      onClick={() => setAspectRatio(ar.value)}
                      className={cn(
                        "flex flex-col items-center p-2.5 rounded-lg border-2 transition-all text-center",
                        aspectRatio === ar.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                      )}
                    >
                      <span className="text-sm font-bold">{ar.label}</span>
                      <span className="text-[9px] text-muted-foreground mt-0.5">{ar.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Framing Mode */}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Modo de Enquadramento</label>
                <div className="space-y-1.5">
                  {FRAMING_MODES.map((mode) => (
                    <button
                      key={mode.value}
                      onClick={() => setFramingMode(mode.value)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-left",
                        framingMode === mode.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                      )}
                    >
                      <span className="text-lg">{mode.icon}</span>
                      <div>
                        <span className="text-xs font-medium block">{mode.label}</span>
                        <span className="text-[10px] text-muted-foreground">{mode.desc}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Adjustments */}
              <div className="space-y-3">
                <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Ajustes</label>
                <div className="space-y-2">
                  <label className="text-[10px] text-muted-foreground">Posição Vertical: {verticalPosition}%</label>
                  <Slider value={[verticalPosition]} onValueChange={([v]) => setVerticalPosition(v)} max={100} step={1} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-muted-foreground">Zoom: {zoomLevel}%</label>
                  <Slider value={[zoomLevel]} onValueChange={([v]) => setZoomLevel(v)} min={100} max={150} step={1} />
                </div>
                {framingMode === "auto" && (
                  <>
                    <div className="space-y-2">
                      <label className="text-[10px] text-muted-foreground">Velocidade do Tracking</label>
                      <Slider value={trackingSpeed} onValueChange={setTrackingSpeed} max={100} step={1} />
                      <div className="flex justify-between text-[9px] text-muted-foreground">
                        <span>Suave</span><span>Rápido</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="show-bbox" className="text-[10px] text-muted-foreground cursor-pointer">
                        Mostrar detecção do rosto
                      </Label>
                      <Switch
                        id="show-bbox"
                        checked={showBoundingBox}
                        onCheckedChange={setShowBoundingBox}
                        className="scale-75"
                      />
                    </div>
                    {isAnalyzing && (
                      <div className="space-y-1.5 p-2 rounded-lg bg-primary/5 border border-primary/20">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                          <span className="text-[10px] font-medium text-foreground">Analisando rostos...</span>
                        </div>
                        <Progress value={analysisProgress} className="h-1.5" />
                        <span className="text-[9px] text-muted-foreground">{analysisProgress}%</span>
                      </div>
                    )}
                    {!isAnalyzing && faceKeyframes.length > 0 && (
                      <div className="p-2 rounded-lg bg-primary/5 border border-primary/20">
                        <span className="text-[10px] text-foreground">✅ {faceKeyframes.length} keyframes detectados</span>
                      </div>
                    )}
                    {analysisError && (
                      <div className="p-2 rounded-lg bg-destructive/10 border border-destructive/20">
                        <span className="text-[10px] text-destructive">{analysisError}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </ScrollArea>
        </div>

        {/* Center — Preview */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <div className="flex-1 flex items-center justify-center p-4 min-h-0">
            <ReframePreview
              videoUrl={videoUrl}
              aspectRatio={aspectRatio}
              framingMode={framingMode}
              verticalPosition={verticalPosition}
              zoomLevel={zoomLevel}
              currentTime={currentTime}
              isPlaying={isPlaying}
              onTimeChange={setCurrentTime}
              onPlayPause={handlePlayPause}
              onDurationChange={setDuration}
              onVerticalPositionChange={setVerticalPosition}
              faceKeyframes={faceKeyframes}
              trackingSpeed={trackingSpeed[0]}
              showBoundingBox={showBoundingBox && framingMode === "auto"}
              onVideoError={onVideoError}
            />
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 px-3 pb-3">
        <Timeline currentTime={currentTime} onTimeChange={setCurrentTime} zoom={zoom} onZoomChange={setZoom} duration={duration} />
      </div>
    </div>
  );
}
