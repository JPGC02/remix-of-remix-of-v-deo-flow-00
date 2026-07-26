import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const SIGNED_URL_DURATION = 7200; // 2 hours
const REFRESH_BEFORE_EXPIRY_MS = 10 * 60 * 1000; // refresh 10 min before expiry

export function useVideoUrl(storagePath: string | null) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const expiresAtRef = useRef<number>(0);
  const refreshingRef = useRef(false);

  const refreshUrl = useCallback(async (): Promise<string | null> => {
    if (!storagePath || refreshingRef.current) return videoUrl;
    refreshingRef.current = true;
    setIsRefreshing(true);
    try {
      const { data, error } = await supabase.storage
        .from("videos")
        .createSignedUrl(storagePath, SIGNED_URL_DURATION);
      if (error || !data?.signedUrl) {
        console.error("Failed to refresh signed URL:", error);
        refreshingRef.current = false;
        setIsRefreshing(false);
        return videoUrl;
      }
      expiresAtRef.current = Date.now() + SIGNED_URL_DURATION * 1000;
      setVideoUrl(data.signedUrl);
      refreshingRef.current = false;
      setIsRefreshing(false);
      return data.signedUrl;
    } catch (e) {
      console.error("Failed to refresh signed URL:", e);
      refreshingRef.current = false;
      setIsRefreshing(false);
      return videoUrl;
    }
  }, [storagePath, videoUrl]);

  // Initial load
  useEffect(() => {
    if (storagePath) {
      refreshUrl();
    }
  }, [storagePath]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh before expiry
  useEffect(() => {
    if (!storagePath) return;
    const interval = setInterval(() => {
      const timeLeft = expiresAtRef.current - Date.now();
      if (timeLeft > 0 && timeLeft < REFRESH_BEFORE_EXPIRY_MS) {
        refreshUrl();
      }
    }, 60_000); // check every minute
    return () => clearInterval(interval);
  }, [storagePath, refreshUrl]);

  // Refresh on visibility change (tab focus)
  useEffect(() => {
    if (!storagePath) return;
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        const timeLeft = expiresAtRef.current - Date.now();
        if (timeLeft < REFRESH_BEFORE_EXPIRY_MS) {
          refreshUrl();
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [storagePath, refreshUrl]);

  // Called by players when they get a media error
  const handleVideoError = useCallback(async () => {
    console.warn("Video error detected, refreshing signed URL...");
    return refreshUrl();
  }, [refreshUrl]);

  return { videoUrl, setVideoUrl, refreshUrl, handleVideoError, isRefreshing };
}
