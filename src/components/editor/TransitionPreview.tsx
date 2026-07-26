import { useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";

interface TransitionPreviewProps {
  transition: string;
  duration: number;
}

const animationMap: Record<string, string> = {
  dissolve: "animate-broll-dissolve",
  zoom: "animate-broll-zoom",
  slide: "animate-broll-slide",
  glitch: "animate-broll-glitch",
  "light-leak": "animate-broll-lightleak",
};

const MAX_CYCLES = 4;

export function TransitionPreview({ transition, duration }: TransitionPreviewProps) {
  const [cycle, setCycle] = useState(0);
  const [playCount, setPlayCount] = useState(0);
  const isCut = transition === "cut";
  const animClass = animationMap[transition];

  const restart = useCallback(() => {
    setPlayCount((p) => {
      if (p + 1 >= MAX_CYCLES) return p + 1;
      setTimeout(() => setCycle((c) => c + 1), 800);
      return p + 1;
    });
  }, []);

  // Reset when settings change
  useEffect(() => {
    setPlayCount(0);
    setCycle((c) => c + 1);
  }, [transition, duration]);

  return (
    <div className="relative w-full aspect-video rounded overflow-hidden border border-border bg-muted">
      {/* Clip A (background) */}
      <div className="absolute inset-0 bg-primary/30 flex items-center justify-center">
        <span className="text-[10px] font-bold text-primary-foreground/70">A</span>
      </div>

      {/* Clip B (animated overlay) */}
      <div
        key={`${transition}-${duration}-${cycle}`}
        className={cn("absolute inset-0 bg-accent/60 flex items-center justify-center", !isCut && animClass)}
        style={!isCut ? { animationDuration: `${duration}s` } : undefined}
        onAnimationEnd={restart}
      >
        <span className="text-[10px] font-bold text-accent-foreground/70">B</span>
      </div>

      {isCut && (
        <div
          key={`cut-${cycle}`}
          className="absolute inset-0 bg-accent/60 flex items-center justify-center"
          onAnimationEnd={restart}
          ref={(el) => {
            if (!el) return;
            el.animate(
              [{ opacity: 0 }, { opacity: 0, offset: 0.99 }, { opacity: 1 }],
              { duration: 300, fill: "forwards" }
            ).onfinish = restart;
          }}
        >
          <span className="text-[10px] font-bold text-accent-foreground/70">B</span>
        </div>
      )}
    </div>
  );
}
