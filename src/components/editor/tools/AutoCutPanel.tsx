import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { suggestedCuts, formatTime, type SuggestedCut } from "@/data/mockData";

export function AutoCutPanel() {
  const [removeSilences, setRemoveSilences] = useState(true);
  const [removeFillers, setRemoveFillers] = useState(true);
  const [removeBadTakes, setRemoveBadTakes] = useState(false);
  const [sensitivity, setSensitivity] = useState([50]);
  const [fillerWords] = useState(["hm", "éh", "tipo", "né", "basicamente", "na verdade", "então", "certo"]);
  const [cuts, setCuts] = useState<SuggestedCut[]>(suggestedCuts);

  const updateCut = (id: string, status: "accepted" | "rejected") => {
    setCuts(cuts.map(c => c.id === id ? { ...c, status } : c));
  };

  const typeIcon = (type: string) => {
    if (type === "silence") return "🔇";
    if (type === "filler") return "💬";
    return "🎬";
  };

  return (
    <div className="space-y-4 p-4">
      <div className="space-y-2.5">
        <div className="flex items-center gap-3 py-1">
          <Switch checked={removeSilences} onCheckedChange={setRemoveSilences} />
          <div className="flex flex-col">
            <label className="text-sm font-medium leading-tight">Silêncios</label>
            <span className="text-[10px] text-muted-foreground">Remover trechos sem fala</span>
          </div>
        </div>
        <div className="flex items-center gap-3 py-1">
          <Switch checked={removeFillers} onCheckedChange={setRemoveFillers} />
          <div className="flex flex-col">
            <label className="text-sm font-medium leading-tight">Preenchimento</label>
            <span className="text-[10px] text-muted-foreground">Remover "hm", "tipo", "né"…</span>
          </div>
        </div>
        <div className="flex items-center gap-3 py-1">
          <Switch checked={removeBadTakes} onCheckedChange={setRemoveBadTakes} />
          <div className="flex flex-col">
            <label className="text-sm font-medium leading-tight">Tomadas Ruins</label>
            <span className="text-[10px] text-muted-foreground">Detectar repetições e erros</span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">Limiar de Silêncio</label>
        <Slider value={sensitivity} onValueChange={setSensitivity} max={100} step={1} />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>Agressivo</span><span>Conservador</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Palavras de Preenchimento</label>
        <div className="flex flex-wrap gap-1">
          {fillerWords.map((w) => (
            <Badge key={w} variant="secondary" className="text-[10px] gap-1 cursor-pointer">
              {w} <X className="w-2.5 h-2.5" />
            </Badge>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs text-muted-foreground">Cortes Sugeridos</label>
          <span className="text-[10px] text-muted-foreground">{cuts.filter(c => c.status === "accepted").length}/{cuts.length}</span>
        </div>
        <ScrollArea className="h-48">
          <div className="space-y-1">
            {cuts.map((cut) => (
              <div
                key={cut.id}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded text-xs",
                  cut.status === "accepted" && "bg-[hsl(var(--segment-speech))]/5",
                  cut.status === "rejected" && "bg-surface-raised opacity-50",
                  cut.status === "pending" && "bg-[hsl(var(--segment-broll))]/5"
                )}
              >
                <span>{typeIcon(cut.type)}</span>
                <span className="font-mono text-muted-foreground w-10">{formatTime(cut.start)}</span>
                <span className="flex-1 truncate">{cut.text}</span>
                {cut.status === "pending" ? (
                  <div className="flex gap-0.5">
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => updateCut(cut.id, "accepted")}>
                      <Check className="w-3 h-3 text-[hsl(var(--segment-speech))]" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => updateCut(cut.id, "rejected")}>
                      <X className="w-3 h-3 text-[hsl(var(--segment-removed))]" />
                    </Button>
                  </div>
                ) : (
                  <span className="text-[10px] text-muted-foreground">{cut.status === "accepted" ? "aceito" : "rejeitado"}</span>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
