import { useState, useEffect, useCallback, useMemo } from "react";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { VideoPreview } from "@/components/editor/VideoPreview";
import { Timeline } from "@/components/editor/Timeline";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/* ── Neutral values (slider midpoint = no effect) ── */
const NEUTRAL = { brightness: 50, contrast: 50, saturation: 50, temperature: 50, sharpness: 30 };

/* ── Preset definitions: deviations from neutral ── */
const PRESET_VALUES: Record<string, Partial<typeof NEUTRAL>> = {
  none: {},
  cinema:       { contrast: 62, saturation: 38, temperature: 42, brightness: 47 },
  warm:         { temperature: 68, saturation: 55, brightness: 52 },
  cool:         { temperature: 32, saturation: 45, brightness: 48 },
  vintage:      { brightness: 45, saturation: 35, temperature: 62, contrast: 42 },
  vibrant:      { saturation: 72, contrast: 55, brightness: 52 },
  matte:        { contrast: 38, saturation: 40, brightness: 46 },
  golden:       { temperature: 70, saturation: 58, brightness: 54 },
  "teal-orange": { temperature: 55, saturation: 60, contrast: 56 },
  moody:        { brightness: 40, contrast: 58, saturation: 35, temperature: 40 },
  clean:        { brightness: 55, contrast: 48, saturation: 45 },
  bw:           { saturation: 0, contrast: 58 },
};

const COLOR_PRESETS = [
  { id: "none", name: "Original", gradient: "from-gray-400 to-gray-500" },
  { id: "cinema", name: "Cinema", gradient: "from-slate-500 to-blue-900" },
  { id: "warm", name: "Quente", gradient: "from-orange-400 to-amber-500" },
  { id: "cool", name: "Frio", gradient: "from-blue-400 to-cyan-500" },
  { id: "vintage", name: "Vintage", gradient: "from-amber-300 to-orange-600" },
  { id: "vibrant", name: "Vibrante", gradient: "from-pink-500 to-yellow-400" },
  { id: "matte", name: "Matte", gradient: "from-gray-500 to-gray-700" },
  { id: "golden", name: "Hora Dourada", gradient: "from-yellow-300 to-orange-500" },
  { id: "teal-orange", name: "Teal & Orange", gradient: "from-teal-400 to-orange-400" },
  { id: "moody", name: "Sombrio", gradient: "from-purple-800 to-slate-900" },
  { id: "clean", name: "Clean", gradient: "from-sky-200 to-white" },
  { id: "bw", name: "P&B", gradient: "from-gray-800 to-black" },
];

interface ColorStepProps {
  videoUrl?: string | null;
  initialSettings?: Record<string, unknown>;
  onSettingsChange?: (settings: Record<string, unknown>) => void;
  onVideoError?: () => Promise<string | null>;
  isLoadingUrl?: boolean;
}

