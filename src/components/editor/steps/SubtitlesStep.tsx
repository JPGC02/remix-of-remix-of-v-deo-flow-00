import { useState, useEffect, useCallback, useMemo } from "react";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { safeZonePresets, wordSegments as mockWordSegments, segments as mockSegments, type WordSegment } from "@/data/mockData";
import { VideoPreview } from "@/components/editor/VideoPreview";
import { Timeline } from "@/components/editor/Timeline";
import { TranscriptionPanel } from "@/components/editor/TranscriptionPanel";
import { SubtitleOverlay, type SubtitleStyle } from "@/components/editor/SubtitleOverlay";
import { RotateCcw } from "lucide-react";

const PRESET_PREVIEW_STYLES: Record<string, React.CSSProperties> = {
  hormozi: {
    fontFamily: "'Montserrat', sans-serif",
    fontWeight: 900,
    textShadow: "1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000",
    color: "#FFD700",
    letterSpacing: "0.02em",
  },
  karaoke: {
    fontFamily: "'Poppins', sans-serif",
    fontWeight: 700,
    textShadow: "0 1px 6px rgba(0,0,0,0.7)",
    color: "hsl(var(--primary))",
  },
  minimal: {
    fontFamily: "'Inter', sans-serif",
    fontWeight: 500,
    textShadow: "0 1px 3px rgba(0,0,0,0.5)",
    color: "#FFFFFF",
  },
  boxed: {
    fontFamily: "'Inter', sans-serif",
    fontWeight: 600,
    background: "rgba(0,0,0,0.75)",
    padding: "2px 6px",
    borderRadius: "4px",
    color: "#FFFFFF",
  },
  outline: {
    fontFamily: "'Oswald', sans-serif",
    fontWeight: 800,
    WebkitTextStroke: "1px #000",
    textShadow: "0 0 6px rgba(0,0,0,0.5)",
    color: "#FFFFFF",
  },
  glow: {
    fontFamily: "'Poppins', sans-serif",
    fontWeight: 700,
    textShadow: "0 0 8px hsl(var(--primary)), 0 0 16px hsl(var(--primary))",
    color: "hsl(var(--primary))",
  },
};

const PRESETS = [
  { id: "hormozi", name: "Hormozi", preview: "IMPACTO BOLD" },
  { id: "karaoke", name: "Karaokê", preview: "palavra a palavra" },
  { id: "minimal", name: "Minimal", preview: "limpo & simples" },
  { id: "boxed", name: "Caixa", preview: "estilo caixa" },
  { id: "outline", name: "Contorno", preview: "CONTORNADO" },
  { id: "glow", name: "Glow", preview: "NEON ✨" },
];

const QUICK_TEXT_COLORS = ["#FFFFFF", "#FFD700", "#00FF88", "#FF4444"];
const QUICK_HIGHLIGHT_COLORS = ["#6C5CE7", "#FFD700", "#FF4444", "#00FF88"];

const SAFE_ZONE_OVERLAYS: Record<string, { label: string; color: string; topLabel: string; bottomLabel: string; topPct: number; bottomPct: number; sidePct: number }> = {
  tiktok: {
    label: "TikTok",
    color: "hsl(var(--primary))",
    topLabel: "Nome de usuário / Info",
    bottomLabel: "Descrição / CTA / Música",
    topPct: 10,
    bottomPct: 22,
    sidePct: 5,
  },
  reels: {
    label: "Instagram Reels",
    color: "hsl(340, 75%, 55%)",
    topLabel: "Header / Stories",
    bottomLabel: "Legenda / Ações / Áudio",
    topPct: 12,
    bottomPct: 20,
    sidePct: 4,
  },
  shorts: {
    label: "YouTube Shorts",
    color: "hsl(0, 72%, 51%)",
    topLabel: "Barra de pesquisa",
    bottomLabel: "Título / Ações / Inscrever",
    topPct: 8,
    bottomPct: 18,
    sidePct: 3,
  },
};

