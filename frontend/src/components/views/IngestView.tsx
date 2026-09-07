import React, { useState, useEffect } from 'react';
import { SceneMetadata, CorridorResponse, Suspect } from '../../types';
import { DEMO_SCENES } from '../../data';
import {
  CloudUpload,
  Check,
  Loader2,
  ArrowRight,
  FileCheck,
  Satellite,
  Clock,
  ChevronRight,
  Upload,
  Play
} from 'lucide-react';
import { APP_BACKGROUND, APP_BACKGROUND_DARK } from '../../data';
interface IngestViewProps {
  currentScene: SceneMetadata;
  setCurrentScene: (scene: SceneMetadata) => void;
  onContinueToMap?: () => void;
  onContinueToAnalysis?: () => void;
  onContract1: (contract1: DetectionResponse | null) => void;
  onCorridorReady?: (corridor: CorridorResponse | null) => void;
  onTopSuspectReady?: (suspect: Suspect | null) => void;
  onFileUpload?: (file: File, previewUrl: string | null) => void;
  pipelineStep: number;
  setPipelineStep: (step: number) => void;
}
import {
  detectScene,
  DetectionResponse,
  uploadScene,
  getCorridor,
  rankSuspects,
} from "../../api/api";
import { generateSarPreview } from "../../utils/sarPreview";

