import { useMemo, useRef, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { type WordSegment } from "@/data/mockData";

export interface SubtitleStyle {
  preset: string;
  fontSize: number;
  position: "top" | "center" | "bottom";
  maxWords: number;
  textCase: "upper" | "lower" | "normal";
  textColor: string;
  highlightColor: string;
  font: string;
  animation: string;
}

const FONT_MAP: Record<string, string> = {
  montserrat: "'Montserrat', sans-serif",
  poppins: "'Poppins', sans-serif",
  inter: "'Inter', sans-serif",
  bebas: "'Bebas Neue', sans-serif",
  oswald: "'Oswald', sans-serif",
  lato: "'Lato', sans-serif",
};

interface PresetStyle {
  textShadow?: string;
  WebkitTextStroke?: string;
  background?: string;
  padding?: string;
  borderRadius?: string;
  fontWeight: number;
  letterSpacing?: string;
  paintOrder?: string;
}

const PRESET_STYLES: Record<string, PresetStyle> = {
  hormozi: {
    textShadow: "1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 2px 0 0 #000, -2px 0 0 #000, 0 2px 0 #000, 0 -2px 0 #000, 0 3px 6px rgba(0,0,0,0.6)",
    fontWeight: 900,
    letterSpacing: "0.02em",
  },
  karaoke: {
    textShadow: "0 2px 8px rgba(0,0,0,0.7)",
    fontWeight: 700,
  },
  minimal: {
    textShadow: "0 1px 4px rgba(0,0,0,0.6)",
    fontWeight: 500,
  },
  boxed: {
    background: "rgba(0,0,0,0.75)",
    padding: "4px 12px",
    borderRadius: "6px",
    fontWeight: 600,
  },
  outline: {
    WebkitTextStroke: "1.5px #000",
    textShadow: "0 0 8px rgba(0,0,0,0.5)",
    fontWeight: 800,
    paintOrder: "stroke fill",
  },
  glow: {
    fontWeight: 700,
  },
};

function getGlowShadow(color: string): string {
  return `0 0 10px ${color}, 0 0 20px ${color}, 0 0 40px ${color}80, 0 2px 8px rgba(0,0,0,0.6)`;
}

const POSITION_CLASSES: Record<string, string> = {
  top: "top-[12%]",
  center: "top-1/2 -translate-y-1/2",
  bottom: "bottom-[14%]",
};

const ANIMATION_STYLES: Record<string, string> = {
  pop: "animate-subtitle-pop",
  fade: "animate-subtitle-fade",
  slide: "animate-subtitle-slide",
  scale: "animate-subtitle-scale",
};

interface SubtitleOverlayProps {
  currentTime: number;
  wordSegments: WordSegment[];
  style: SubtitleStyle;
}

export function SubtitleOverlay({ currentTime, wordSegments, style: s }: SubtitleOverlayProps) {
  const prevGroupKey = useRef("");
  const [animKey, setAnimKey] = useState(0);

  // Pre-compute speech word groups with their temporal ranges
  const groups = useMemo(() => {
    const speechWords = wordSegments.filter((w) => w.type === "speech" && w.status === "kept");
    const result: { words: WordSegment[]; start: number; end: number }[] = [];
    for (let i = 0; i < speechWords.length; i += s.maxWords) {
      const chunk = speechWords.slice(i, i + s.maxWords);
      if (chunk.length > 0) {
        result.push({
          words: chunk,
          start: chunk[0].start,
          end: chunk[chunk.length - 1].end,
        });
      }
    }
    return result;
  }, [wordSegments, s.maxWords]);

  // Find the group whose temporal range covers currentTime
  const displayGroup = useMemo(() => {
    return groups.find((g) => currentTime >= g.start && currentTime < g.end) ?? null;
  }, [groups, currentTime]);

  // Track group changes for animation
  const groupKey = displayGroup?.words.map((w) => w.id).join(",") ?? "";
  useEffect(() => {
    if (groupKey && groupKey !== prevGroupKey.current) {
      prevGroupKey.current = groupKey;
      setAnimKey((k) => k + 1);
    }
  }, [groupKey]);

  if (!displayGroup || displayGroup.words.length === 0) return null;

  const presetStyle = PRESET_STYLES[s.preset] || PRESET_STYLES.minimal;
  const fontFamily = FONT_MAP[s.font] || FONT_MAP.montserrat;

  const applyCase = (text: string) => {
    if (s.textCase === "upper") return text.toUpperCase();
    if (s.textCase === "lower") return text.toLowerCase();
    return text;
  };

  const isKaraokeOrHormozi = s.preset === "karaoke" || s.preset === "hormozi";

  const textShadow =
    s.preset === "glow"
      ? getGlowShadow(s.highlightColor)
      : presetStyle.textShadow;

  return (
    <div
      className={cn(
        "absolute left-0 right-0 z-30 flex justify-center pointer-events-none px-4",
        POSITION_CLASSES[s.position]
      )}
    >
      <div
        key={animKey}
        className={cn(ANIMATION_STYLES[s.animation])}
        style={{
          fontFamily,
          fontSize: `${s.fontSize}px`,
          fontWeight: presetStyle.fontWeight,
          letterSpacing: presetStyle.letterSpacing,
          textShadow,
          WebkitTextStroke: presetStyle.WebkitTextStroke,
          background: presetStyle.background,
          padding: presetStyle.padding,
          borderRadius: presetStyle.borderRadius,
          paintOrder: presetStyle.paintOrder,
          color: s.textColor,
          textAlign: "center",
          lineHeight: 1.3,
          maxWidth: "90%",
        }}
      >
        {displayGroup.words.map((word) => {
          const isActive = currentTime >= word.start && currentTime < word.end;
          return (
            <span
              key={word.id}
              style={{
                color: isKaraokeOrHormozi && isActive ? s.highlightColor : undefined,
                transition: "color 0.1s ease",
              }}
            >
              {applyCase(word.text)}{" "}
            </span>
          );
        })}
      </div>
    </div>
  );
}