function ColorPickerRow({ label, value, onChange, quickColors }: { label: string; value: string; onChange: (c: string) => void; quickColors: string[] }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="flex items-center gap-1.5">
        {quickColors.map((c) => (
          <button
            key={c}
            onClick={() => onChange(c)}
            className={cn(
              "w-6 h-6 rounded border-2 transition-all flex-shrink-0",
              value === c ? "border-primary ring-1 ring-primary/30 scale-110" : "border-border"
            )}
            style={{ background: c }}
          />
        ))}
        <div className="relative w-6 h-6 flex-shrink-0">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div
            className="w-6 h-6 rounded border-2 border-dashed border-muted-foreground/40"
            style={{ background: `linear-gradient(135deg, #ff0000, #00ff00, #0000ff)` }}
          />
        </div>
        <Input
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (/^#[0-9A-Fa-f]{0,6}$/.test(v) || v === "") onChange(v);
          }}
          onBlur={(e) => {
            if (!/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) onChange(value);
          }}
          className="h-6 text-[10px] px-1.5 w-[72px] font-mono bg-surface-raised border-border"
          maxLength={7}
        />
      </div>
    </div>
  );
}

interface SubtitlesStepProps {
  videoUrl?: string | null;
  transcription?: import("@/hooks/useTranscription").TranscriptionResult | null;
  initialSettings?: Record<string, unknown>;
  onSettingsChange?: (settings: Record<string, unknown>) => void;
  onVideoError?: () => Promise<string | null>;
  isLoadingUrl?: boolean;
}

