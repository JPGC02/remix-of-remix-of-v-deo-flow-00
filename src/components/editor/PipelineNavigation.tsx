import { Check, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { pipelineSteps, type PipelineStepId } from "@/data/mockData";

interface PipelineNavigationProps {
  currentStep: PipelineStepId;
  onStepChange: (step: PipelineStepId) => void;
  completedSteps: PipelineStepId[];
}

export function PipelineNavigation({ currentStep, onStepChange, completedSteps }: PipelineNavigationProps) {
  const getStepStatus = (stepId: PipelineStepId) => {
    if (stepId === currentStep) return "active";
    if (completedSteps.includes(stepId)) return "done";
    return "pending";
  };

  return (
    <header className="h-12 border-b border-border flex items-center justify-between px-4 bg-card flex-shrink-0 relative z-10">
      <div className="flex items-center gap-1">
        {pipelineSteps.map((step, i) => {
          const status = getStepStatus(step.id);
          return (
            <div key={step.id} className="flex items-center gap-1">
              <button
                onClick={() => onStepChange(step.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                  status === "active" && "bg-primary text-primary-foreground shadow-md shadow-primary/25",
                  status === "done" && "bg-[hsl(var(--segment-speech))]/15 text-[hsl(var(--segment-speech))] hover:bg-[hsl(var(--segment-speech))]/25",
                  status === "pending" && "text-muted-foreground opacity-50 hover:opacity-80 hover:bg-surface-raised"
                )}
              >
                {status === "done" ? (
                  <Check className="w-3 h-3" />
                ) : (
                  <span className="text-sm">{step.icon}</span>
                )}
                <span className="hidden lg:inline">{step.label}</span>
              </button>
              {i < pipelineSteps.length - 1 && (
                <div className={cn(
                  "w-4 h-px",
                  status === "done" ? "bg-[hsl(var(--segment-speech))]/30" : "bg-border"
                )} />
              )}
            </div>
          );
        })}
      </div>

      {currentStep !== "upload" && (
        <Button variant="outline" size="sm" className="text-xs gap-1.5 border-border hover:border-primary/40">
          <Download className="w-3.5 h-3.5" />
          Exportar para NLE
        </Button>
      )}
    </header>
  );
}
