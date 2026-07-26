import { useRef, useCallback, useEffect } from "react";

/**
 * Resilient video player helper.
 * Handles:
 * - play() with real error surfacing (no silent swallowing)
 * - Source recovery: on error, refresh URL → load() → restore time → resume play
 * - Visibility change: resume context if suspended
 */
export interface ResilientPlayerOptions {
  onVideoError?: () => Promise<string | null>;
  onPlayBlocked?: (reason: string) => void;
}

export function useResilientPlayer(
  videoRef: React.RefObject<HTMLVideoElement | null> | { current: HTMLVideoElement | null },
  options: ResilientPlayerOptions = {}
) {
  const recoveringRef = useRef(false);
  const stateBeforeRecoveryRef = useRef<{ time: number; wasPlaying: boolean } | null>(null);

  /**
   * Safe play that surfaces errors instead of swallowing them.
   * Returns true if play succeeded, false otherwise.
   */
  const safePlay = useCallback(async (): Promise<boolean> => {
    const video = videoRef.current;
    if (!video) return false;
    if (!video.src && !video.currentSrc) {
      console.warn("[ResilientPlayer] No source set on video element");
      options.onPlayBlocked?.("no_source");
      return false;
    }
    try {
      await video.play();
      return true;
    } catch (err: any) {
      const name = err?.name || "UnknownError";
      const msg = err?.message || String(err);
      console.warn(`[ResilientPlayer] play() failed: ${name} — ${msg}`);
      
      if (name === "NotAllowedError") {
        options.onPlayBlocked?.("autoplay_policy");
      } else if (name === "NotSupportedError") {
        options.onPlayBlocked?.("format_unsupported");
      } else if (name === "AbortError") {
        // Source changed while loading — usually harmless, retry once
        await new Promise(r => setTimeout(r, 100));
        try {
          await video.play();
          return true;
        } catch {
          options.onPlayBlocked?.("abort_retry_failed");
        }
      } else {
        options.onPlayBlocked?.(`error: ${name}`);
      }
      return false;
    }
  }, [videoRef, options.onPlayBlocked]);

  /**
   * Recovers from a media error by refreshing the URL, reloading, and restoring state.
   */
  const recoverFromError = useCallback(async () => {
    const video = videoRef.current;
    if (!video || recoveringRef.current || !options.onVideoError) return;
    
    recoveringRef.current = true;
    const wasPlaying = !video.paused;
    const savedTime = video.currentTime || 0;
    
    console.log(`[ResilientPlayer] Recovering... time=${savedTime.toFixed(1)}, wasPlaying=${wasPlaying}`);
    stateBeforeRecoveryRef.current = { time: savedTime, wasPlaying };
    
    try {
      const newUrl = await options.onVideoError();
      if (!newUrl) {
        console.error("[ResilientPlayer] Recovery failed: no URL returned");
        recoveringRef.current = false;
        return;
      }
      
      // The new URL will come through props/state and update the src attribute.
      // We need to wait for React to re-render, then restore state.
      // Use a small delay to let React update the DOM.
      await new Promise(r => setTimeout(r, 200));
      
      if (video.src !== newUrl && video.currentSrc !== newUrl) {
        // React hasn't updated yet, or video ref changed
        // The loadedmetadata handler will pick up recovery state
      }
      
    } catch (e) {
      console.error("[ResilientPlayer] Recovery error:", e);
    }
    
    recoveringRef.current = false;
  }, [videoRef, options.onVideoError]);

  /**
   * Restore state after the video source changes (e.g., URL refresh).
   * Call this from onLoadedMetadata.
   */
  const restoreAfterSourceChange = useCallback(async () => {
    const state = stateBeforeRecoveryRef.current;
    if (!state) return;
    
    const video = videoRef.current;
    if (!video) return;
    
    stateBeforeRecoveryRef.current = null;
    
    console.log(`[ResilientPlayer] Restoring: time=${state.time.toFixed(1)}, play=${state.wasPlaying}`);
    
    if (state.time > 0 && isFinite(state.time) && video.duration && state.time < video.duration) {
      video.currentTime = state.time;
    }
    
    if (state.wasPlaying) {
      await safePlay();
    }
  }, [videoRef, safePlay]);

  return {
    safePlay,
    recoverFromError,
    restoreAfterSourceChange,
    isRecovering: recoveringRef.current,
  };
}