export const IngestView: React.FC<IngestViewProps> = ({
  currentScene,
  setCurrentScene,
  onContinueToMap,
  onContinueToAnalysis,
  onContract1,
  onCorridorReady,
  onTopSuspectReady,
  onFileUpload,
  pipelineStep,
  setPipelineStep,
}) => {
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [_sarPreviewUrl, setSarPreviewUrl] = useState<string | null>(null);
  const [customFileName, setCustomFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<boolean>(false);
  const [contract1, setContract1] = useState<DetectionResponse | null>(null);
  const [overlayImage, setOverlayImage] = useState<string | null>(null);

  const canDetect = (!!uploadedFile || !!currentScene) && !isProcessing;

  useEffect(() => {
    console.log("[PIPELINE] Detect button state:", {
      hasFile: !!uploadedFile,
      fileName: uploadedFile?.name,
      isProcessing,
      canDetect
    });
  }, [uploadedFile, isProcessing, canDetect]);

  const handleSelectDemo = (sceneId: string) => {
    const scene = DEMO_SCENES.find((s) => s.id === sceneId);

    if (!scene) {
      return;
    }

    console.log("[INGEST] selected scene:", scene);
    console.log("[INGEST] scene path:", scene.backendScenePath);

    // Immediate UI response & clear old backend detection in App.tsx
    setCurrentScene(scene);
    setUploadedFile(null);
    setCustomFileName(null);
    setContract1(null);
    onContract1(null);
    setOverlayImage(null);
    if (onCorridorReady) onCorridorReady(null);
    if (onTopSuspectReady) onTopSuspectReady(null);
    setPipelineStep(1);

    // Backend processing happens asynchronously
    void executePipeline();
  };

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];

    if (!file) {
      return;
    }

    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    console.log("[PIPELINE] File selected:", file);
    console.log("[PIPELINE] File name:", file.name);
    console.log("[PIPELINE] File type:", file.type);
    console.log("[PIPELINE] File size:", file.size);
    console.log("[PIPELINE] File extension:", extension);

    // Reset previous pipeline state
    setContract1(null);
    onContract1(null);
    setOverlayImage(null);
    if (onCorridorReady) onCorridorReady(null);
    if (onTopSuspectReady) onTopSuspectReady(null);
    setPipelineStep(1);
    setUploadedFile(file);
    setCustomFileName(file.name);
    console.log("[PIPELINE] Previous pipeline state cleared");
    console.log("[PIPELINE] New file ready for detection");

    // Immediately pass original File to App-level state so it is never lost
    onFileUpload?.(file, null);

    // Asynchronously decode preview in the background (NON-BLOCKING)
    console.log("[TIFF] Starting preview decoding");
    generateSarPreview(file)
      .then((previewUrl) => {
        console.log("[TIFF] Preview decoded successfully");
        setSarPreviewUrl(previewUrl);
        onFileUpload?.(file, previewUrl);
      })
      .catch((previewError) => {
        console.error("[TIFF] Preview failed:", previewError);
        console.log("[TIFF] Preview failed, but preserving original file for backend processing");
      });
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);

    const file = e.dataTransfer.files?.[0];

    if (!file) {
      return;
    }

    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    console.log("[PIPELINE] File selected:", file);
    console.log("[PIPELINE] File name:", file.name);
    console.log("[PIPELINE] File type:", file.type);
    console.log("[PIPELINE] File size:", file.size);
    console.log("[PIPELINE] File extension:", extension);

    // Reset previous pipeline state
    setContract1(null);
    onContract1(null);
    setOverlayImage(null);
    if (onCorridorReady) onCorridorReady(null);
    if (onTopSuspectReady) onTopSuspectReady(null);
    setPipelineStep(1);
    setUploadedFile(file);
    setCustomFileName(file.name);
    console.log("[PIPELINE] Previous pipeline state cleared");
    console.log("[PIPELINE] New file ready for detection");

    // Immediately pass original File to App-level state so it is never lost
    onFileUpload?.(file, null);

    // Asynchronously decode preview in the background (NON-BLOCKING)
    console.log("[TIFF] Starting preview decoding");
    generateSarPreview(file)
      .then((previewUrl) => {
        console.log("[TIFF] Preview decoded successfully");
        setSarPreviewUrl(previewUrl);
        onFileUpload?.(file, previewUrl);
      })
      .catch((previewError) => {
        console.error("[TIFF] Preview failed:", previewError);
        console.log("[TIFF] Preview failed, but preserving original file for backend processing");
      });
  };

  const handleDetectClick = () => {
    console.log("=================================");
    console.log("[PIPELINE] DETECT BUTTON CLICKED");
    console.log("[PIPELINE] File:", uploadedFile);
    console.log("[PIPELINE] File name:", uploadedFile?.name);
    console.log("[PIPELINE] File type:", uploadedFile?.type);
    console.log("=================================");

    if (!uploadedFile && !currentScene) {
      console.error("[PIPELINE] Detect aborted: no uploaded file");
      alert("No file or scene selected for detection.");
      return;
    }

    void executePipeline(uploadedFile || undefined);
  };

  const executePipeline = async (file?: File) => {
    setIsProcessing(true);
    setPipelineStep(1);
    setOverlayImage(null);

    try {
      // Stage 1: Detect (SAR Segmentation -> Contract 1)
      let result: DetectionResponse;
      if (file) {
        console.log("[PIPELINE] Proceeding with original TIFF upload");
        console.log("[PIPELINE] Uploading ORIGINAL file to backend");
        console.log("[PIPELINE] Calling uploadScene():", file.name);
        result = await uploadScene(file);
      } else {
        const scenePath = currentScene.backendScenePath || currentScene.id;
        console.log("[PIPELINE] Calling detectScene():", scenePath);
        result = await detectScene(scenePath);
      }

      console.log("[PIPELINE] CONTRACT 1 RECEIVED:", result);
      setContract1(result);
      onContract1(result);
      setOverlayImage(result.overlay_image ?? null);
      console.log("[PIPELINE] Contract 1 stored");
      console.log("[PIPELINE] Detection stage completed");

      // Stage 2: Morph (Morphological Geometry Analysis from Contract 1)
      console.log("[PIPELINE] Starting MORPH stage");
      setPipelineStep(2);
      console.log("[PIPELINE] Morph stage completed");

      // Stage 3: Drift (Numerical Drift Simulation -> Contract 2 Corridor)
      console.log("[PIPELINE] Starting DRIFT stage");
      console.log("[PIPELINE] Sending Contract 1 to getCorridor");
      setPipelineStep(3);
      const corridorResult = await getCorridor(result, 'analytic');
      console.log("[PIPELINE] Contract 2 received:", corridorResult);
      console.log("[PIPELINE] Drift stage completed");
      if (onCorridorReady) {
        onCorridorReady(corridorResult);
      }

      // Stage 4: Match (AIS Candidate Matrix Correlation -> Contract 3)
      console.log("[PIPELINE] Starting MATCH stage");
      setPipelineStep(4);
      const attributionResult = await rankSuspects(corridorResult, result.orientation_deg);
      console.log("[PIPELINE] Contract 3 received:", attributionResult);
      if (attributionResult.suspects && attributionResult.suspects.length > 0) {
        console.log("[PIPELINE] Top suspect:", attributionResult.suspects[0]);
        if (onTopSuspectReady) {
          onTopSuspectReady(attributionResult.suspects[0]);
        }
      }
      console.log("[PIPELINE] Match stage completed");

      // All 4 stages successfully verified and complete!
      setPipelineStep(5);
      console.log("[PIPELINE] ALL PIPELINE STAGES COMPLETED");
      console.log("[NAVIGATION] Pipeline complete");
      console.log("[NAVIGATION] Navigating to Analysis");

      setTimeout(() => {
        if (onContinueToAnalysis) {
          onContinueToAnalysis();
        } else if (onContinueToMap) {
          onContinueToMap();
        }
      }, 500);

    } catch (error) {
      console.error("[PIPELINE] PIPELINE FAILED:", error);
      setContract1(null);
      setOverlayImage(null);
      onContract1(null);
      if (onCorridorReady) onCorridorReady(null);
      if (onTopSuspectReady) onTopSuspectReady(null);
      setPipelineStep(1);

      alert(
        error instanceof Error
          ? error.message
          : "Backend pipeline execution failed."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const pipelineSteps = [
    { num: 1, label: 'Detect', sub: 'Segmented' },
    { num: 2, label: 'Morph', sub: 'Geometry' },
    { num: 3, label: 'Drift', sub: 'HYCOM/GFS' },
    { num: 4, label: 'Match', sub: 'AIS Matrix' },
  ];

  return (
    <div
      className="absolute inset-0 overflow-y-auto p-6 flex flex-col"
      style={{ background: 'var(--gov-bg)' }}
    >
      {/* Light mode background */}
      <img
        src={APP_BACKGROUND}
        alt="Background"
        className="ingest-bg-light absolute z-[0] inset-0 w-full h-full object-cover opacity-40 pointer-events-none transition-opacity duration-300"
      />
      {/* Dark mode background — background_dark */}
      <img
        src={APP_BACKGROUND_DARK}
        alt="Background Dark"
        className="ingest-bg-dark absolute z-[0] inset-0 w-full h-full object-cover opacity-80 pointer-events-none transition-opacity duration-300"
      />
      <div className="max-w-[100rem] md:max-w-7xl mx-auto w-full flex flex-col gap-6">

        {/* Page heading — government style */}
        <div className="z-10 relative">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-xs mb-3" style={{ color: 'var(--gov-text-muted)' }}>
            <span>SpillTrace Portal</span>
            <ChevronRight className="w-3 h-3" />
            <span style={{ color: 'var(--gov-navy)', fontWeight: 600 }}>Scene Ingestion</span>
          </div>

          {/* Saffron accent left-border heading */}
          <div className="pl-2">
            <h1 className="text-4xl font-bold pb-1" style={{ color: 'var(--gov-navy)', fontFamily: 'var(--font-gov)' }}>
              SAR Scene Ingestion & Forensics
            </h1>
            <p className="text-sm font-medium" style={{ color: 'var(--gov-text-secondary)' }}>
              Upload synthetic aperture radar products or select preloaded benchmark oceanic scenes for
              classical dark-formation slick detection, hindcast particle modelling, and AIS target attribution.
            </p>
          </div>
        </div>

        {/* Two-column grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 z-10 relative">

          {/* Dropzone Card */}
          <div
            id="drop-zone"
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`flag-card ${dragOver ? 'drag-over' : ''} lg:col-span-7 relative flex flex-col justify-between min-h-[240px] p-6`}
            style={{
              cursor: 'pointer'
            }}
          >
            <input
              type="file"
              accept=".jpg,.jpeg,.zip,.SAFE,.tif,.tiff,.geojson"
              onChange={handleFileUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
            />

            {/* Card section header */}
            <div className="bento-card-header mb-4">
              <span className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--gov-navy)' }}>
                <Upload className="w-7 h-7" style={{ color: 'var(--gov-saffron)' }} />
                Upload Target Product
              </span>
              <span className="tag">Level-1 GRD</span>
            </div>

            {/* Drop area */}
            <div className="flex flex-col items-center justify-center flex-1 py-6 text-center">
              <div
                className="w-14 h-14 flex items-center justify-center mb-3 rounded"
                style={{
                  background: customFileName ? 'var(--gov-green-light)' : 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid var(--gov-border)'
                }}
              >
                {customFileName
                  ? <FileCheck className="w-7 h-7" style={{ color: 'var(--gov-green)' }} />
                  : <CloudUpload className="w-7 h-7 hover:bg-var(--gov-navy)" style={{ color: 'var(--gov-text-secondary)' }} />
                }
              </div>
              <h3 className="font-semibold text-sm mb-1" style={{ color: 'var(--gov-text-primary)' }}>
                {customFileName ? customFileName : 'Drop SAR Scene (.jpg, .tif, .SAFE, .zip)'}
              </h3>
              <p className="text-xs" style={{ color: 'var(--gov-text-muted)' }}>
                {customFileName
                  ? 'Payload calibrated & ready for feature extraction'
                  : 'Drag file here or click to browse filesystem'}
              </p>
            </div>

            {/* Footer info */}
            <div
              className="flex items-center justify-between pt-3 text-xs"
              style={{ borderTop: '1px solid var(--gov-border)', color: 'var(--gov-text-muted)' }}
            >
              <span className="font-mono">Accepted: .jpg, .jpeg, .SAFE, .tif, .zip, .geojson</span>
              <span className="font-mono">Max: 4.2 GB</span>
            </div>
          </div>
          {/* Preloaded Scenes Card */}
          <div
            className="flag-card lg:col-span-5 flex flex-col p-5"
          >
            <div className="bento-card-header mb-3">
              <span className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--gov-navy)' }}>
                <Satellite className="w-7 h-7" style={{ color: 'var(--gov-green)' }} />
                Preloaded Benchmark Scenes
              </span>
              <span className="tag tag-emerald">{DEMO_SCENES.length} Available</span>
            </div>

            <div className="flex flex-col gap-2 flex-1">
              {DEMO_SCENES.map((scene) => {
                const isSelected = currentScene.id === scene.id;
                return (
                  <div
                    key={scene.id}
                    onClick={() => handleSelectDemo(scene.id)}
                    className="p-3 flex items-center gap-3 cursor-pointer transition-colors rounded"
                    style={{
                      background: isSelected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                      backdropFilter: 'blur(6px)',
                      border: isSelected ? '1px solid var(--gov-green)' : '1px solid var(--gov-border)',
                      borderLeft: isSelected ? '3px solid var(--gov-green)' : '1px solid var(--gov-border)'
                    }}
                  >
                    <div
                      className="w-15 h-15 bg-cover bg-center shrink-0 rounded"
                      style={{ backgroundImage: `url(${scene.thumbnailUrl})`, border: '1px solid var(--gov-border)' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold truncate" style={{ color: 'var(--gov-text-primary)' }}>
                          {scene.name}
                        </span>
                        {isSelected && (
                          <Check className="w-3.5 h-3.5 shrink-0 ml-1" style={{ color: 'var(--gov-green)' }} />
                        )}
                      </div>
                      <span className="font-mono text-[12px] block mt-0.5" style={{ color: 'var(--gov-text-muted)' }}>
                        {isSelected && pipelineStep >= 5 ? 'Pipeline Complete (Stages 1-4)' : isSelected && pipelineStep >= 2 ? 'Contract 1 Loaded' : 'Awaiting Ingestion'} · {scene.satellite} ({scene.mode})
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Pipeline Execution State */}
        {overlayImage && (
          <div className="flag-card p-5 z-10 relative">
            <div className="bento-card-header mb-4">
              <span className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--gov-navy)' }}>
                Detected Slick Overlay
              </span>
              <span className="tag tag-emerald">Mask + Bounding Box</span>
            </div>
            <div className="overflow-hidden rounded" style={{ border: '1px solid var(--gov-border)', background: '#111827' }}>
              <img
                src={overlayImage}
                alt="SAR image with detected oil slick mask and bounding box"
                className="block w-full max-h-[520px] object-contain"
              />
            </div>
          </div>
        )}

        {/* Pipeline Execution State */}
        <div
          className="flag-card p-5 z-10 relative"

        >
          <div className="bento-card-header mb-4">
            <span className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--gov-navy)' }}>
              <Clock className="w-7 h-7" style={{ color: 'var(--gov-saffron)' }} />
              Pipeline Execution State
            </span>
            <span className={`tag ${pipelineStep >= 5 ? 'tag-emerald' : isProcessing ? 'tag-amber' : ''}`}>
              <span
                className="w-1.5 h-1.5 rounded-full inline-block mr-1"
                style={{ background: pipelineStep >= 5 ? 'var(--gov-green)' : isProcessing ? 'var(--gov-saffron)' : 'var(--gov-navy)' }}
              />
              {pipelineStep >= 5 ? 'Verified Complete' : isProcessing ? 'Processing' : 'System Ready'}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-3">
            {pipelineSteps.map(step => {
              const isDone = pipelineStep > step.num;
              const isRunning = isProcessing && pipelineStep === step.num;
              const isPending = pipelineStep < step.num;
              return (
                <div
                  key={step.num}
                  className="p-3 flex flex-col items-center gap-1.5 cursor-default transition-colors rounded"
                  style={{
                    background: isDone || isRunning ? 'var(--gov-navy-light)' : 'var(--gov-surface-alt)',
                    border: `1px solid ${isDone ? 'var(--gov-green)' : isRunning ? 'var(--gov-navy)' : 'var(--gov-border)'}`
                  }}
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{
                      background: isDone ? 'var(--gov-green)' : isRunning ? 'var(--gov-navy)' : 'var(--gov-border-strong)',
                      color: '#ffffff'
                    }}
                  >
                    {isRunning
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : isDone
                        ? <Check className="w-3.5 h-3.5" />
                        : step.num
                    }
                  </div>
                  <span className="text-[14px] font-semibold" style={{ color: isPending ? 'var(--gov-text-muted)' : 'var(--gov-text-primary)' }}>
                    {step.num}. {step.label}
                  </span>
                  <span className="text-[10px]" style={{ color: 'var(--gov-text-secondary)' }}>{step.sub}</span>
                </div>
              );
            })}
          </div>

          <div
            className="mt-4 pt-3 flex items-center justify-between text-xs"
            style={{ borderTop: '1px solid var(--gov-border)', color: 'var(--gov-text-muted)' }}
          >
            <span className="flex items-center gap-2">
              <span className="font-semibold" style={{ color: 'var(--gov-text-primary)' }}>Automatic Pipeline Flow:</span>
              <span className="font-mono text-[11px]" style={{ color: isProcessing ? 'var(--gov-saffron)' : pipelineStep >= 5 ? 'var(--gov-green)' : 'var(--gov-text-muted)' }}>
                {isProcessing
                  ? pipelineStep === 1
                    ? 'Stage 1/4: Segmenting SAR scene (Contract 1)...'
                    : pipelineStep === 2
                      ? 'Stage 2/4: Extracting morphological geometry...'
                      : pipelineStep === 3
                        ? 'Stage 3/4: Calculating backward drift corridor (Contract 2)...'
                        : 'Stage 4/4: Correlating AIS vessel candidate matrix (Contract 3)...'
                  : pipelineStep >= 5
                    ? 'All 4 Pipeline Stages Successfully Executed & Verified'
                    : pipelineStep >= 2
                      ? `Contract 1 Verified — Advance or Re-run`
                      : 'Select benchmark scene or upload SAR product to execute'}
              </span>
            </span>
            <span className="font-semibold" style={{ color: pipelineStep >= 5 ? 'var(--gov-green)' : isProcessing ? 'var(--gov-saffron)' : 'var(--gov-navy)' }}>
              {pipelineStep >= 5 ? 'Completed (4/4)' : isProcessing ? `Running Stage ${pipelineStep}/4` : 'Status: Ready'}
            </span>
          </div>
        </div>

        {/* Action Bar */}
        <div
          className="flex flex-col sm:flex-row items-center justify-between gap-3 py-3 px-4 rounded z-10 relative"
          style={{ background: 'var(--gov-surface-alt)', border: '1px solid var(--gov-border)' }}
        >
          <div className="text-xs flex items-center gap-2" style={{ color: 'var(--gov-text-secondary)', fontFamily: 'var(--font-mono)' }}>
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{ background: uploadedFile ? 'var(--gov-green)' : 'var(--gov-navy)' }}
            />
            Target Product:&nbsp;
            <span className="font-semibold" style={{ color: 'var(--gov-navy)' }}>
              {uploadedFile ? uploadedFile.name : currentScene.name}
            </span>
            {uploadedFile ? ` (${(uploadedFile.size / 1024 / 1024).toFixed(2)} MB)` : ` (${currentScene.locationName})`}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              id="execute-pipeline-btn"
              onClick={handleDetectClick}
              disabled={!canDetect}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: 'var(--gov-navy)',
                color: '#ffffff',
                border: '1px solid var(--gov-navy)',
                borderRadius: '3px'
              }}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Processing Stage {pipelineStep}/4...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{uploadedFile ? "Detect & Execute Pipeline" : "Execute Full Pipeline"}</span>
                </>
              )}
            </button>

            <button
              id="continue-to-analysis-btn"
              onClick={() => {
                console.log("[NAVIGATION] User clicked Proceed to Coordinate Analysis Map");
                console.log("[NAVIGATION] Navigating to Analysis");
                if (onContinueToAnalysis) {
                  onContinueToAnalysis();
                } else if (onContinueToMap) {
                  onContinueToMap();
                }
              }}
              className="flex items-center gap-2 px-5 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer"
              style={{
                background: 'var(--gov-green)',
                color: '#ffffff',
                border: '1px solid var(--gov-green-dim)',
                borderRadius: '3px'
              }}
            >
              <span>Proceed to Detection Analysis</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
