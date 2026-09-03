import React, { useState } from 'react';
import { SceneMetadata } from '../../types';
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
  Upload
} from 'lucide-react';
import { hover } from 'motion';

interface IngestViewProps {
  currentScene: SceneMetadata;
  setCurrentScene: (scene: SceneMetadata) => void;
  onContinueToMap: () => void;
}

export const IngestView: React.FC<IngestViewProps> = ({
  currentScene,
  setCurrentScene,
  onContinueToMap
}) => {
  const [pipelineStep, setPipelineStep] = useState<number>(2);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [customFileName, setCustomFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<boolean>(false);

  const handleSelectDemo = (sceneId: string) => {
    const scene = DEMO_SCENES.find(s => s.id === sceneId);
    if (scene) {
      setCurrentScene(scene);
      setCustomFileName(null);
      triggerPipelineSim();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCustomFileName(file.name);
      triggerPipelineSim();
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setCustomFileName(e.dataTransfer.files[0].name);
      triggerPipelineSim();
    }
  };

  const triggerPipelineSim = () => {
    setIsProcessing(true);
    setPipelineStep(1);
    setTimeout(() => {
      setPipelineStep(2);
      setTimeout(() => {
        setPipelineStep(3);
        setTimeout(() => {
          setPipelineStep(4);
          setIsProcessing(false);
        }, 700);
      }, 700);
    }, 700);
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
      <div className="max-w-7xl mx-auto w-full flex flex-col gap-6">

        {/* Page heading — government style */}
        <div>
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
            <p className="text-sm text-black font-medium">
              Upload synthetic aperture radar products or select preloaded benchmark oceanic scenes for
              neural slick detection, hindcast particle modelling, and AIS target attribution.
            </p>
          </div>
        </div>

        {/* Two-column grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

          {/* Dropzone Card */}
          <div
            id="drop-zone"
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className="lg:col-span-7 relative flex flex-col justify-between min-h-[240px] p-6"
            style={{
              background: '#ffffff',
              border: dragOver ? '2px solid var(--gov-green)' : '2px solid #c6d7e7ff',
              borderRadius: '20px',
              cursor: 'pointer',
              transition: 'border-color 0.2s'
            }}
          >
            <input
              type="file"
              accept=".zip,.SAFE,.tif,.tiff,.geojson"
              onChange={handleFileUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
            />

            {/* Card section header */}
            <div className="bento-card-header mb-4">
              <span className="flex items-center gap-1.5" style={{ color: 'var(--gov-navy)' }}>
                <Upload className="w-4 h-4" style={{ color: 'var(--gov-saffron)' }} />
                Upload Target Product
              </span>
              <span className="tag">Level-1 GRD</span>
            </div>

            {/* Drop area */}
            <div className="flex flex-col items-center justify-center flex-1 py-6 text-center">
              <div
                className="w-14 h-14 flex items-center justify-center mb-3 rounded"
                style={{
                  background: customFileName ? 'var(--gov-green-light)' : 'var(--gov-surface-alt)',
                  border: '1px solid var(--gov-border)'
                }}
              >
                {customFileName
                  ? <FileCheck className="w-7 h-7" style={{ color: 'var(--gov-green)' }} />
                  : <CloudUpload className="w-7 h-7 hover:bg-var(--gov-navy)" style={{ color: 'var(--gov-text-secondary)' }} />
                }
              </div>
              <h3 className="font-semibold text-sm mb-1" style={{ color: 'var(--gov-text-primary)' }}>
                {customFileName ? customFileName : 'Drop SAR Scene (.SAFE, .tif, .zip)'}
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
              <span className="font-mono">Accepted: .SAFE, .tif, .zip, .geojson</span>
              <span className="font-mono">Max: 4.2 GB</span>
            </div>
          </div>

          {/* Preloaded Scenes Card */}
          <div
            className="lg:col-span-5 flex flex-col p-5"
            style={{ background: '#ffffff', border: '2px solid var(--gov-border)', borderRadius: '20px' }}
          >
            <div className="bento-card-header mb-3">
              <span className="flex items-center gap-1.5" style={{ color: 'var(--gov-navy)' }}>
                <Satellite className="w-3.5 h-3.5" style={{ color: 'var(--gov-green)' }} />
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
                      background: isSelected ? 'var(--gov-green-light)' : '#F5F6F8',
                      border: isSelected ? '1px solid var(--gov-green)' : '1px solid var(--gov-border)',
                      borderLeft: isSelected ? '3px solid var(--gov-green)' : '1px solid var(--gov-border)'
                    }}
                  >
                    <div
                      className="w-12 h-12 bg-cover bg-center shrink-0 rounded"
                      style={{ backgroundImage: `url(${scene.thumbnailUrl})`, border: '1px solid var(--gov-border)' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold truncate" style={{ color: 'var(--gov-text-primary)' }}>
                          {scene.name}
                        </span>
                        {isSelected && (
                          <Check className="w-3.5 h-3.5 shrink-0 ml-1" style={{ color: 'var(--gov-green)' }} />
                        )}
                      </div>
                      <span className="font-mono text-[10px] block mt-0.5" style={{ color: 'var(--gov-text-muted)' }}>
                        {scene.detections ? `${scene.detections.length} Slicks` : '1 Slick'} · {scene.satellite} ({scene.mode})
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Pipeline Execution State */}
        <div
          className="p-5"
          style={{ background: '#ffffff', border: '2px solid var(--gov-border)', borderRadius: '20px' }}
        >
          <div className="bento-card-header mb-4">
            <span className="flex items-center gap-1.5" style={{ color: 'var(--gov-navy)' }}>
              <Clock className="w-4 h-4" style={{ color: 'var(--gov-saffron)' }} />
              Pipeline Execution State
            </span>
            <span className="tag tag-emerald">
              <span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{ background: 'var(--gov-green)' }} />
              System Active
            </span>
          </div>

          <div className="grid grid-cols-4 gap-3">
            {pipelineSteps.map(step => {
              const isDone = pipelineStep > step.num;
              const isRunning = pipelineStep === step.num;
              const isPending = pipelineStep < step.num;
              return (
                <div
                  key={step.num}
                  onClick={() => setPipelineStep(step.num)}
                  className="p-3 flex flex-col items-center gap-1.5 cursor-pointer transition-colors rounded"
                  style={{
                    background: isDone || isRunning ? 'var(--gov-navy-light)' : '#F5F6F8',
                    border: `1px solid ${isDone ? 'var(--gov-green)' : isRunning ? 'var(--gov-navy)' : 'var(--gov-border)'}`
                  }}
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{
                      background: isDone ? 'var(--gov-green)' : isRunning ? 'var(--gov-navy)' : '#CBD5E0',
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
                  <span className="text-[11px] font-semibold" style={{ color: isPending ? 'var(--gov-text-muted)' : 'var(--gov-text-primary)' }}>
                    {step.num}. {step.label}
                  </span>
                  <span className="text-[9px]" style={{ color: 'var(--gov-text-muted)' }}>{step.sub}</span>
                </div>
              );
            })}
          </div>

          <div
            className="mt-4 pt-3 flex items-center justify-between text-xs"
            style={{ borderTop: '1px solid var(--gov-border)', color: 'var(--gov-text-muted)' }}
          >
            <span>Automatic Pipeline Trigger</span>
            <span className="font-semibold" style={{ color: 'var(--gov-green)' }}>
              Status: Active
            </span>
          </div>
        </div>

        {/* Action Bar */}
        <div
          className="flex items-center justify-between py-3 px-4 rounded"
          style={{ background: '#EEF0F7', border: '1px solid #C5CAE9' }}
        >
          <div className="text-xs flex items-center gap-2" style={{ color: 'var(--gov-text-secondary)', fontFamily: 'var(--font-mono)' }}>
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{ background: 'var(--gov-green)' }}
            />
            Selected Scene:&nbsp;
            <span className="font-semibold" style={{ color: 'var(--gov-navy)' }}>
              {currentScene.name}
            </span>
            &nbsp;({currentScene.locationName})
          </div>

          <button
            id="continue-to-map-btn"
            onClick={onContinueToMap}
            className="flex items-center gap-2 px-5 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer"
            style={{
              background: 'var(--gov-green)',
              color: '#ffffff',
              border: '1px solid var(--gov-green-dim)',
              borderRadius: '3px'
            }}
          >
            <span>Proceed to Interactive GIS Map</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );
};
