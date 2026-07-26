import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

const COLOR_PRESETS = [
  { id: "none", name: "Nenhum", gradient: "from-gray-400 to-gray-500" },
  { id: "warm", name: "Quente", gradient: "from-orange-400 to-amber-500" },
  { id: "cool", name: "Frio", gradient: "from-blue-400 to-cyan-500" },
  { id: "vintage", name: "Vintage", gradient: "from-amber-300 to-orange-600" },
  { id: "cinematic", name: "Cinemático", gradient: "from-slate-500 to-blue-900" },
  { id: "moody", name: "Sombrio", gradient: "from-purple-800 to-slate-900" },
  { id: "vibrant", name: "Vibrante", gradient: "from-pink-500 to-yellow-400" },
  { id: "desaturated", name: "Dessaturado", gradient: "from-gray-300 to-gray-600" },
  { id: "teal-orange", name: "Teal & Laranja", gradient: "from-teal-400 to-orange-400" },
  { id: "noir", name: "Noir", gradient: "from-gray-800 to-black" },
  { id: "golden", name: "Hora Dourada", gradient: "from-yellow-300 to-orange-500" },
  { id: "neon", name: "Neon", gradient: "from-fuchsia-500 to-cyan-400" },
];

export function ColorGradingPanel() {
  const [activePreset, setActivePreset] = useState("none");
  const [intensity, setIntensity] = useState([70]);
  const [brightness, setBrightness] = useState([50]);
  const [contrast, setContrast] = useState([50]);
  const [saturation, setSaturation] = useState([50]);
  const [temperature, setTemperature] = useState([50]);
  const [sharpness, setSharpness] = useState([30]);

  const adjustments = [
    { label: "Brilho", value: brightness, onChange: setBrightness },
    { label: "Contraste", value: contrast, onChange: setContrast },
    { label: "Saturação", value: saturation, onChange: setSaturation },
    { label: "Temperatura", value: temperature, onChange: setTemperature },
    { label: "Nitidez", value: sharpness, onChange: setSharpness },
  ];

  return (
    <div className="space-y-4 p-3">
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">Presets de Cor</label>
        <div className="grid grid-cols-3 gap-1.5">
          {COLOR_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => setActivePreset(preset.id)}
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
        <label className="text-xs text-muted-foreground font-medium">Ajustes Manuais</label>
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
  );
}
