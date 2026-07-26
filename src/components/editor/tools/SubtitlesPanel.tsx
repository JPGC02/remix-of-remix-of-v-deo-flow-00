import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const PRESETS = [
  { id: "hormozi", name: "Hormozi", preview: "IMPACTO BOLD", font: "Impact", bg: "bg-yellow-400", text: "text-black", size: "text-lg" },
  { id: "minimal", name: "Minimal", preview: "limpo & simples", font: "sans", bg: "bg-transparent", text: "text-white", size: "text-sm" },
  { id: "karaoke", name: "Karaokê", preview: "palavra a palavra", font: "sans", bg: "bg-transparent", text: "text-primary", size: "text-base" },
  { id: "boxed", name: "Caixa", preview: "estilo caixa", font: "sans", bg: "bg-black/80", text: "text-white", size: "text-sm" },
  { id: "outline", name: "Contorno", preview: "CONTORNADO", font: "sans", bg: "bg-transparent", text: "text-white", size: "text-base" },
];

export function SubtitlesPanel() {
  const [activePreset, setActivePreset] = useState("hormozi");
  const [fontSize, setFontSize] = useState([24]);
  const [position, setPosition] = useState("bottom");

  return (
    <div className="space-y-4 p-3">
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">Estilos de Legenda</label>
        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => setActivePreset(preset.id)}
              className={cn(
                "aspect-video rounded-lg border-2 flex items-center justify-center transition-all",
                "bg-black/60",
                activePreset === preset.id ? "border-primary ring-1 ring-primary/30" : "border-border hover:border-primary/40"
              )}
            >
              <span className={cn(preset.text, preset.size, "font-bold px-2 py-0.5 rounded", preset.bg)}>
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
        <Select defaultValue="space-grotesk">
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="space-grotesk">Space Grotesk</SelectItem>
            <SelectItem value="impact">Impact</SelectItem>
            <SelectItem value="montserrat">Montserrat</SelectItem>
            <SelectItem value="roboto">Roboto</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Cor do Texto</label>
          <div className="flex gap-1">
            {["#FFFFFF", "#FFD700", "#00FF88", "#FF4444"].map((c) => (
              <button key={c} className="w-6 h-6 rounded border border-border" style={{ background: c }} />
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Destaque</label>
          <div className="flex gap-1">
            {["#6C5CE7", "#FFD700", "#FF4444", "#00FF88"].map((c) => (
              <button key={c} className="w-6 h-6 rounded border border-border" style={{ background: c }} />
            ))}
          </div>
        </div>
      </div>

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

      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">Animação</label>
        <Select defaultValue="pop">
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pop">Surgir</SelectItem>
            <SelectItem value="fade">Fade</SelectItem>
            <SelectItem value="slide">Deslizar</SelectItem>
            <SelectItem value="typewriter">Máquina de Escrever</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
