import { useState, useRef, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RotateCcw, Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { segments as mockSegments, formatTime, type Segment } from "@/data/mockData";

interface TranscriptionPanelProps {
  currentTime: number;
  onTimeChange: (time: number) => void;
  segments?: Segment[];
  textOverrides?: Record<string, string>;
  onTextEdit?: (segmentId: string, newText: string) => void;
}

export function TranscriptionPanel({ currentTime, onTimeChange, segments: segmentsProp, textOverrides, onTextEdit }: TranscriptionPanelProps) {
  const segs = segmentsProp ?? mockSegments;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const startEdit = (seg: Segment) => {
    if (seg.type === "silence" || seg.status === "removed") return;
    setEditingId(seg.id);
    setEditValue(textOverrides?.[seg.id] ?? seg.text);
  };

  const confirmEdit = () => {
    if (editingId && editValue.trim()) {
      onTextEdit?.(editingId, editValue.trim());
    }
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") confirmEdit();
    if (e.key === "Escape") cancelEdit();
  };

  const getSegmentStyle = (seg: Segment) => {
    if (seg.status === "removed") return "line-through text-[hsl(var(--segment-removed))]/60 bg-[hsl(var(--segment-removed))]/5";
    if (seg.type === "broll") return "text-[hsl(var(--segment-broll))] bg-[hsl(var(--segment-broll))]/5";
    return "text-foreground";
  };

  const isActive = (seg: Segment) => currentTime >= seg.start && currentTime < seg.end;
  const isEditable = (seg: Segment) => seg.type !== "silence" && seg.status !== "removed";

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Transcrição</h3>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-1">
          {segs.map((seg) => (
            <div
              key={seg.id}
              className={cn(
                "group flex items-start gap-2 px-2 py-1 rounded cursor-pointer transition-colors hover:bg-surface-raised",
                isActive(seg) && "bg-surface-raised ring-1 ring-primary/30"
              )}
              onClick={() => {
                if (editingId !== seg.id) onTimeChange(seg.start);
              }}
              onDoubleClick={() => startEdit(seg)}
            >
              <span className="text-[10px] font-mono text-muted-foreground w-8 flex-shrink-0 pt-0.5">
                {formatTime(seg.start)}
              </span>

              {editingId === seg.id ? (
                <div className="flex-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <Input
                    ref={inputRef}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={confirmEdit}
                    className="h-6 text-sm px-1.5 py-0 bg-background border-primary"
                  />
                  <Button variant="ghost" size="icon" className="h-5 w-5 flex-shrink-0" onMouseDown={(e) => { e.preventDefault(); confirmEdit(); }}>
                    <Check className="w-3 h-3 text-green-500" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-5 w-5 flex-shrink-0" onMouseDown={(e) => { e.preventDefault(); cancelEdit(); }}>
                    <X className="w-3 h-3 text-destructive" />
                  </Button>
                </div>
              ) : (
                <>
                  <span className={cn("text-sm leading-relaxed flex-1", getSegmentStyle(seg))}>
                    {seg.type === "silence" ? (
                      <span className="italic text-muted-foreground text-xs">[silêncio {(seg.end - seg.start).toFixed(1)}s]</span>
                    ) : (
                      textOverrides?.[seg.id] ?? seg.text
                    )}
                  </span>
                  {isEditable(seg) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      title="Editar"
                      onClick={(e) => { e.stopPropagation(); startEdit(seg); }}
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                  )}
                  {seg.status === "removed" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      title="Restaurar"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </Button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="px-3 py-2 border-t border-border flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-[hsl(var(--segment-speech))]" />
          <span className="text-[10px] text-muted-foreground">Mantido</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-[hsl(var(--segment-removed))]" />
          <span className="text-[10px] text-muted-foreground">Removido</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-[hsl(var(--segment-broll))]" />
          <span className="text-[10px] text-muted-foreground">B-Roll</span>
        </div>
      </div>
    </div>
  );
}
