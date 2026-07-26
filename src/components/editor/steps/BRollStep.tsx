import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Check, X, Search, Sparkles, Film, ImageIcon, Type, Loader2, Bot, CheckSquare, ChevronDown, ChevronRight, Pencil, Plus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { transitionPresets, formatTime, type BRollSuggestion } from "@/data/mockData";
import { VideoPreview } from "@/components/editor/VideoPreview";
import { Timeline } from "@/components/editor/Timeline";
import { TransitionPreview } from "@/components/editor/TransitionPreview";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { TranscriptionResult } from "@/hooks/useTranscription";
import { TooltipProvider } from "@/components/ui/tooltip";

const BROLL_CATEGORIES = [
  { id: "all", label: "Todos", icon: Film },
  { id: "video", label: "Vídeo", icon: Film },
  { id: "image", label: "Imagem", icon: ImageIcon },
  { id: "text", label: "Texto", icon: Type },
  { id: "ai", label: "IA", icon: Bot },
];

interface AIProgressInfo {
  phase: string;
  message: string;
  percent: number;
}

interface BRollSuggestionWithKeywords extends BRollSuggestion {
  keywords?: string[];
  selectedIndex?: number;
  aiVideoUrl?: string;
  cropPosition?: string;
  veoPrompt?: string;
}

const CROP_POSITIONS = [
  { label: "↖", value: "0% 0%" },
  { label: "↑", value: "50% 0%" },
  { label: "↗", value: "100% 0%" },
  { label: "←", value: "0% 50%" },
  { label: "●", value: "50% 50%" },
  { label: "→", value: "100% 50%" },
  { label: "↙", value: "0% 100%" },
  { label: "↓", value: "50% 100%" },
  { label: "↘", value: "100% 100%" },
];

interface BRollStepProps {
  videoUrl?: string | null;
  transcription?: TranscriptionResult | null;
  initialSettings?: Record<string, unknown>;
  onSettingsChange?: (settings: Record<string, unknown>) => void;
  onVideoError?: () => Promise<string | null>;
  isLoadingUrl?: boolean;
}