/** Build a CSS filter string from slider values + intensity */
function buildFilterStyle(
  brightness: number,
  contrast: number,
  saturation: number,
  temperature: number,
  _sharpness: number,
  intensity: number,
): string {
  // Intensity acts as a lerp between neutral (50) and the slider value
  const lerp = (val: number, neutral: number) => neutral + (val - neutral) * (intensity / 100);

  const b = lerp(brightness, NEUTRAL.brightness) / 50;   // 1.0 = no change
  const c = lerp(contrast, NEUTRAL.contrast) / 50;
  const s = lerp(saturation, NEUTRAL.saturation) / 50;

  // Temperature: warm = sepia + slight hue shift, cool = negative hue shift
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

export function ColorStep({ videoUrl, initialSettings, onSettingsChange, onVideoError, isLoadingUrl }: ColorStepProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(2);
  const [activePreset, setActivePreset] = useState((initialSettings?.activePreset as string) ?? "none");
  const [intensity, setIntensity] = useState((initialSettings?.intensity as number[]) ?? [70]);
  const [brightness, setBrightness] = useState((initialSettings?.brightness as number[]) ?? [50]);
  const [contrast, setContrast] = useState((initialSettings?.contrast as number[]) ?? [50]);
  const [saturation, setSaturation] = useState((initialSettings?.saturation as number[]) ?? [50]);
  const [temperature, setTemperature] = useState((initialSettings?.temperature as number[]) ?? [50]);
  const [sharpness, setSharpness] = useState((initialSettings?.sharpness as number[]) ?? [30]);

  // Apply preset values to sliders
  const applyPreset = useCallback((presetId: string) => {
    setActivePreset(presetId);
    const vals = PRESET_VALUES[presetId] ?? {};
    setBrightness([vals.brightness ?? NEUTRAL.brightness]);
    setContrast([vals.contrast ?? NEUTRAL.contrast]);
    setSaturation([vals.saturation ?? NEUTRAL.saturation]);
    setTemperature([vals.temperature ?? NEUTRAL.temperature]);
    setSharpness([vals.sharpness ?? NEUTRAL.sharpness]);
  }, []);

  // Persist settings on change
  useEffect(() => {
    onSettingsChange?.({ activePreset, intensity, brightness, contrast, saturation, temperature, sharpness });
  }, [activePreset, intensity, brightness, contrast, saturation, temperature, sharpness]);

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

  const filterStyle = useMemo(
    () => buildFilterStyle(brightness[0], contrast[0], saturation[0], temperature[0], sharpness[0], intensity[0]),
    [brightness, contrast, saturation, temperature, sharpness, intensity],
  );

  const adjustments = [
    { label: "Brilho", value: brightness, onChange: setBrightness },
    { label: "Contraste", value: contrast, onChange: setContrast },
    { label: "Saturação", value: saturation, onChange: setSaturation },
    { label: "Temperatura", value: temperature, onChange: setTemperature },
    { label: "Nitidez", value: sharpness, onChange: setSharpness },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 flex min-h-0">
        {/* Left — Presets & Adjustments */}
        <div className="w-72 border-r border-border bg-card flex-shrink-0 flex flex-col min-h-0">
          <ScrollArea className="flex-1">
            <div className="space-y-4 p-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Presets de Cor</label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] text-muted-foreground"
                    onClick={() => applyPreset("none")}
                  >
                    <RotateCcw className="w-3 h-3 mr-1" /> Reset
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => applyPreset(preset.id)}
                      className={cn(
                        "rounded-lg border-2 overflow-hidden transition-all flex flex-col items-center",
                        activePreset === preset.id ? "border-primary ring-1 ring-primary/30" : "border-border hover:border-primary/40"
                      )}
                    >
                      <div className={cn("w-full h-8 bg-gradient-to-br", preset.gradient)} />
                      <span className="text-[9px] text-muted-foreground py-0.5">{preset.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Intensidade: {intensity[0]}%</label>
                <Slider value={intensity} onValueChange={setIntensity} max={100} step={1} />
              </div>

              <div className="space-y-3">
                <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Ajustes Manuais</label>
                {adjustments.map(({ label, value, onChange }) => (
                  <div key={label} className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-[10px] text-muted-foreground">{label}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">{value[0]}</span>
                    </div>
                    <Slider value={value} onValueChange={onChange} max={100} step={1} />
                  </div>
                ))}
              </div>
            </div>
          </ScrollArea>
        </div>

        {/* Center — Preview with CSS filter applied */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <div className="flex-1 flex items-center justify-center p-4 min-h-0">
            <div style={{ filter: filterStyle }} className="w-full h-full flex items-center justify-center">
              <VideoPreview
                videoUrl={videoUrl}
                currentTime={currentTime}
                onTimeChange={setCurrentTime}
                isPlaying={isPlaying}
                onPlayPause={handlePlayPause}
                onVideoError={onVideoError}
                isLoadingUrl={isLoadingUrl}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 px-3 pb-3">
        <Timeline currentTime={currentTime} onTimeChange={setCurrentTime} zoom={zoom} onZoomChange={setZoom} />
      </div>
    </div>
  );
}
