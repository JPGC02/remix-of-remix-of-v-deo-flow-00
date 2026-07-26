import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PipelineNavigation } from "@/components/editor/PipelineNavigation";
import { UploadStep } from "@/components/editor/steps/UploadStep";
import type { UploadOptions } from "@/components/editor/steps/UploadStep";
import { CutStep } from "@/components/editor/steps/CutStep";
import { ReframeStep } from "@/components/editor/steps/ReframeStep";
import { BRollStep } from "@/components/editor/steps/BRollStep";
import { AudioStep } from "@/components/editor/steps/AudioStep";
import { ColorStep } from "@/components/editor/steps/ColorStep";
import { SubtitlesStep } from "@/components/editor/steps/SubtitlesStep";
import { ExportStep } from "@/components/editor/steps/ExportStep";
import { PreviewStep } from "@/components/editor/steps/PreviewStep";
import { Sparkles, Loader2 } from "lucide-react";
import { SettingsDialog } from "@/components/editor/SettingsDialog";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import type { PipelineStepId } from "@/data/mockData";
import type { TranscriptionResult } from "@/hooks/useTranscription";
import { useAuth } from "@/hooks/useAuth";
import { useVideoUrl } from "@/hooks/useVideoUrl";
import { Link } from "react-router-dom";

export type StepSettings = Record<string, Record<string, unknown>>;

