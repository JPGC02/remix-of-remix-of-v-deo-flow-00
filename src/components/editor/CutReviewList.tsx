import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Check, X, CheckCheck, XCircle, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WordSegment } from "@/data/mockData";

export interface CutRegion {
  id: string;
  type: "silence" | "filler" | "bad_take";
  start: number;
  end: number;
  text: string;
  wordIds: string[];
}

interface CutReviewListProps {
  wordSegments: WordSegment[];
  segmentStatuses: Record<string, "kept" | "removed">;
  onAccept: (wordIds: string[]) => void;
  onReject: (wordIds: string[]) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onNavigate: (time: number) => void;
  currentTime: number;
  onRestoreAll?: () => void;
}

const TYPE_ICON: Record<CutRegion["type"], string> = {
  silence: "🔇",
  filler: "💬",
  bad_take: "🎬",
};

const TYPE_LABEL: Record<CutRegion["type"], string> = {
  silence: "Silêncio",
  filler: "Preenchimento",
  bad_take: "Erro/Repetição",
};

function formatTimestamp(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 100);
  return `${m}:${sec.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

export function buildCutRegions(
  wordSegments: WordSegment[],
  segmentStatuses: Record<string, "kept" | "removed">
): CutRegion[] {
  const sorted = [...wordSegments].sort((a, b) => a.start - b.start);
  const regions: CutRegion[] = [];
  let current: { words: WordSegment[] } | null = null;

  for (const ws of sorted) {
    const isRemoved = segmentStatuses[ws.id] === "removed";
    if (!isRemoved) {
      if (current) {
        regions.push(finalizeRegion(current.words, regions.length));
        current = null;
      }
      continue;
    }
    if (current) {
      const gap = ws.start - current.words[current.words.length - 1].end;
      if (gap > 0.15) {
        regions.push(finalizeRegion(current.words, regions.length));
        current = { words: [ws] };
      } else {
        current.words.push(ws);
      }
    } else {
      current = { words: [ws] };
    }
  }
  if (current) regions.push(finalizeRegion(current.words, regions.length));
  return regions;
}

function finalizeRegion(words: WordSegment[], index: number): CutRegion {
  const silences = words.filter(w => w.type === "silence").length;
  const fillers = words.filter(w => w.type === "filler").length;
  const speech = words.filter(w => w.type === "speech").length;

  let type: CutRegion["type"] = "bad_take";
  if (silences > fillers && silences >= speech) type = "silence";
  else if (fillers > 0 && fillers >= speech) type = "filler";

  const text = words
    .filter(w => w.type !== "silence")
    .map(w => w.text)
    .join(" ")
    .trim();

  return {
    id: `cr-${index}`,
    type,
    start: words[0].start,
    end: words[words.length - 1].end,
    text: text || "(silêncio)",
    wordIds: words.map(w => w.id),
  };
}

export function CutReviewList({
  wordSegments,
  segmentStatuses,
  onAccept,
  onReject,
  onAcceptAll,
  onRejectAll,
  onNavigate,
  currentTime,
  onRestoreAll,
}: CutReviewListProps) {
  const allRegions = useMemo(
    () => buildAllCutRegions(wordSegments),
    [wordSegments]
  );

  // Determine current status of each region based on segmentStatuses
  const regionsWithStatus = useMemo(() => {
    return allRegions.map(r => {
      const allRemoved = r.wordIds.every(id => segmentStatuses[id] === "removed");
      return { ...r, accepted: allRemoved };
    });
  }, [allRegions, segmentStatuses]);

  const acceptedCount = regionsWithStatus.filter(r => r.accepted).length;
  const total = regionsWithStatus.length;

  if (total === 0) return null;

  return (
    <div className="space-y-1.5 pt-2 border-t border-border">
      <div className="flex items-center justify-between">
        <label className="text-[11px] text-muted-foreground">
          Cortes Sugeridos{" "}
          <span className="font-medium text-foreground">{acceptedCount}/{total}</span>
        </label>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 text-[10px] gap-1"
            onClick={onAcceptAll}
          >
            <CheckCheck className="w-3 h-3" /> Todos
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 text-[10px] gap-1"
            onClick={onRejectAll}
          >
            <XCircle className="w-3 h-3" /> Nenhum
          </Button>
          {onRestoreAll && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[10px] gap-1"
              onClick={onRestoreAll}
            >
              <RotateCcw className="w-3 h-3" /> Restaurar
            </Button>
          )}
        </div>
      </div>
      <div className="space-y-0.5">
        {regionsWithStatus.map(region => {
            const isActive = currentTime >= region.start && currentTime < region.end;
            return (
              <div
                key={region.id}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded text-[11px] transition-colors",
                  region.accepted
                    ? "bg-primary/5"
                    : "bg-muted/30 opacity-60",
                  isActive && "ring-1 ring-primary/30"
                )}
              >
                <span className="text-xs">{TYPE_ICON[region.type]}</span>
                <button
                  className="font-mono text-[10px] text-muted-foreground hover:text-primary transition-colors shrink-0"
                  onClick={() => onNavigate(region.start)}
                >
                  {formatTimestamp(region.start)}
                </button>
                <span className="flex-1 truncate text-muted-foreground" title={region.text}>
                  {region.text || "(silêncio)"}
                </span>
                {region.accepted ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0"
                    onClick={() => onReject(region.wordIds)}
                    title="Rejeitar corte"
                  >
                    <X className="w-3 h-3 text-destructive" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0"
                    onClick={() => onAccept(region.wordIds)}
                    title="Aceitar corte"
                  >
                    <Check className="w-3 h-3 text-primary" />
                  </Button>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

/**
 * Build ALL potential cut regions from the initial word segments,
 * regardless of current status. This ensures regions don't disappear
 * when rejected.
 */
function buildAllCutRegions(wordSegments: WordSegment[]): CutRegion[] {
  const sorted = [...wordSegments].sort((a, b) => a.start - b.start);
  const regions: CutRegion[] = [];
  let current: { words: WordSegment[] } | null = null;

  for (const ws of sorted) {
    // Use original status from transcription
    const wasRemoved = ws.status === "removed";
    if (!wasRemoved) {
      if (current) {
        regions.push(finalizeRegion(current.words, regions.length));
        current = null;
      }
      continue;
    }
    if (current) {
      const gap = ws.start - current.words[current.words.length - 1].end;
      if (gap > 0.15) {
        regions.push(finalizeRegion(current.words, regions.length));
        current = { words: [ws] };
      } else {
        current.words.push(ws);
      }
    } else {
      current = { words: [ws] };
    }
  }
  if (current) regions.push(finalizeRegion(current.words, regions.length));
  return regions;
}
