import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

const NLE_EXPORTS = [
  { id: "fcpx", name: "Final Cut Pro", ext: ".fcpxml", icon: "🍎" },
  { id: "premiere", name: "Premiere Pro", ext: ".xml", icon: "🎬" },
  { id: "davinci", name: "DaVinci Resolve", ext: ".edl", icon: "🎨" },
  { id: "capcut", name: "CapCut", ext: ".json", icon: "✂️" },
];

export function ExportPanel() {
  return (
    <div className="space-y-4 p-3">
      <div className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Exportar Vídeo</h4>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Resolução</label>
          <Select defaultValue="1080">
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="720">720p</SelectItem>
              <SelectItem value="1080">1080p</SelectItem>
              <SelectItem value="4k">4K</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Qualidade</label>
          <Select defaultValue="high">
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Rascunho</SelectItem>
              <SelectItem value="high">Alta</SelectItem>
              <SelectItem value="max">Máxima</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Formato</label>
          <Select defaultValue="mp4">
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mp4">MP4 (H.264)</SelectItem>
              <SelectItem value="webm">WebM</SelectItem>
              <SelectItem value="mov">MOV (ProRes)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox id="include-media" defaultChecked />
            <label htmlFor="include-media" className="text-xs">Incluir arquivos de mídia</label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="export-srt" defaultChecked />
            <label htmlFor="export-srt" className="text-xs">Exportar legendas SRT</label>
          </div>
        </div>

        <Button className="w-full gap-2" size="sm">
          <Download className="w-4 h-4" /> Exportar Vídeo
        </Button>
      </div>

      <div className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Exportar para Editor</h4>
        <p className="text-[10px] text-muted-foreground">Exporte a timeline para seu editor favorito. Cortes, marcadores e legendas são transferidos. Correção de cor e efeitos podem precisar ser reaplicados.</p>

        <div className="grid grid-cols-2 gap-2">
          {NLE_EXPORTS.map((nle) => (
            <button
              key={nle.id}
              className="flex flex-col items-center gap-1 p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-surface-raised transition-colors"
            >
              <span className="text-2xl">{nle.icon}</span>
              <span className="text-xs font-medium">{nle.name}</span>
              <span className="text-[10px] text-muted-foreground">{nle.ext}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
