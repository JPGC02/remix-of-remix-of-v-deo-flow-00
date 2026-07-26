import { useRef, useEffect, useState, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Search, ClipboardCopy, Undo2, Scissors, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  segments as mockSegments,
  wordSegments as mockWordSegments,
  formatTime,
  type Segment,
  type WordSegment,
} from "@/data/mockData";

interface ScriptEditorProps {
  currentTime: number;
  onTimeChange: (time: number) => void;
  showCuts: boolean;
  segmentStatuses: Record<string, "kept" | "removed">;
  onToggleSegment: (id: string) => void;
  segments?: Segment[];
  wordSegments?: WordSegment[];
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  segmentIds: string[];
  allRemoved: boolean;
}

export function ScriptEditor({
  currentTime,
  onTimeChange,
  showCuts,
  segmentStatuses,
  onToggleSegment,
  segments: segmentsProp,
  wordSegments: wordSegmentsProp,
}: ScriptEditorProps) {
  const segments = segmentsProp ?? mockSegments;
  const wordSegments = wordSegmentsProp ?? mockWordSegments;
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const activeRef = useRef<HTMLSpanElement>(null);
  const scriptBodyRef = useRef<HTMLDivElement>(null);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, segmentIds: [], allRemoved: false });

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [currentTime]);

  // Close context menu on click anywhere or scroll
  useEffect(() => {
    const close = () => setCtxMenu(prev => ({ ...prev, visible: false }));
    document.addEventListener("click", close);
    document.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("scroll", close, true);
    };
  }, []);

  const getStatus = (id: string, fallbackStatus: string) => segmentStatuses[id] ?? (fallbackStatus === "removed" ? "removed" : "kept");

  // Group into paragraphs at long silences (using original segments for structure)
  const paragraphs: Segment[][] = [];
  let currentParagraph: Segment[] = [];
  segments.forEach((seg) => {
    if (seg.type === "silence" && (seg.end - seg.start) > 1.0) {
      if (currentParagraph.length > 0) {
        paragraphs.push(currentParagraph);
        currentParagraph = [];
      }
      currentParagraph.push(seg);
      paragraphs.push(currentParagraph);
      currentParagraph = [];
    } else {
      currentParagraph.push(seg);
    }
  });
  if (currentParagraph.length > 0) paragraphs.push(currentParagraph);

  const isActiveTime = (start: number, end: number) => currentTime >= start && currentTime < end;
  const currentSegment = segments.find(s => currentTime >= s.start && currentTime < s.end);

  const handleCopyClean = () => {
    const cleanText = wordSegments
      .filter(ws => ws.type === "speech" && getStatus(ws.id, ws.status) === "kept")
      .map(ws => ws.text)
      .join(" ");
    navigator.clipboard.writeText(cleanText);
  };

  // Get word-level segments for a parent segment
  const getWordsForSegment = (segId: string): WordSegment[] =>
    wordSegments.filter(ws => ws.parentId === segId);

  // Find all word segment IDs covered by the current text selection
  const getSelectedSegmentIds = (): string[] => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return [];

    const range = selection.getRangeAt(0);
    const container = scriptBodyRef.current;
    if (!container) return [];

    const allSpans = container.querySelectorAll<HTMLElement>("[data-segment-id]");
    const ids: string[] = [];

    allSpans.forEach((span) => {
      if (!range.intersectsNode(span)) return;
      const segId = span.getAttribute("data-segment-id");
      if (!segId) return;

      const spanRange = document.createRange();
      spanRange.selectNodeContents(span);

      const clipped = document.createRange();
      if (range.compareBoundaryPoints(Range.START_TO_START, spanRange) > 0) {
        clipped.setStart(range.startContainer, range.startOffset);
      } else {
        clipped.setStart(spanRange.startContainer, spanRange.startOffset);
      }
      if (range.compareBoundaryPoints(Range.END_TO_END, spanRange) < 0) {
        clipped.setEnd(range.endContainer, range.endOffset);
      } else {
        clipped.setEnd(spanRange.endContainer, spanRange.endOffset);
      }

      const selectedText = clipped.toString().trim();
      if (selectedText.length > 0) {
        ids.push(segId);
      }
    });

    return ids;
  };

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();

    let segIds = getSelectedSegmentIds();

    if (segIds.length === 0) {
      const target = (e.target as HTMLElement).closest<HTMLElement>("[data-segment-id]");
      if (target) {
        const id = target.getAttribute("data-segment-id");
        if (id) segIds = [id];
      }
    }

    if (segIds.length === 0) return;

    const allRemoved = segIds.every(id => {
      const ws = wordSegments.find(w => w.id === id);
      return ws ? getStatus(ws.id, ws.status) === "removed" : false;
    });

    const rect = scriptBodyRef.current?.getBoundingClientRect();
    const x = e.clientX - (rect?.left ?? 0);
    const y = e.clientY - (rect?.top ?? 0);

    setCtxMenu({ visible: true, x, y, segmentIds: segIds, allRemoved });
  }, [segmentStatuses]);

  const handleCtxAction = (action: "cut" | "restore") => {
    ctxMenu.segmentIds.forEach(id => {
      const ws = wordSegments.find(w => w.id === id);
      if (!ws) return;
      const status = getStatus(ws.id, ws.status);
      if (action === "cut" && status === "kept") onToggleSegment(id);
      if (action === "restore" && status === "removed") onToggleSegment(id);
    });
    setCtxMenu(prev => ({ ...prev, visible: false }));
    window.getSelection()?.removeAllRanges();
  };

  // Render a single word span
  const renderWordSpan = (ws: WordSegment) => {
    const status = getStatus(ws.id, ws.status);
    const isRemoved = status === "removed";
    if (!showCuts && isRemoved) return null;
    const active = isActiveTime(ws.start, ws.end);
    const isSelected = !isRemoved && Math.abs(currentTime - ws.start) < 0.01;

    return (
      <span
        key={ws.id}
        data-segment-id={ws.id}
        ref={active ? activeRef : undefined}
        className={cn(
          "cursor-pointer transition-all duration-100 relative inline rounded-sm px-0.5 -mx-0.5",
          isRemoved
            ? "line-through text-muted-foreground/40 hover:text-muted-foreground/60"
            : "text-foreground",
          "hover:bg-primary/10",
          active && !isRemoved && "bg-primary/25 text-primary font-semibold scale-[1.02] ring-1 ring-primary/30",
          active && isRemoved && "bg-destructive/15",
          isSelected && !isRemoved && !active && "bg-[hsl(210,100%,56%)]/25 ring-1 ring-[hsl(210,100%,56%)]/50 rounded",
        )}
        onClick={() => onTimeChange(ws.start)}
      >
        {ws.text}{" "}
      </span>
    );
  };

  const renderSegment = (seg: Segment) => {
    const segWords = getWordsForSegment(seg.id);

    // Silence inline
    if (seg.type === "silence") {
      return null;
    }

    // Filler — single word, keep as one span
    if (seg.type === "filler") {
      const status = getStatus(seg.id, seg.status);
      const isRemoved = status === "removed";
      if (!showCuts && isRemoved) return null;
      const active = isActiveTime(seg.start, seg.end);
      return (
        <span
          key={seg.id}
          data-segment-id={seg.id}
          ref={active ? activeRef : undefined}
          className={cn(
            "cursor-pointer transition-all relative inline rounded-sm",
            isRemoved
              ? "line-through text-muted-foreground/40 hover:text-muted-foreground/60"
              : "text-foreground",
            "hover:bg-primary/10",
            active && !isRemoved && "bg-primary/15",
            active && isRemoved && "bg-destructive/10"
          )}
          onClick={() => onTimeChange(seg.start)}
        >
          {seg.text}{" "}
        </span>
      );
    }

    // Speech — render each word individually
    if (segWords.length > 1) {
      return segWords.map(renderWordSpan);
    }

    // Single word speech (fallback)
    const ws = segWords[0] || { id: seg.id, start: seg.start, end: seg.end, text: seg.text, status: seg.status, type: seg.type, parentId: seg.id };
    return renderWordSpan(ws);
  };

  // Count selected segments for label
  const selectedCount = ctxMenu.segmentIds.length;
  const selectedTimestamp = (() => {
    if (selectedCount === 0) return "";
    const wsMatches = ctxMenu.segmentIds.map(id => wordSegments.find(w => w.id === id)).filter(Boolean) as WordSegment[];
    if (wsMatches.length === 0) return "";
    const minStart = Math.min(...wsMatches.map(w => w.start));
    const maxEnd = Math.max(...wsMatches.map(w => w.end));
    return `${formatTime(minStart)} – ${formatTime(maxEnd)}`;
  })();

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <div className="flex items-center justify-end px-4 py-2 border-b border-border">
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSearchOpen(!searchOpen)} title="Buscar no texto">
            <Search className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopyClean} title="Copiar script limpo">
            <ClipboardCopy className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Desfazer último corte">
            <Undo2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {searchOpen && (
        <div className="px-4 py-2 border-b border-border">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar no script..."
            className="w-full bg-surface-raised border border-border rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            autoFocus
          />
        </div>
      )}

      {/* Script body */}
      <ScrollArea className="flex-1">
        <div ref={scriptBodyRef} className="relative" onContextMenu={handleContextMenu}>
          <TooltipProvider delayDuration={200}>
            <div className="px-8 py-5 space-y-5">
              {paragraphs.map((para, pi) => {
                const isSilenceOnly = para.length === 1 && para[0].type === "silence";
                if (isSilenceOnly) {
                  return null;
                }

                const hasKeptContent = para.some(s => {
                  if (s.type !== "speech") return false;
                  const words = getWordsForSegment(s.id);
                  return words.some(w => getStatus(w.id, w.status) === "kept");
                });

                return (
                  <div key={`p-${pi}`} className="relative pl-6">
                    {hasKeptContent && (
                      <span className="absolute left-1 top-2 w-2 h-2 rounded-full bg-primary/60" />
                    )}
                    <p className="text-[15px] leading-[1.7]" style={{ fontFamily: "'Inter', 'Space Grotesk', sans-serif" }}>
                      {para.map(renderSegment)}
                    </p>
                  </div>
                );
              })}
            </div>
          </TooltipProvider>

          {/* Custom context menu */}
          {ctxMenu.visible && (
            <div
              className="absolute z-50 min-w-[180px] rounded-md border border-border bg-popover p-1 shadow-lg animate-in fade-in-0 zoom-in-95"
              style={{ left: ctxMenu.x, top: ctxMenu.y }}
              onClick={(e) => e.stopPropagation()}
            >
              {ctxMenu.allRemoved ? (
                <button
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                  onClick={() => handleCtxAction("restore")}
                >
                  <RotateCcw className="w-4 h-4" />
                  Restaurar{selectedCount > 1 ? ` (${selectedCount} trechos)` : ""}
                </button>
              ) : (
                <button
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                  onClick={() => handleCtxAction("cut")}
                >
                  <Scissors className="w-4 h-4" />
                  Cortar{selectedCount > 1 ? ` (${selectedCount} trechos)` : ""}
                </button>
              )}
              {!ctxMenu.allRemoved && ctxMenu.segmentIds.some(id => {
                const ws = wordSegments.find(w => w.id === id);
                return ws ? getStatus(ws.id, ws.status) === "removed" : false;
              }) && (
                <button
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                  onClick={() => handleCtxAction("restore")}
                >
                  <RotateCcw className="w-4 h-4" />
                  Restaurar removidos
                </button>
              )}
              <div className="-mx-1 my-1 h-px bg-border" />
              <div className="px-2 py-1.5 text-xs font-mono text-muted-foreground">
                {selectedTimestamp}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
