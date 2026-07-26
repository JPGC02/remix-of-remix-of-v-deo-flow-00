import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { pipelineSteps } from "@/data/mockData";

export function PipelineIndicator() {
  return (
    <div className="flex items-center gap-1 px-2">
      {pipelineSteps.map((step, i) => (
        <div key={step.id} className="flex items-center gap-1">
          <div
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors",
              step.status === "done" && "bg-[hsl(var(--segment-speech))]/15 text-[hsl(var(--segment-speech))]",
              step.status === "active" && "bg-primary/20 text-primary ring-1 ring-primary/40",
              step.status === "pending" && "bg-surface-raised text-muted-foreground"
            )}
          >
            {step.status === "done" && <Check className="w-2.5 h-2.5" />}
            {step.label}
          </div>
          {i < pipelineSteps.length - 1 && (
            <div className={cn(
              "w-3 h-px",
              step.status === "done" ? "bg-[hsl(var(--segment-speech))]/30" : "bg-border"
            )} />
          )}
        </div>
      ))}
    </div>
  );
}