export default function Editor() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [currentStep, setCurrentStep] = useState<PipelineStepId>("upload");
  const [completedSteps, setCompletedSteps] = useState<PipelineStepId[]>([]);
  const [videoStoragePath, setVideoStoragePath] = useState<string | null>(null);
  const { videoUrl, setVideoUrl, handleVideoError, isRefreshing } = useVideoUrl(videoStoragePath);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [transcription, setTranscription] = useState<TranscriptionResult | null>(null);
  const [uploadOptions, setUploadOptions] = useState<UploadOptions>({ removeSilences: true, removeBadTakes: false, removeFillers: true });
  const [stepSettings, setStepSettings] = useState<StepSettings>({});
  const [loading, setLoading] = useState(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load project data
  useEffect(() => {
    if (!projectId) return;

    const load = async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .single();

      if (error || !data) {
        navigate("/");
        return;
      }

      setCurrentStep((data.current_step as PipelineStepId) || "upload");
      setCompletedSteps((data.completed_steps as PipelineStepId[]) || []);

      if (data.transcription) {
        setTranscription(data.transcription as unknown as TranscriptionResult);
      }

      if (data.upload_options) {
        setUploadOptions(data.upload_options as unknown as UploadOptions);
      }

      if (data.step_settings && typeof data.step_settings === "object") {
        setStepSettings(data.step_settings as unknown as StepSettings);
      }

      // If there's a stored video, trigger URL refresh via the hook
      if (data.video_storage_path) {
        setVideoStoragePath(data.video_storage_path);
      }

      setLoading(false);
    };

    load();
  }, [projectId, navigate]);

  // Persist step changes
  const saveProject = useCallback(async (updates: Record<string, unknown>) => {
    if (!projectId) return;
    await supabase
      .from("projects")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", projectId);
  }, [projectId]);

  const saveStepSettings = useCallback((stepId: string, settings: Record<string, unknown>) => {
    setStepSettings(prev => {
      const next = { ...prev, [stepId]: settings };
      // Debounce DB save
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveProject({ step_settings: next as unknown as Record<string, unknown> });
      }, 400);
      return next;
    });
  }, [saveProject]);

  const handleStepChange = (step: PipelineStepId) => {
    const newCompleted = [...completedSteps];
    if (!newCompleted.includes(currentStep) && currentStep !== "upload") {
      newCompleted.push(currentStep);
    }
    setCompletedSteps(newCompleted);
    setCurrentStep(step);
    saveProject({ current_step: step, completed_steps: newCompleted });
  };

  /**
   * Uploads the video file to storage and returns the storage path.
   * Sets the local videoUrl immediately for preview.
   */
  const uploadToStorage = async (file: File): Promise<string | null> => {
    if (!user || !projectId) return null;
    try {
      const path = `${user.id}/${projectId}/video.mp4`;
      const { error } = await supabase.storage.from("videos").upload(path, file, { upsert: true });
      if (error) {
        console.error("Failed to upload video to storage:", error);
        return null;
      }
      return path;
    } catch (e) {
      console.error("Failed to upload video to storage:", e);
      return null;
    }
  };

  const handleFileSelected = async (file: File, blobUrl: string): Promise<string | null> => {
    setVideoUrl(blobUrl);
    setVideoFile(file);
    return uploadToStorage(file);
  };

  /**
   * Called by UploadStep when both upload + transcription are done.
   * Retries storage upload once if it failed, then saves to DB.
   */
  const handleUploadComplete = async (storagePath: string | null, result: TranscriptionResult) => {
    setTranscription(result);

    // Retry upload once if it failed
    let finalPath = storagePath;
    if (!finalPath && videoFile) {
      console.warn("Storage upload failed initially, retrying...");
      finalPath = await uploadToStorage(videoFile);
    }

    if (!finalPath) {
      toast({
        title: "Vídeo não foi salvo na nuvem",
        description: "O vídeo funciona nesta sessão, mas não estará disponível ao reabrir o projeto. Tente fazer upload novamente.",
        variant: "destructive",
      });
    }

    const newCompleted = [...completedSteps];
    if (!newCompleted.includes("upload")) newCompleted.push("upload" as PipelineStepId);
    setCompletedSteps(newCompleted);
    setCurrentStep("cut");

    if (finalPath) {
      setVideoStoragePath(finalPath);
    }

    saveProject({
      current_step: "cut",
      completed_steps: newCompleted,
      transcription: result as unknown as Record<string, unknown>,
      ...(finalPath ? { video_storage_path: finalPath } : {}),
    });
  };

  const renderStep = () => {
    switch (currentStep) {
      case "upload": return (
        <UploadStep
          onFileSelected={handleFileSelected}
          onUploadComplete={handleUploadComplete}
          onUploadOptionsChange={(opts) => {
            setUploadOptions(opts);
            saveProject({ upload_options: opts as unknown as Record<string, unknown> });
          }}
        />
      );
      case "cut": return <CutStep videoUrl={videoUrl} transcription={transcription} uploadOptions={uploadOptions} initialSettings={stepSettings.cut} onSettingsChange={(s) => saveStepSettings("cut", s)} onVideoError={handleVideoError} isLoadingUrl={isRefreshing} />;
      case "reframe": return <ReframeStep videoUrl={videoUrl} initialSettings={stepSettings.reframe} onSettingsChange={(s) => saveStepSettings("reframe", s)} onVideoError={handleVideoError} isLoadingUrl={isRefreshing} />;
      case "broll": return <BRollStep videoUrl={videoUrl} transcription={transcription} initialSettings={stepSettings.broll} onSettingsChange={(s) => saveStepSettings("broll", s)} onVideoError={handleVideoError} isLoadingUrl={isRefreshing} />;
      case "audio": return <AudioStep videoUrl={videoUrl} transcription={transcription} projectId={projectId} initialSettings={stepSettings.audio} onSettingsChange={(s) => saveStepSettings("audio", s)} onVideoError={handleVideoError} isLoadingUrl={isRefreshing} />;
      case "color": return <ColorStep videoUrl={videoUrl} initialSettings={stepSettings.color} onSettingsChange={(s) => saveStepSettings("color", s)} onVideoError={handleVideoError} isLoadingUrl={isRefreshing} />;
      case "subtitles": return <SubtitlesStep videoUrl={videoUrl} transcription={transcription} initialSettings={stepSettings.subtitles} onSettingsChange={(s) => saveStepSettings("subtitles", s)} onVideoError={handleVideoError} isLoadingUrl={isRefreshing} />;
      case "preview": return <PreviewStep videoUrl={videoUrl} transcription={transcription} stepSettings={stepSettings} onVideoError={handleVideoError} isLoadingUrl={isRefreshing} />;
      case "export": return <ExportStep videoUrl={videoUrl} transcription={transcription} stepSettings={stepSettings} />;
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <div className="flex items-center justify-between h-10 border-b border-border bg-card flex-shrink-0 px-4">
        <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold tracking-tight">Video Maker AI</span>
        </Link>
        <SettingsDialog />
      </div>

      <PipelineNavigation
        currentStep={currentStep}
        onStepChange={handleStepChange}
        completedSteps={completedSteps}
      />

      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
          className="flex-1 flex flex-col min-h-0"
        >
          {renderStep()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