export function SubtitlesStep({ videoUrl, transcription, initialSettings, onSettingsChange, onVideoError, isLoadingUrl }: SubtitlesStepProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [textOverrides, setTextOverrides] = useState<Record<string, string>>((initialSettings?.textOverrides as Record<string, string>) ?? {});
  const [zoom, setZoom] = useState(2);
  const [activePreset, setActivePreset] = useState((initialSettings?.activePreset as string) ?? "hormozi");
  const [fontSize, setFontSize] = useState((initialSettings?.fontSize as number[]) ?? [24]);
  const [position, setPosition] = useState((initialSettings?.position as string) ?? "bottom");
  const [maxWords, setMaxWords] = useState((initialSettings?.maxWords as string) ?? "2");
  const [textCase, setTextCase] = useState((initialSettings?.textCase as string) ?? "upper");
  const [textColor, setTextColor] = useState((initialSettings?.textColor as string) ?? "#FFFFFF");
  const [highlightColor, setHighlightColor] = useState((initialSettings?.highlightColor as string) ?? "#FFD700");
  const [font, setFont] = useState((initialSettings?.font as string) ?? "montserrat");
  const [animation, setAnimation] = useState((initialSettings?.animation as string) ?? "pop");
  const [activeSafeZone, setActiveSafeZone] = useState<string | null>((initialSettings?.activeSafeZone as string) ?? null);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState<boolean>((initialSettings?.subtitlesEnabled as boolean) ?? true);

  const hasOverrides = Object.keys(textOverrides).length > 0;

  useEffect(() => {
    onSettingsChange?.({ activePreset, fontSize, position, maxWords, textCase, textColor, highlightColor, font, animation, activeSafeZone, textOverrides, subtitlesEnabled });
  }, [activePreset, fontSize, position, maxWords, textCase, textColor, highlightColor, font, animation, activeSafeZone, textOverrides, subtitlesEnabled]);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentTime((t) => {
        if (t >= 124) { setIsPlaying(false); return 0; }
        return t + 0.1;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [isPlaying]);

  const handlePlayPause = useCallback(() => setIsPlaying((p) => !p), []);

  const handleTextEdit = useCallback((segmentId: string, newText: string) => {
    setTextOverrides((prev) => ({ ...prev, [segmentId]: newText }));
  }, []);

  const rawWordSegments = transcription?.wordSegments ?? mockWordSegments;
  const displayWordSegments = useMemo<WordSegment[]>(() => {
    if (Object.keys(textOverrides).length === 0) return rawWordSegments;

    const grouped = new Map<string, WordSegment[]>();
    for (const ws of rawWordSegments) {
      if (!grouped.has(ws.parentId)) grouped.set(ws.parentId, []);
      grouped.get(ws.parentId)!.push(ws);
    }

    const result: WordSegment[] = [];
    for (const ws of rawWordSegments) {
      const override = textOverrides[ws.parentId];
      if (!override) {
        result.push(ws);
        continue;
      }
      const siblings = grouped.get(ws.parentId)!;
      if (ws !== siblings[0]) continue;

      const newWords = override.split(/\s+/).filter(Boolean);
      const totalDur = siblings[siblings.length - 1].end - siblings[0].start;
      const wordDur = totalDur / newWords.length;

      for (let i = 0; i < newWords.length; i++) {
        result.push({
          id: `${ws.parentId}-ov${i}`,
          parentId: ws.parentId,
          start: siblings[0].start + i * wordDur,
          end: siblings[0].start + (i + 1) * wordDur,
          text: newWords[i],
          type: ws.type,
          status: ws.status,
        });
      }
    }
    return result;
  }, [rawWordSegments, textOverrides]);

  const safeZone = activeSafeZone ? SAFE_ZONE_OVERLAYS[activeSafeZone] : null;

  const subtitleStyle: SubtitleStyle = useMemo(() => ({
    preset: activePreset,
    fontSize: fontSize[0],
    position: position as "top" | "center" | "bottom",
    maxWords: parseInt(maxWords),
    textCase: textCase as "upper" | "lower" | "normal",
    textColor,
    highlightColor,
    font,
    animation,
  }), [activePreset, fontSize, position, maxWords, textCase, textColor, highlightColor, font, animation]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 flex min-h-0">
        {/* Left — Style Controls */}
        <div className="w-72 border-r border-border bg-card flex-shrink-0 flex flex-col min-h-0">
          <ScrollArea className="flex-1">
            <div className="space-y-4 p-3">
              {/* Toggle legendas */}
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground">Legendas</label>
                <Switch checked={subtitlesEnabled} onCheckedChange={setSubtitlesEnabled} />
              </div>

              {/* Style Presets */}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Estilos de Legenda</label>
                <div className="grid grid-cols-2 gap-2">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => setActivePreset(preset.id)}
                      className={cn(
                        "aspect-video rounded-lg border-2 flex items-center justify-center transition-all bg-black/60 overflow-hidden",
                        activePreset === preset.id ? "border-primary ring-1 ring-primary/30" : "border-border hover:border-primary/40"
                      )}
                    >
                      <span
                        className="text-[11px] px-1 text-center leading-tight"
                        style={PRESET_PREVIEW_STYLES[preset.id]}
                      >
                        {preset.preview}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Tamanho da Fonte: {fontSize[0]}px</label>
                <Slider value={fontSize} onValueChange={setFontSize} min={12} max={48} step={1} />
              </div>

              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Fonte</label>
                <Select value={font} onValueChange={setFont}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="montserrat">Montserrat</SelectItem>
                    <SelectItem value="poppins">Poppins</SelectItem>
                    <SelectItem value="inter">Inter</SelectItem>
                    <SelectItem value="bebas">Bebas Neue</SelectItem>
                    <SelectItem value="oswald">Oswald</SelectItem>
                    <SelectItem value="lato">Lato</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Colors with custom picker */}
              <div className="space-y-3">
                <ColorPickerRow label="Cor do Texto" value={textColor} onChange={setTextColor} quickColors={QUICK_TEXT_COLORS} />
                <ColorPickerRow label="Destaque" value={highlightColor} onChange={setHighlightColor} quickColors={QUICK_HIGHLIGHT_COLORS} />
              </div>

              {/* Max words */}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Máx. Palavras por Linha</label>
                <div className="flex gap-1">
                  {["1", "2", "3", "4", "5", "6"].map((n) => (
                    <button
                      key={n}
                      onClick={() => setMaxWords(n)}
                      className={cn(
                        "flex-1 py-1 rounded text-xs font-medium transition-colors",
                        maxWords === n ? "bg-primary text-primary-foreground" : "bg-surface-raised text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Case */}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Capitalização</label>
                <div className="flex gap-1">
                  {[{ key: "upper", label: "MAIÚSCULAS" }, { key: "lower", label: "minúsculas" }, { key: "normal", label: "Normal" }].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setTextCase(key)}
                      className={cn(
                        "flex-1 py-1 rounded text-[10px] font-medium transition-colors",
                        textCase === key ? "bg-primary text-primary-foreground" : "bg-surface-raised text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Position */}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Posição</label>
                <div className="flex gap-1">
                  {[{ key: "top", label: "Topo" }, { key: "center", label: "Centro" }, { key: "bottom", label: "Baixo" }].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setPosition(key)}
                      className={cn(
                        "flex-1 py-1 rounded text-xs font-medium transition-colors",
                        position === key ? "bg-primary text-primary-foreground" : "bg-surface-raised text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Animation */}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Animação</label>
                <Select value={animation} onValueChange={setAnimation}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pop">Surgir</SelectItem>
                    <SelectItem value="fade">Fade</SelectItem>
                    <SelectItem value="slide">Deslizar</SelectItem>
                    <SelectItem value="scale">Escalar</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Reset overrides */}
              {hasOverrides && (
                <button
                  onClick={() => setTextOverrides({})}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full py-1.5 px-2 rounded bg-surface-raised hover:bg-surface-raised/80"
                >
                  <RotateCcw className="w-3 h-3" />
                  Resetar correções de texto
                </button>
              )}

              {/* Safe Zones */}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Safe Zones</label>
                <p className="text-[10px] text-muted-foreground">Visualize as áreas protegidas de cada plataforma sobre o player.</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {safeZonePresets.map((sz) => {
                    const overlay = SAFE_ZONE_OVERLAYS[sz.id];
                    return (
                      <button
                        key={sz.id}
                        onClick={() => setActiveSafeZone(activeSafeZone === sz.id ? null : sz.id)}
                        className={cn(
                          "flex flex-col items-center gap-1 p-2 rounded-lg border transition-all",
                          activeSafeZone === sz.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                        )}
                      >
                        <div className="w-8 h-14 bg-black/60 rounded-sm relative overflow-hidden border border-border/50">
                          {overlay && (
                            <>
                              <div className="absolute inset-x-0 top-0 opacity-40" style={{ height: `${overlay.topPct}%`, backgroundColor: overlay.color }} />
                              <div className="absolute inset-x-0 bottom-0 opacity-40" style={{ height: `${overlay.bottomPct}%`, backgroundColor: overlay.color }} />
                              <div className="absolute border border-dashed opacity-50" style={{ borderColor: overlay.color, top: `${overlay.topPct}%`, bottom: `${overlay.bottomPct}%`, left: `${overlay.sidePct}%`, right: `${overlay.sidePct}%` }} />
                            </>
                          )}
                        </div>
                        <span className="text-[9px] font-medium">{sz.platform}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>

        {/* Center — Preview */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <div className="flex-1 flex items-center justify-center p-4 min-h-0 relative">
            <div className="relative">
              <VideoPreview
                currentTime={currentTime}
                onTimeChange={setCurrentTime}
                isPlaying={isPlaying}
                onPlayPause={handlePlayPause}
                videoUrl={videoUrl}
                onVideoError={onVideoError}
                isLoadingUrl={isLoadingUrl}
              />

              {subtitlesEnabled && (
                <div className="absolute inset-0 pointer-events-none z-20">
                  <SubtitleOverlay
                    currentTime={currentTime}
                    wordSegments={displayWordSegments}
                    style={subtitleStyle}
                  />
                </div>
              )}

              {safeZone && (
                <div className="absolute inset-0 pointer-events-none z-30">
                  <div className="absolute inset-x-0 top-0 flex items-center justify-center" style={{ height: `${safeZone.topPct}%`, backgroundColor: safeZone.color, opacity: 0.2 }} />
                  <div className="absolute inset-x-0 top-0 flex items-end justify-center pb-1" style={{ height: `${safeZone.topPct}%` }}>
                    <span className="text-[8px] font-medium px-1.5 py-0.5 rounded bg-black/60 text-white/80">{safeZone.topLabel}</span>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-center" style={{ height: `${safeZone.bottomPct}%`, backgroundColor: safeZone.color, opacity: 0.2 }} />
                  <div className="absolute inset-x-0 bottom-0 flex items-start justify-center pt-1" style={{ height: `${safeZone.bottomPct}%` }}>
                    <span className="text-[8px] font-medium px-1.5 py-0.5 rounded bg-black/60 text-white/80">{safeZone.bottomLabel}</span>
                  </div>
                  <div className="absolute border-2 border-dashed rounded" style={{ borderColor: safeZone.color, opacity: 0.5, top: `${safeZone.topPct}%`, bottom: `${safeZone.bottomPct}%`, left: `${safeZone.sidePct}%`, right: `${safeZone.sidePct}%` }} />
                  <div className="absolute top-2 right-2">
                    <Badge className="text-[9px] px-1.5 py-0.5" style={{ backgroundColor: safeZone.color, color: "white" }}>{safeZone.label}</Badge>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right — Transcription */}
        <div className="w-72 border-l border-border bg-card flex-shrink-0 flex flex-col min-h-0">
          <TranscriptionPanel currentTime={currentTime} onTimeChange={setCurrentTime} segments={transcription?.segments ?? mockSegments} textOverrides={textOverrides} onTextEdit={handleTextEdit} />
        </div>
      </div>

      <div className="flex-shrink-0 px-3 pb-3">
        <Timeline currentTime={currentTime} onTimeChange={setCurrentTime} zoom={zoom} onZoomChange={setZoom} />
      </div>
    </div>
  );
}