export function BRollStep({ videoUrl, transcription, initialSettings, onSettingsChange, onVideoError, isLoadingUrl }: BRollStepProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(2);
  const [suggestions, setSuggestions] = useState<BRollSuggestionWithKeywords[]>(() => {
    const saved = initialSettings?.suggestions as BRollSuggestionWithKeywords[] | undefined;
    return saved && Array.isArray(saved) ? saved : [];
  });
  const [frequency, setFrequency] = useState(() => [((initialSettings?.frequency as number) ?? 50)]);
  const [duration, setDuration] = useState(() => [((initialSettings?.duration as number) ?? 3)]);
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeTransition, setActiveTransition] = useState("cut");
  const [transitionDuration, setTransitionDuration] = useState([0.5]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingThumbnails, setLoadingThumbnails] = useState<Set<string>>(new Set());
  const [selectedForAI, setSelectedForAI] = useState<Set<string>>(new Set());
  const [aiProvider, setAiProvider] = useState<"veo" | "higgsfield">(() => (initialSettings?.aiProvider as "veo" | "higgsfield") || "veo");
  const [veoModel, setVeoModel] = useState<string>(() => (initialSettings?.veoModel as string) || "3.1-fast");
  const [higgsModel, setHiggsModel] = useState<string>(() => (initialSettings?.higgsModel as string) || "dop-standard");
  const [higgsImageModel, setHiggsImageModel] = useState<string>(() => (initialSettings?.higgsImageModel as string) || "soul-standard");
  const [lastFramePrompt, setLastFramePrompt] = useState<string>("");
  const [editingPrompts, setEditingPrompts] = useState<Record<string, string>>({});
  const [expandedPrompts, setExpandedPrompts] = useState<Set<string>>(new Set());
  const [showTextCreator, setShowTextCreator] = useState(false);
  const [newTextContent, setNewTextContent] = useState("");
  const [newTextTimestamp, setNewTextTimestamp] = useState<number | null>(null);
  const [newTextExcerpt, setNewTextExcerpt] = useState("");
  const [newTextDuration, setNewTextDuration] = useState([3]);
  const mountedRef = useRef(false);

  // AI video generation states
  const [generatingAI, setGeneratingAI] = useState<Set<string>>(new Set());
  const [aiProgress, setAiProgress] = useState<Record<string, AIProgressInfo>>({});

  // Persist settings on change (skip initial mount)
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (!onSettingsChange) return;
    onSettingsChange({
      suggestions: suggestions,
      frequency: frequency[0],
      duration: duration[0],
      aiProvider,
      veoModel,
      higgsModel,
      higgsImageModel,
    });
  }, [suggestions, frequency, duration, aiProvider, veoModel, higgsModel, higgsImageModel]);

  const handlePlayPause = useCallback(() => setIsPlaying((p) => !p), []);

  const updateSuggestion = (id: string, status: "accepted" | "rejected") => {
    const sug = suggestions.find(s => s.id === id);
    setSuggestions(prev => prev.map(s => s.id === id ? { ...s, status } : s));
    if (status === "accepted" && sug) {
      setCurrentTime(sug.timestamp);
      toast.success(`B-Roll aceito em ${formatTime(sug.timestamp)}`);
    } else if (status === "rejected" && sug) {
      toast(`B-Roll rejeitado em ${formatTime(sug.timestamp)}`);
    }
  };

  const undoSuggestion = (id: string) => {
    setSuggestions(prev => prev.map(s => s.id === id ? { ...s, status: "pending" as any } : s));
  };

  const fetchThumbnails = async (suggestion: BRollSuggestionWithKeywords) => {
    if (!suggestion.keywords || suggestion.keywords.length === 0 || suggestion.category === "text") return;

    setLoadingThumbnails(prev => new Set(prev).add(suggestion.id));
    try {
      const { data, error } = await supabase.functions.invoke("search-stock-media", {
        body: { keywords: suggestion.keywords, category: suggestion.category, perPage: 3 },
      });
      if (error) throw error;
      if (data?.thumbnails) {
        setSuggestions(prev =>
          prev.map(s =>
            s.id === suggestion.id
              ? { ...s, thumbnails: data.thumbnails, mediaUrls: data.mediaUrls || [], source: "Pexels" }
              : s
          )
        );
      }
    } catch (e) {
      console.error("Thumbnail fetch error:", e);
    } finally {
      setLoadingThumbnails(prev => {
        const next = new Set(prev);
        next.delete(suggestion.id);
        return next;
      });
    }
  };

  // SSE-based AI video generation via VEO or Higgsfield
  const invokeGenerateBrollSSE = async (suggestionId: string, prompt: string, keywords: string[] = [], videoDuration: number = 5, aspectRatio: string = "9:16") => {
    setGeneratingAI(prev => new Set(prev).add(suggestionId));
    setAiProgress(prev => ({ ...prev, [suggestionId]: { phase: "starting", message: "Iniciando...", percent: 0 } }));

    const isHiggsfield = aiProvider === "higgsfield";
    const functionName = isHiggsfield ? "generate-broll-higgsfield" : "generate-broll-video";
    const model = isHiggsfield ? higgsModel : veoModel;
    const providerLabel = isHiggsfield ? "Higgsfield" : `VEO ${veoModel}`;

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`,
          apikey: supabaseKey,
        },
        body: JSON.stringify({ prompt, duration: isHiggsfield ? (videoDuration <= 7 ? 5 : 10) : videoDuration, keywords, model, aspectRatio, ...(isHiggsfield && { imageModel: higgsImageModel }), ...(isHiggsfield && lastFramePrompt.trim() && { lastFramePrompt: lastFramePrompt.trim() }) }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ") && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));

              if (currentEvent === "progress") {
                setAiProgress(prev => ({ ...prev, [suggestionId]: data }));
              } else if (currentEvent === "complete") {
                setSuggestions(prev =>
                  prev.map(s =>
                    s.id === suggestionId
                      ? { ...s, aiVideoUrl: data.videoUrl, category: "ai", source: providerLabel }
                      : s
                  )
                );
                toast.success(`Vídeo B-Roll gerado com ${providerLabel}!`);
              } else if (currentEvent === "error") {
                toast.error(data.message || "Erro na geração de vídeo.");
              }
            } catch {
              // ignore parse errors
            }
            currentEvent = "";
          }
        }
      }
    } catch (e: any) {
      console.error("AI video generation error:", e);
      toast.error("Erro ao gerar vídeo com IA.");
    } finally {
      setGeneratingAI(prev => {
        const next = new Set(prev);
        next.delete(suggestionId);
        return next;
      });
    }
  };

  // Generate AI video for a specific suggestion
  const handleGenerateAIForSuggestion = async (suggestion: BRollSuggestionWithKeywords) => {
    // Use edited prompt if available, otherwise use veoPrompt from AI, otherwise fallback
    const prompt = editingPrompts[suggestion.id] || suggestion.veoPrompt || suggestion.context || "cinematic B-roll footage";
    await invokeGenerateBrollSSE(suggestion.id, prompt, suggestion.keywords, duration[0], "9:16");
  };

  const handleGenerate = async () => {
    if (!transcription?.segments || transcription.segments.length === 0) {
      toast.error("Nenhuma transcrição disponível. Faça upload e transcreva um vídeo primeiro.");
      return;
    }

    setIsGenerating(true);
    setSuggestions([]);

    try {
      const { data, error } = await supabase.functions.invoke("suggest-broll", {
        body: {
          segments: transcription.segments,
          frequency: frequency[0],
          defaultDuration: duration[0],
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const newSuggestions: BRollSuggestionWithKeywords[] = data.suggestions || [];
      setSuggestions(newSuggestions);
      toast.success(`${newSuggestions.length} sugestões de B-Roll geradas!`);

      for (const sug of newSuggestions) {
        fetchThumbnails(sug);
      }
    } catch (e: any) {
      console.error("Generate B-Roll error:", e);
      if (e?.message?.includes("429") || e?.status === 429) {
        toast.error("Limite de requisições excedido. Tente novamente em alguns segundos.");
      } else if (e?.message?.includes("402") || e?.status === 402) {
        toast.error("Créditos insuficientes. Adicione créditos ao seu workspace.");
      } else {
        toast.error("Erro ao gerar sugestões de B-Roll.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSearchMedia = async (suggestion: BRollSuggestionWithKeywords) => {
    await fetchThumbnails(suggestion);
  };

  const toggleSelectForAI = (id: string) => {
    setSelectedForAI(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const pendingSugs = suggestions.filter(s => !s.aiVideoUrl && !generatingAI.has(s.id));
    if (selectedForAI.size === pendingSugs.length && pendingSugs.length > 0) {
      setSelectedForAI(new Set());
    } else {
      setSelectedForAI(new Set(pendingSugs.map(s => s.id)));
    }
  };

  const handleBatchGenerateAI = async () => {
    const toGenerate = suggestions.filter(s => selectedForAI.has(s.id));
    if (toGenerate.length === 0) return;
    setSelectedForAI(new Set());
    for (const sug of toGenerate) {
      handleGenerateAIForSuggestion(sug);
    }
    toast.success(`Gerando ${toGenerate.length} vídeo(s) com IA...`);
  };

  const filtered = activeCategory === "all" ? suggestions : suggestions.filter(s => s.category === activeCategory);
  const hasTranscription = transcription && transcription.segments.length > 0;
  const isAITab = activeCategory === "ai";
  const isTextTab = activeCategory === "text";
  const aiGenerated = suggestions.filter(s => s.aiVideoUrl);
  const speechSegments = transcription?.segments?.filter(s => s.type === "speech") || [];

  const handleCreateTextSuggestion = () => {
    if (!newTextContent.trim() || newTextTimestamp === null) return;
    const newSuggestion: BRollSuggestionWithKeywords = {
      id: `br-text-${Date.now()}`,
      timestamp: newTextTimestamp,
      duration: newTextDuration[0],
      context: newTextContent.trim(),
      transcriptExcerpt: newTextExcerpt,
      category: "text",
      status: "pending" as any,
      source: "Manual",
      thumbnails: [],
      keywords: [],
    };
    setSuggestions(prev => [...prev, newSuggestion]);
    setShowTextCreator(false);
    setNewTextContent("");
    setNewTextTimestamp(null);
    setNewTextExcerpt("");
    setNewTextDuration([3]);
    toast.success(`Texto B-Roll criado em ${formatTime(newTextTimestamp)}`);
  };
  const pendingForAI = suggestions.filter(s => !s.aiVideoUrl && !generatingAI.has(s.id));
  const allPendingSelected = pendingForAI.length > 0 && selectedForAI.size === pendingForAI.length;

  return (
    <TooltipProvider>
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 flex min-h-0">
          {/* Left — Controls */}
          <div className="w-72 border-r border-border bg-card flex-shrink-0 flex flex-col min-h-0">
            <ScrollArea className="flex-1">
              <div className="space-y-4 p-3">
                <Button
                  className="w-full gap-2"
                  size="sm"
                  onClick={handleGenerate}
                  disabled={isGenerating || !hasTranscription}
                >
                  {isGenerating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  {isGenerating ? "Gerando..." : "Gerar Sugestões de B-Roll"}
                </Button>

                {!hasTranscription && (
                  <p className="text-[10px] text-muted-foreground text-center">
                    Faça upload e transcreva um vídeo para gerar sugestões.
                  </p>
                )}

                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Frequência</label>
                  <Slider value={frequency} onValueChange={setFrequency} max={100} step={1} />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Menos</span><span>Mais</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Duração Padrão: {duration[0]}s</label>
                  <Slider value={duration} onValueChange={setDuration} min={1} max={8} step={0.5} />
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Motor de IA</label>
                  <Select value={aiProvider} onValueChange={(v) => setAiProvider(v as "veo" | "higgsfield")}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="veo">🎬 VEO (Google)</SelectItem>
                      <SelectItem value="higgsfield">🚀 Higgsfield</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">
                    Modelo {aiProvider === "veo" ? "VEO" : "Higgsfield"}
                  </label>
                  {aiProvider === "veo" ? (
                    <Select value={veoModel} onValueChange={setVeoModel}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3.1-fast">⚡ VEO 3.1 Fast</SelectItem>
                        <SelectItem value="3.1">✨ VEO 3.1 (Qualidade)</SelectItem>
                        <SelectItem value="3.0-fast">⚡ VEO 3.0 Fast</SelectItem>
                        <SelectItem value="3.0">✨ VEO 3.0 (Estável)</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <>
                      <Select value={higgsModel} onValueChange={setHiggsModel}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="dop-lite">⚡ DoP Lite</SelectItem>
                          <SelectItem value="dop-standard">🎥 DoP Standard</SelectItem>
                          <SelectItem value="dop-turbo">🚀 DoP Turbo</SelectItem>
                          <SelectItem value="dop-lite-flf">⚡ DoP Lite FLF</SelectItem>
                          <SelectItem value="dop-standard-flf">🎥 DoP Standard FLF</SelectItem>
                          <SelectItem value="dop-turbo-flf">🚀 DoP Turbo FLF</SelectItem>
                          <SelectItem value="kling-2.1-pro">🎬 Kling 2.1 Pro</SelectItem>
                          <SelectItem value="seedance-1.0-pro">💃 Seedance 1.0 Pro</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="mt-1">
                        <label className="text-[10px] text-muted-foreground mb-1 block">Modelo de Imagem</label>
                        <Select value={higgsImageModel} onValueChange={setHiggsImageModel}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="soul-standard">🎨 Soul Standard</SelectItem>
                            <SelectItem value="popcorn-auto">🍿 Popcorn Auto</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {higgsModel.includes("flf") && (
                        <div className="mt-1">
                          <label className="text-[10px] text-muted-foreground mb-1 block">Prompt do último frame (opcional)</label>
                          <Textarea
                            placeholder="Descreva como o último frame deve ser..."
                            value={lastFramePrompt}
                            onChange={(e) => setLastFramePrompt(e.target.value)}
                            className="min-h-[48px] text-xs resize-none"
                            rows={2}
                          />
                          <p className="text-[9px] text-muted-foreground mt-0.5">Se vazio, será gerado automaticamente.</p>
                        </div>
                      )}
                    </>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    {aiProvider === "veo"
                      ? (veoModel.includes("fast") ? "Geração rápida" : "Qualidade máxima, mais lento") +
                        (veoModel.startsWith("3.1") ? " — modelo mais recente" : " — modelo estável")
                      : higgsModel === "dop-lite"
                        ? "DoP Lite — rápido e econômico, qualidade básica"
                        : higgsModel === "dop-standard"
                          ? "DoP Standard — equilíbrio entre qualidade e velocidade"
                          : higgsModel === "dop-turbo"
                            ? "DoP Turbo — máxima qualidade, mais lento"
                            : higgsModel === "dop-lite-flf"
                              ? "DoP Lite FLF — controla início e fim do clipe"
                              : higgsModel === "dop-standard-flf"
                                ? "DoP Standard FLF — transições suaves entre clipes"
                                : higgsModel === "dop-turbo-flf"
                                  ? "DoP Turbo FLF — máxima qualidade com controle de frames"
                                  : higgsModel === "kling-2.1-pro"
                                    ? "Kling 2.1 Pro — alta qualidade cinematográfica"
                                    : "Seedance 1.0 Pro — movimento fluido e natural"
                    }
                  </p>
                </div>

                {/* Transitions */}
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Transições</label>
                  <div className="grid grid-cols-3 gap-1">
                    {transitionPresets.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setActiveTransition(t.id)}
                        className={cn(
                          "flex flex-col items-center p-1.5 rounded border transition-all text-center",
                          activeTransition === t.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                        )}
                      >
                        <span className="text-sm">{t.icon}</span>
                        <span className="text-[8px] text-muted-foreground">{t.name}</span>
                      </button>
                    ))}
                  </div>
                  <TransitionPreview transition={activeTransition} duration={transitionDuration[0]} />
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">Duração da transição: {transitionDuration[0]}s</label>
                    <Slider value={transitionDuration} onValueChange={setTransitionDuration} min={0.2} max={1} step={0.1} />
                  </div>
                </div>
              </div>
            </ScrollArea>
          </div>

          {/* Center — Preview */}
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            <div className="flex-1 flex items-center justify-center p-4 min-h-0">
              <VideoPreview currentTime={currentTime} onTimeChange={setCurrentTime} isPlaying={isPlaying} onPlayPause={handlePlayPause} videoUrl={videoUrl} brollSuggestions={suggestions} transition={activeTransition} transitionDuration={transitionDuration[0]} onVideoError={onVideoError} isLoadingUrl={isLoadingUrl} />
            </div>
          </div>

          {/* Right — Suggestions */}
          <div className="w-80 border-l border-border bg-card flex-shrink-0 flex flex-col min-h-0">
            <div className="px-3 py-2 border-b border-border space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sugestões de B-Roll</h3>
                {suggestions.length > 0 && (
                  <Badge variant="secondary" className="text-[10px]">
                    {suggestions.filter(s => s.status === "accepted").length}/{suggestions.length}
                  </Badge>
                )}
              </div>
              <div className="flex gap-1">
                {BROLL_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                      activeCategory === cat.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
                    )}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-3">
                {/* AI Tab — selection mode */}
                {isAITab ? (
                  <>
                    {suggestions.length === 0 && !isGenerating && (
                      <div className="text-center py-8 space-y-2">
                        <Bot className="w-8 h-8 text-muted-foreground/30 mx-auto" />
                        <p className="text-xs text-muted-foreground">
                          Gere sugestões de B-Roll primeiro, depois selecione os trechos para gerar vídeos com IA.
                        </p>
                      </div>
                    )}

                    {suggestions.length > 0 && (
                      <>
                        {/* Select all + generate button */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors">
                              <Checkbox
                                checked={allPendingSelected}
                                onCheckedChange={toggleSelectAll}
                                disabled={pendingForAI.length === 0}
                              />
                              Selecionar Todos
                            </label>
                            <span className="text-[10px] text-muted-foreground">
                              {selectedForAI.size} selecionado(s)
                            </span>
                          </div>

                          <Button
                            className="w-full gap-2"
                            size="sm"
                            onClick={handleBatchGenerateAI}
                            disabled={selectedForAI.size === 0 || generatingAI.size > 0}
                          >
                            {generatingAI.size > 0 ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Bot className="w-4 h-4" />
                            )}
                            {generatingAI.size > 0
                              ? `Gerando ${generatingAI.size} vídeo(s)...`
                              : `Gerar ${selectedForAI.size} Vídeo(s) com IA`}
                          </Button>
                        </div>

                        {/* Selectable suggestion list */}
                        <div className="space-y-1.5">
                          {suggestions.map((sug) => {
                            const isGenerated = !!sug.aiVideoUrl;
                            const isCurrentlyGenerating = generatingAI.has(sug.id);

                            if (isGenerated || isCurrentlyGenerating) return null;

                            return (
                              <div
                                key={sug.id}
                                className={cn(
                                  "rounded-lg border transition-all",
                                  selectedForAI.has(sug.id)
                                    ? "border-primary bg-primary/5"
                                    : "border-border hover:border-primary/40"
                                )}
                              >
                                <label
                                  className="flex items-start gap-2 p-2 cursor-pointer"
                                >
                                  <Checkbox
                                    checked={selectedForAI.has(sug.id)}
                                    onCheckedChange={() => toggleSelectForAI(sug.id)}
                                    className="mt-0.5"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-mono text-muted-foreground">{formatTime(sug.timestamp)}</span>
                                      <span className="text-[10px] text-muted-foreground">• {sug.duration}s</span>
                                    </div>
                                    <p className="text-xs text-foreground mt-0.5 line-clamp-2">{sug.context}</p>
                                    {sug.transcriptExcerpt && (
                                      <p className="text-[10px] text-muted-foreground italic mt-0.5 line-clamp-1">
                                        "{sug.transcriptExcerpt}"
                                      </p>
                                    )}
                                  </div>
                                </label>
                                {/* Collapsible prompt editor */}
                                <div className="px-2 pb-2">
                                  <button
                                    onClick={(e) => {
                                      e.preventDefault();
                                      setExpandedPrompts(prev => {
                                        const next = new Set(prev);
                                        if (next.has(sug.id)) next.delete(sug.id); else next.add(sug.id);
                                        return next;
                                      });
                                      if (!editingPrompts[sug.id] && sug.veoPrompt) {
                                        setEditingPrompts(prev => ({ ...prev, [sug.id]: sug.veoPrompt! }));
                                      }
                                    }}
                                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                                  >
                                    {expandedPrompts.has(sug.id) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                    <Pencil className="w-2.5 h-2.5" />
                                    Prompt IA
                                  </button>
                                  {expandedPrompts.has(sug.id) && (
                                    <Textarea
                                      value={editingPrompts[sug.id] || sug.veoPrompt || ""}
                                      onChange={(e) => setEditingPrompts(prev => ({ ...prev, [sug.id]: e.target.value }))}
                                      className="mt-1 text-[10px] min-h-[60px] bg-background/50 border-border/50 resize-y"
                                      placeholder="Prompt cinematográfico para geração de vídeo..."
                                    />
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Currently generating */}
                        {Array.from(generatingAI).map(id => {
                          const sug = suggestions.find(s => s.id === id);
                          if (!sug) return null;
                          return (
                            <div key={id} className="rounded-lg border border-primary/30 bg-primary/5 p-2 space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono text-muted-foreground">{formatTime(sug.timestamp)}</span>
                                <Badge variant="secondary" className="text-[8px] px-1 py-0">Gerando...</Badge>
                              </div>
                              <p className="text-xs text-foreground line-clamp-1">{sug.context}</p>
                              {aiProgress[id] && (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <Loader2 className="w-3 h-3 text-primary animate-spin" />
                                    <span className="text-[10px] text-muted-foreground">{aiProgress[id].message}</span>
                                  </div>
                                  <Progress value={aiProgress[id].percent} className="h-1" />
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* Generated videos */}
                        {aiGenerated.length > 0 && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <div className="h-px flex-1 bg-border" />
                              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Gerados ({aiGenerated.length})</span>
                              <div className="h-px flex-1 bg-border" />
                            </div>
                            {aiGenerated.map((sug) => (
                              <div key={sug.id} className={cn(
                                "rounded-lg border p-2 space-y-2 transition-all",
                                sug.status === "accepted" && "border-green-500/50 bg-green-500/10",
                                sug.status === "rejected" && "border-destructive/30 bg-destructive/5 opacity-50",
                                sug.status !== "accepted" && sug.status !== "rejected" && "border-primary/20"
                              )}>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-mono text-muted-foreground">{formatTime(sug.timestamp)}</span>
                                  <div className="flex items-center gap-1">
                                    {sug.status === "accepted" && (
                                      <Badge className="text-[8px] px-1.5 py-0 bg-green-500/20 text-green-400 border-green-500/30">
                                        <Check className="w-2.5 h-2.5 mr-0.5" /> Aceito
                                      </Badge>
                                    )}
                                    {sug.status === "rejected" && (
                                      <Badge variant="destructive" className="text-[8px] px-1.5 py-0">
                                        <X className="w-2.5 h-2.5 mr-0.5" /> Rejeitado
                                      </Badge>
                                    )}
                                    <Badge variant="secondary" className="text-[8px] px-1 py-0">{sug.source || "IA"}</Badge>
                                  </div>
                                </div>
                                <p className="text-xs text-foreground line-clamp-1">{sug.context}</p>
                                <div className="rounded-lg overflow-hidden border border-primary/30">
                                  <video
                                    src={sug.aiVideoUrl}
                                    className="w-full aspect-video object-cover"
                                    controls
                                    muted
                                    loop
                                  />
                                  <div className="px-2 py-1 bg-primary/5 flex items-center gap-1">
                                    <Bot className="w-3 h-3 text-primary" />
                                    <span className="text-[9px] text-primary font-medium">Gerado com {sug.source || "IA"}</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  {sug.status === "accepted" || sug.status === "rejected" ? (
                                    <Button variant="outline" size="sm" className="h-6 text-xs gap-1 flex-1" onClick={() => undoSuggestion(sug.id)}>
                                      Desfazer
                                    </Button>
                                  ) : (
                                    <>
                                      <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 flex-1 hover:bg-green-500/20 hover:text-green-400" onClick={() => updateSuggestion(sug.id, "accepted")}>
                                        <Check className="w-3 h-3" /> Aceitar
                                      </Button>
                                      <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 flex-1 hover:bg-destructive/20 hover:text-destructive" onClick={() => updateSuggestion(sug.id, "rejected")}>
                                        <X className="w-3 h-3" /> Rejeitar
                                      </Button>
                                    </>
                                  )}
                                </div>
                                {sug.status === "accepted" && sug.category !== "text" && (
                                  <div className="space-y-1">
                                    <label className="text-[10px] text-muted-foreground">Posição focal</label>
                                    <div className="grid grid-cols-3 gap-0.5 w-16">
                                      {CROP_POSITIONS.map((pos) => (
                                        <button
                                          key={pos.value}
                                          onClick={() => setSuggestions(prev => prev.map(s => s.id === sug.id ? { ...s, cropPosition: pos.value } : s))}
                                          className={cn(
                                            "w-5 h-5 rounded text-[9px] flex items-center justify-center transition-colors",
                                            (sug.cropPosition || "50% 50%") === pos.value
                                              ? "bg-primary text-primary-foreground"
                                              : "bg-muted text-muted-foreground hover:bg-accent"
                                          )}
                                        >
                                          {pos.label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <>
                    {/* "Inserir Texto" button for text tab */}
                    {isTextTab && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full gap-2"
                          onClick={() => setShowTextCreator(true)}
                          disabled={showTextCreator}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <Type className="w-3.5 h-3.5" />
                          Inserir Texto
                        </Button>

                        {showTextCreator && (
                          <div className="rounded-lg border border-primary/40 bg-card p-3 space-y-3">
                            <h4 className="text-xs font-semibold text-foreground">Criar Texto B-Roll</h4>

                            {/* Segment selector */}
                            <div className="space-y-1.5">
                              <label className="text-[10px] text-muted-foreground font-medium">Selecione um trecho da transcrição</label>
                              {speechSegments.length > 0 ? (
                                <ScrollArea className="max-h-32 rounded border border-border">
                                  <div className="p-1 space-y-0.5">
                                    {speechSegments.map((seg) => (
                                      <button
                                        key={seg.id}
                                        onClick={() => {
                                          setNewTextTimestamp(seg.start);
                                          setNewTextExcerpt(seg.text);
                                          if (!newTextContent) setNewTextContent(seg.text);
                                        }}
                                        className={cn(
                                          "w-full text-left px-2 py-1.5 rounded text-xs transition-colors",
                                          newTextTimestamp === seg.start
                                            ? "bg-primary/10 text-foreground ring-1 ring-primary/30"
                                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                                        )}
                                      >
                                        <span className="font-mono text-[10px] text-muted-foreground mr-2">{formatTime(seg.start)}</span>
                                        <span className="line-clamp-1">{seg.text}</span>
                                      </button>
                                    ))}
                                  </div>
                                </ScrollArea>
                              ) : (
                                <p className="text-[10px] text-muted-foreground italic">Nenhuma transcrição disponível.</p>
                              )}
                            </div>

                            {/* Text content */}
                            <div className="space-y-1.5">
                              <label className="text-[10px] text-muted-foreground font-medium">Texto do overlay</label>
                              <Input
                                value={newTextContent}
                                onChange={(e) => setNewTextContent(e.target.value)}
                                placeholder="Digite o texto que será exibido..."
                                className="h-8 text-xs"
                              />
                            </div>

                            {/* Duration */}
                            <div className="space-y-1.5">
                              <label className="text-[10px] text-muted-foreground font-medium">Duração: {newTextDuration[0]}s</label>
                              <Slider value={newTextDuration} onValueChange={setNewTextDuration} min={1} max={8} step={0.5} />
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                className="flex-1 h-7 text-xs gap-1"
                                onClick={handleCreateTextSuggestion}
                                disabled={!newTextContent.trim() || newTextTimestamp === null}
                              >
                                <Check className="w-3 h-3" /> Criar
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 h-7 text-xs gap-1"
                                onClick={() => {
                                  setShowTextCreator(false);
                                  setNewTextContent("");
                                  setNewTextTimestamp(null);
                                  setNewTextExcerpt("");
                                  setNewTextDuration([3]);
                                }}
                              >
                                <X className="w-3 h-3" /> Cancelar
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Normal tabs — existing card view */}
                    {filtered.length === 0 && !isGenerating && !showTextCreator && (
                      <div className="text-center py-8 space-y-2">
                        <Film className="w-8 h-8 text-muted-foreground/30 mx-auto" />
                        <p className="text-xs text-muted-foreground">
                          {isTextTab
                            ? "Nenhum texto ainda. Clique em \"Inserir Texto\" para criar."
                            : "Nenhuma sugestão ainda. Clique em \"Gerar Sugestões\" para começar."}
                        </p>
                      </div>
                    )}

                    {isGenerating && (
                      <div className="text-center py-8 space-y-2">
                        <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
                        <p className="text-xs text-muted-foreground">Analisando transcrição...</p>
                      </div>
                    )}

                    {filtered.map((sug) => (
                      <div key={sug.id} className={cn(
                        "rounded-lg border p-2 space-y-2 transition-all",
                        sug.status === "accepted" && "border-green-500/50 bg-green-500/10",
                        sug.status === "rejected" && "border-destructive/30 bg-destructive/5 opacity-50",
                        sug.status !== "accepted" && sug.status !== "rejected" && "border-border"
                      )}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono text-muted-foreground">{formatTime(sug.timestamp)}</span>
                          <div className="flex items-center gap-1">
                            {sug.status === "accepted" && (
                              <Badge className="text-[8px] px-1.5 py-0 bg-green-500/20 text-green-400 border-green-500/30">
                                <Check className="w-2.5 h-2.5 mr-0.5" /> Aceito
                              </Badge>
                            )}
                            {sug.status === "rejected" && (
                              <Badge variant="destructive" className="text-[8px] px-1.5 py-0">
                                <X className="w-2.5 h-2.5 mr-0.5" /> Rejeitado
                              </Badge>
                            )}
                            {sug.source && <Badge variant="secondary" className="text-[8px] px-1 py-0">{sug.source}</Badge>}
                          </div>
                        </div>

                        <p className="text-xs text-foreground">{sug.context}</p>
                        {sug.transcriptExcerpt && (
                          <p className="text-[10px] text-muted-foreground italic border-l-2 border-primary/30 pl-1.5 mt-0.5">
                            "{sug.transcriptExcerpt}"
                          </p>
                        )}

                        {generatingAI.has(sug.id) && aiProgress[sug.id] && (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Loader2 className="w-3 h-3 text-primary animate-spin" />
                              <span className="text-[10px] text-muted-foreground">{aiProgress[sug.id].message}</span>
                            </div>
                            <Progress value={aiProgress[sug.id].percent} className="h-1" />
                          </div>
                        )}

                        {sug.aiVideoUrl && sug.category === "ai" && (
                          <div className="rounded-lg overflow-hidden border border-primary/30">
                            <video src={sug.aiVideoUrl} className="w-full aspect-video object-cover" controls muted loop />
                            <div className="px-2 py-1 bg-primary/5 flex items-center gap-1">
                              <Bot className="w-3 h-3 text-primary" />
                              <span className="text-[9px] text-primary font-medium">Gerado com {sug.source || "IA"}</span>
                            </div>
                          </div>
                        )}

                        {loadingThumbnails.has(sug.id) && (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
                          </div>
                        )}

                        {!loadingThumbnails.has(sug.id) && sug.thumbnails.length > 0 && (
                          <div className="flex gap-1">
                            {sug.thumbnails.map((thumb, i) => (
                              <div
                                key={i}
                                className={cn(
                                  "flex-1 aspect-[9/16] rounded overflow-hidden border-2 cursor-pointer transition-all",
                                  i === (sug.selectedIndex ?? 0) ? "border-primary" : "border-transparent hover:border-primary/40"
                                )}
                                onClick={() => setSuggestions(prev => prev.map(s => s.id === sug.id ? { ...s, selectedIndex: i } : s))}
                              >
                                <img src={thumb} alt="" className="w-full h-full object-cover" />
                              </div>
                            ))}
                          </div>
                        )}

                        {sug.category === "text" && (
                          <div className="bg-black/60 rounded-lg aspect-video flex items-center justify-center">
                            <span className="text-sm font-bold text-primary">{sug.transcriptExcerpt || sug.context}</span>
                          </div>
                        )}

                        <div className="flex items-center gap-1">
                          {sug.status === "accepted" || sug.status === "rejected" ? (
                            <Button variant="outline" size="sm" className="h-6 text-xs gap-1 flex-1" onClick={() => undoSuggestion(sug.id)}>
                              Desfazer
                            </Button>
                          ) : (
                            <>
                              <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 flex-1 hover:bg-green-500/20 hover:text-green-400" onClick={() => updateSuggestion(sug.id, "accepted")}>
                                <Check className="w-3 h-3" /> Aceitar
                              </Button>
                              <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 flex-1 hover:bg-destructive/20 hover:text-destructive" onClick={() => updateSuggestion(sug.id, "rejected")}>
                                <X className="w-3 h-3" /> Rejeitar
                              </Button>
                            </>
                          )}
                          <Button variant="ghost" size="icon" className="h-6 w-6" title="Buscar" onClick={() => handleSearchMedia(sug)}>
                            <Search className="w-3 h-3" />
                          </Button>
                        </div>
                        {sug.status === "accepted" && sug.category !== "text" && (
                          <div className="space-y-1">
                            <label className="text-[10px] text-muted-foreground">Posição focal</label>
                            <div className="grid grid-cols-3 gap-0.5 w-16">
                              {CROP_POSITIONS.map((pos) => (
                                <button
                                  key={pos.value}
                                  onClick={() => setSuggestions(prev => prev.map(s => s.id === sug.id ? { ...s, cropPosition: pos.value } : s))}
                                  className={cn(
                                    "w-5 h-5 rounded text-[9px] flex items-center justify-center transition-colors",
                                    (sug.cropPosition || "50% 50%") === pos.value
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-muted text-muted-foreground hover:bg-accent"
                                  )}
                                >
                                  {pos.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <div className="flex-shrink-0 px-3 pb-3">
          <Timeline
            currentTime={currentTime}
            onTimeChange={setCurrentTime}
            zoom={zoom}
            onZoomChange={setZoom}
            brollSuggestions={suggestions}
            videoUrl={videoUrl}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}
