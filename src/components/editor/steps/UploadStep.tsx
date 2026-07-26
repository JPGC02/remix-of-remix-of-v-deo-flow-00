import { useState, useRef } from "react";
import { Upload, Loader2, AlertCircle, CheckCircle2, Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useTranscription } from "@/hooks/useTranscription";
import type { TranscriptionResult, TranscriptionPhase } from "@/hooks/useTranscription";

export interface UploadOptions {
  removeSilences: boolean;
  removeBadTakes: boolean;
  removeFillers: boolean;
}

interface UploadStepProps {
  onFileSelected: (file: File, blobUrl: string) => Promise<string | null>;
  onUploadComplete: (storagePath: string | null, result: TranscriptionResult) => void;
  onUploadOptionsChange?: (options: UploadOptions) => void;
}

const PHASE_LABELS: Record<TranscriptionPhase, string> = {
  preparing: "Preparando...",
  extracting: "Extraindo áudio do vídeo...",
  uploading: "Enviando vídeo...",
  transcribing: "Transcrevendo com IA...",
  processing: "Processando transcrição...",
  done: "Concluído!",
  error: "Erro",
};

const PHASE_ORDER: TranscriptionPhase[] = [
  "preparing", "extracting", "uploading", "transcribing", "processing", "done"
];

function getOverallProgress(phase: TranscriptionPhase, phasePercent: number): number {
  const weights: Record<TranscriptionPhase, [number, number]> = {
    preparing: [0, 5],
    extracting: [5, 25],
    uploading: [25, 35],
    transcribing: [35, 85],
    processing: [85, 95],
    done: [95, 100],
    error: [0, 0],
  };
  const [start, end] = weights[phase] || [0, 0];
  return Math.round(start + ((end - start) * phasePercent) / 100);
}

export function UploadStep({ onFileSelected, onUploadComplete, onUploadOptionsChange }: UploadStepProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [appPhase, setAppPhase] = useState<"idle" | "processing" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [uploadOptions, setUploadOptions] = useState<UploadOptions>({
    removeSilences: true,
    removeBadTakes: true,
    removeFillers: true,
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const { transcribe, progress } = useTranscription();
  const { theme, setTheme } = useTheme();

  const updateOption = (key: keyof UploadOptions, value: boolean) => {
    const next = { ...uploadOptions, [key]: value };
    setUploadOptions(next);
    onUploadOptionsChange?.(next);
  };

  const handleFile = async (file: File) => {
    setAppPhase("processing");

    const blobUrl = URL.createObjectURL(file);

    // Run upload to storage and transcription in parallel, await both
    const [storagePath, transcriptionResult] = await Promise.all([
      onFileSelected(file, blobUrl),
      transcribe(file),
    ]);

    if (transcriptionResult) {
      onUploadComplete(storagePath, transcriptionResult);
    } else {
      setAppPhase("error");
      setErrorMsg(progress.phaseLabel || "Falha na transcrição. Tente novamente.");
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleRetry = () => {
    setAppPhase("idle");
    setErrorMsg(null);
  };

  if (appPhase === "processing") {
    const overall = getOverallProgress(progress.phase, progress.percent);
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-5 w-full max-w-md px-8">
          {progress.phase === "done" ? (
            <CheckCircle2 className="w-12 h-12 text-primary mx-auto" />
          ) : (
            <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto" />
          )}
          <p className="text-lg font-medium">{progress.phaseLabel || PHASE_LABELS[progress.phase]}</p>
          {progress.chunkInfo && (
            <p className="text-sm text-muted-foreground">{progress.chunkInfo}</p>
          )}
          <Progress value={overall} className="w-full" />
          <p className="text-xs text-muted-foreground">{overall}%</p>

          <div className="flex items-center justify-center gap-1 pt-2">
            {PHASE_ORDER.slice(0, -1).map((phase) => {
              const currentIdx = PHASE_ORDER.indexOf(progress.phase);
              const phaseIdx = PHASE_ORDER.indexOf(phase);
              const isDone = phaseIdx < currentIdx;
              const isCurrent = phase === progress.phase;
              return (
                <div
                  key={phase}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    isDone ? "w-6 bg-primary" : isCurrent ? "w-8 bg-primary/60" : "w-4 bg-muted"
                  )}
                />
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (appPhase === "error") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
          <p className="text-lg font-medium">Erro na transcrição</p>
          <p className="text-sm text-muted-foreground">{errorMsg}</p>
          <Button variant="outline" onClick={handleRetry}>Tentar novamente</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center p-8 relative">
      <button
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        className="absolute top-4 right-4 p-2 rounded-lg border border-border bg-card hover:bg-secondary transition-colors"
        title={theme === "dark" ? "Modo claro" : "Modo escuro"}
      >
        {theme === "dark" ? <Sun className="w-4 h-4 text-muted-foreground" /> : <Moon className="w-4 h-4 text-muted-foreground" />}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleInputChange}
      />
      <div className="w-full max-w-xl space-y-6">
        <div
          className={cn(
            "w-full border-2 border-dashed rounded-2xl p-16 text-center transition-all cursor-pointer",
            isDragging ? "border-primary bg-primary/5 scale-[1.02]" : "border-border hover:border-primary/40 hover:bg-secondary/50"
          )}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <div className="space-y-4">
            <Upload className="w-16 h-16 text-muted-foreground mx-auto" />
            <div>
              <p className="text-lg font-medium">Arraste seu vídeo aqui ou clique para selecionar</p>
              <p className="text-sm text-muted-foreground mt-1">MP4, MOV, AVI, MKV • Até 200MB</p>
            </div>
            <Button variant="outline" size="sm" className="mt-4">
              Selecionar Arquivo
            </Button>
          </div>
        </div>

        <div className="border border-border rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium text-foreground">Processamento automático</p>
          <TooltipProvider delayDuration={300}>
            <div className="space-y-2.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm text-muted-foreground">Remover Silêncios</span>
                    <Switch checked={uploadOptions.removeSilences} onCheckedChange={(v) => updateOption("removeSilences", v)} />
                  </label>
                </TooltipTrigger>
                <TooltipContent side="left"><p className="max-w-52 text-xs">Detecta e remove automaticamente pausas e silêncios longos entre falas.</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm text-muted-foreground">Remover Erros (Tomadas Ruins)</span>
                    <Switch checked={uploadOptions.removeBadTakes} onCheckedChange={(v) => updateOption("removeBadTakes", v)} />
                  </label>
                </TooltipTrigger>
                <TooltipContent side="left"><p className="max-w-52 text-xs">Identifica frases repetidas ou corrigidas e mantém apenas a melhor versão.</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm text-muted-foreground">Remover Palavras de Preenchimento</span>
                    <Switch checked={uploadOptions.removeFillers} onCheckedChange={(v) => updateOption("removeFillers", v)} />
                  </label>
                </TooltipTrigger>
                <TooltipContent side="left"><p className="max-w-52 text-xs">Remove palavras como "é...", "tipo", "né", "hum" que não agregam ao conteúdo.</p></TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}
