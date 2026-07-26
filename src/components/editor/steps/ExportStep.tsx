import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Download, Check, AlertTriangle, X, Loader2, FileDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVideoExport, type ExportConfig } from "@/hooks/useVideoExport";
import type { TranscriptionResult } from "@/hooks/useTranscription";
import type { StepSettings } from "@/pages/Editor";

const NLE_EXPORTS = [
  { id: "fcpx", name: "Final Cut Pro", ext: ".fcpxml", icon: "🍎" },
  { id: "premiere", name: "Premiere Pro", ext: ".xml", icon: "🎬" },
  { id: "davinci", name: "DaVinci Resolve", ext: ".fcpxml", icon: "🎨" },
  { id: "capcut", name: "CapCut", ext: ".xml", icon: "✂️" },
];

const TRANSFER_INFO = [
  { text: "Cortes e timeline", status: "yes" },
  { text: "B-rolls como clipes separados", status: "yes" },
  { text: "Enquadramento (crop/posição)", status: "yes" },
  { text: "Legendas (via .SRT)", status: "yes" },
  { text: "Transições (apenas corte seco)", status: "warn" },
  { text: "Presets de cor", status: "no" },
  { text: "Melhorias de áudio (já exportado processado)", status: "no" },
  { text: "Animações de legenda", status: "no" },
];

interface ExportStepProps {
  videoUrl: string | null;
  transcription: TranscriptionResult | null;
  stepSettings: StepSettings;
}

export function ExportStep({ videoUrl, transcription, stepSettings }: ExportStepProps) {
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [resolution, setResolution] = useState("1080");
  const [quality, setQuality] = useState("high");
  const [format, setFormat] = useState<"webm" | "mp4">("mp4");

  const { startExport, cancelExport, isExporting, progress, phase, downloadUrl, exportedFormat } =
    useVideoExport(videoUrl, transcription, stepSettings);

  const handleExport = () => {
    const config: ExportConfig = { aspectRatio, resolution, quality, format };
    startExport(config);
  };

  const handleDownload = () => {
    if (!downloadUrl) return;
    const ext = exportedFormat === "mp4" ? "mp4" : "webm";
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `video-flow-ai-export.${ext}`;
    a.click();
  };

  return (
    <div className="flex-1 flex items-start justify-center p-8 overflow-auto">
      <div className="w-full max-w-3xl space-y-6">
        {/* Export Video */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Exportar Vídeo Final</h3>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Formato de Saída</label>
              <Select value={aspectRatio} onValueChange={setAspectRatio}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="9:16">9:16 Vertical</SelectItem>
                  <SelectItem value="16:9">16:9 Horizontal</SelectItem>
                  <SelectItem value="1:1">1:1 Quadrado</SelectItem>
                  <SelectItem value="4:5">4:5 Retrato</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Resolução</label>
              <Select value={resolution} onValueChange={setResolution}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="720">720p</SelectItem>
                  <SelectItem value="1080">1080p</SelectItem>
                  <SelectItem value="4k">4K (Pro)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Qualidade</label>
              <Select value={quality} onValueChange={setQuality}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="web">Web-Optimized</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="max">Máxima</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Formato</label>
              <Select value={format} onValueChange={(v) => setFormat(v as "webm" | "mp4")}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mp4">MP4 (H.264 + AAC) — Compatível com tudo</SelectItem>
                  <SelectItem value="webm">WebM (VP9 + Opus) — Mais rápido</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {isExporting ? (
            <div className="space-y-3">
              <Progress value={progress} className="w-full" />
              <p className="text-xs text-muted-foreground text-center">{phase} {Math.round(progress)}%</p>
              <Button variant="outline" className="w-full gap-2" onClick={cancelExport}>
                <X className="w-4 h-4" /> Cancelar Exportação
              </Button>
            </div>
          ) : downloadUrl ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 justify-center text-sm text-[hsl(var(--segment-speech))]">
                <Check className="w-4 h-4" /> Exportação concluída!
              </div>
              {format === "mp4" && exportedFormat !== "mp4" && (
                <div className="flex items-start gap-2 text-xs rounded-md border border-[hsl(var(--segment-broll))]/40 bg-[hsl(var(--segment-broll))]/10 p-2 text-[hsl(var(--segment-broll))]">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>
                    Você pediu MP4, mas a conversão falhou e o arquivo foi entregue em WebM.
                    Tente novamente ou verifique o console para detalhes.
                  </span>
                </div>
              )}
              <Button className="w-full gap-2" onClick={handleDownload}>
                <FileDown className="w-4 h-4" /> Baixar Vídeo (.{exportedFormat === "mp4" ? "mp4" : "webm"})
              </Button>
              <Button variant="outline" className="w-full gap-2" onClick={handleExport}>
                <Download className="w-4 h-4" /> Exportar Novamente
              </Button>
            </div>
          ) : (
            <Button
              className="w-full gap-2"
              onClick={handleExport}
              disabled={!videoUrl}
            >
              {!videoUrl ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Carregando vídeo...
                </>
              ) : (
              <>
                  <Download className="w-4 h-4" /> Exportar {format === "mp4" ? "MP4" : "WebM"}
                </>
              )}
            </Button>
          )}

          {!videoUrl && !isExporting && (
            <p className="text-xs text-muted-foreground text-center">
              Nenhum vídeo carregado. Faça upload de um vídeo na etapa inicial.
            </p>
          )}
        </div>

        {/* Export to NLE */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Exportar para Editor Profissional (NLE)</h3>

          <div className="grid grid-cols-4 gap-3">
            {NLE_EXPORTS.map((nle) => (
              <button
                key={nle.id}
                className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border hover:border-primary/40 hover:bg-surface-raised transition-all"
              >
                <span className="text-3xl">{nle.icon}</span>
                <span className="text-xs font-medium">{nle.name}</span>
                <span className="text-[10px] text-muted-foreground">{nle.ext}</span>
              </button>
            ))}
          </div>

          <div className="space-y-2 pt-2">
            <div className="flex items-center gap-2">
              <Checkbox id="include-media" defaultChecked />
              <label htmlFor="include-media" className="text-xs">Incluir arquivos de mídia (zip com mídia + projeto)</label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="export-srt" defaultChecked />
              <label htmlFor="export-srt" className="text-xs">Exportar legendas como .SRT separado</label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="include-brolls" defaultChecked />
              <label htmlFor="include-brolls" className="text-xs">Incluir B-rolls como clipes na timeline</label>
            </div>
          </div>
        </div>

        {/* Transfer Info */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">O que transfere?</h3>
          <div className="space-y-1.5">
            {TRANSFER_INFO.map((item) => (
              <div key={item.text} className="flex items-center gap-2 text-xs">
                {item.status === "yes" && <Check className="w-3.5 h-3.5 text-[hsl(var(--segment-speech))]" />}
                {item.status === "warn" && <AlertTriangle className="w-3.5 h-3.5 text-[hsl(var(--segment-broll))]" />}
                {item.status === "no" && <X className="w-3.5 h-3.5 text-[hsl(var(--segment-removed))]" />}
                <span className={cn(item.status === "no" && "text-muted-foreground")}>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
