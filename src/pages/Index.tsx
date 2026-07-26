import { useState } from "react";
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
import { Sparkles } from "lucide-react";
import { SettingsDialog } from "@/components/editor/SettingsDialog";
import { motion, AnimatePresence } from "framer-motion";
import type { PipelineStepId } from "@/data/mockData";
import type { TranscriptionResult } from "@/hooks/useTranscription";

const Index = () => {
  const [currentStep, setCurrentStep] = useState<PipelineStepId>("upload");
  const [completedSteps, setCompletedSteps] = useState<PipelineStepId[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<TranscriptionResult | null>(null);
  const [uploadOptions, setUploadOptions] = useState<UploadOptions>({ removeSilences: true, removeBadTakes: false, removeFillers: true });

  const handleStepChange = (step: PipelineStepId) => {
    if (!completedSteps.includes(currentStep) && currentStep !== "upload") {
      setCompletedSteps((prev) => [...prev, currentStep]);
    }
    setCurrentStep(step);
  };

  const handleFileSelected = async (_file: File, blobUrl: string): Promise<string | null> => {
    setVideoUrl(blobUrl);
    return null; // No storage persistence in Index page
  };

  const handleUploadComplete = (_storagePath: string | null, result: TranscriptionResult) => {
    setTranscription(result);
    if (!completedSteps.includes("upload")) {
      setCompletedSteps((prev) => [...prev, "upload"]);
    }
    setCurrentStep("cut");
  };

  const renderStep = () => {
    switch (currentStep) {
      case "upload": return (
        <UploadStep
          onFileSelected={handleFileSelected}
          onUploadComplete={handleUploadComplete}
          onUploadOptionsChange={setUploadOptions}
        />
      );
      case "cut": return <CutStep videoUrl={videoUrl} transcription={transcription} uploadOptions={uploadOptions} />;
      case "reframe": return <ReframeStep videoUrl={videoUrl} />;
      case "broll": return <BRollStep videoUrl={videoUrl} transcription={transcription} />;
      case "audio": return <AudioStep />;
      case "color": return <ColorStep />;
      case "subtitles": return <SubtitlesStep videoUrl={videoUrl} />;
      case "export": return <ExportStep videoUrl={null} transcription={null} stepSettings={{}} />;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <div className="flex items-center justify-between h-10 border-b border-border bg-card flex-shrink-0 px-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold tracking-tight">Video Maker AI</span>
        </div>
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
};

export default Index;
