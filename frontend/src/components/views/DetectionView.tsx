import React, { useMemo, useState, useRef, useEffect } from 'react';
import { MorphologicalProperties, SceneMetadata } from '../../types';
import { LatLon, projectPoints } from '../../utils/geoProjection';
import { DetectionResponse, createDetectionFromContract1 } from '../../api/api';
import { generateSarPreview } from '../../utils/sarPreview';
import {
  ShieldCheck,
  X,
  ArrowRight,
  History,
  Droplet,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Radio,
  Crosshair,
  AlertTriangle,
  PanelRightOpen,
} from 'lucide-react';

export interface DetectionViewProps {
  currentScene: SceneMetadata;
  detection: MorphologicalProperties | null;
  contract1?: DetectionResponse | null;
  uploadedFile?: File | null;
  sarPreviewUrl?: string | null;
  onSelectDetection?: (detection: MorphologicalProperties) => void;
  onViewDriftAnalysis: () => void;
  onCloseDrawer?: () => void;
  onGoToIngest?: () => void;
}

export const DetectionView: React.FC<DetectionViewProps> = ({
  currentScene,
  detection: _detection,
  contract1,
  uploadedFile,
  sarPreviewUrl,
  onSelectDetection,
  onViewDriftAnalysis,
  onCloseDrawer,
  onGoToIngest
}) => {
  // ── 1. Debug Logging on Mount & State Changes ─────────────────────────────
  useEffect(() => {
    console.log("[ANALYSIS IMAGE] AnalysisView mounted");
  }, []);

  useEffect(() => {
    if (uploadedFile) {
      console.log("[ANALYSIS IMAGE] Uploaded file:", uploadedFile);
      console.log("[ANALYSIS IMAGE] File name:", uploadedFile.name);
      console.log("[ANALYSIS IMAGE] File type:", uploadedFile.type);
      console.log("[ANALYSIS IMAGE] File size:", uploadedFile.size);
    }
  }, [uploadedFile]);

  useEffect(() => {
    if (sarPreviewUrl) {
      console.log("[ANALYSIS IMAGE] SAR preview URL:", sarPreviewUrl);
    }
  }, [sarPreviewUrl]);

  useEffect(() => {
    if (contract1) {
      console.log("[ANALYSIS] Contract 1:", contract1);
      console.log("[ANALYSIS] Polygon:", contract1.polygon);
      console.log("[ANALYSIS] Centroid:", contract1.centroid);
      console.log("[ANALYSIS] Area:", contract1.area_km2);
      console.log("[ANALYSIS] Confidence:", contract1.confidence);
    }
  }, [contract1]);

  // ── 2. Image Source Resolution ────────────────────────────────────────────
  const [displayImageUrl, setDisplayImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageDims, setImageDims] = useState<{
    naturalWidth: number;
    naturalHeight: number;
    displayWidth: number;
    displayHeight: number;
  } | null>(null);

  useEffect(() => {
    let isCancelled = false;
    let localBlobUrl: string | null = null;

    if (sarPreviewUrl) {
      setDisplayImageUrl(sarPreviewUrl);
      setImageError(null);
    } else if (uploadedFile) {
      console.log("[ANALYSIS IMAGE] Generating SAR preview from uploaded file:", uploadedFile.name);
      generateSarPreview(uploadedFile)
        .then((url) => {
          if (isCancelled) {
            if (url.startsWith('blob:')) URL.revokeObjectURL(url);
            return;
          }
          localBlobUrl = url;
          setDisplayImageUrl(url);
          setImageError(null);
          console.log("[ANALYSIS IMAGE] SAR preview generated successfully from file");
        })
        .catch((err) => {
          if (isCancelled) return;
          console.error("[ANALYSIS IMAGE] SAR image failed to load / decode:", err);
          setImageError('SAR image preview unavailable');
        });
    } else if (contract1?.overlay_image) {
      setDisplayImageUrl(contract1.overlay_image);
      setImageError(null);
    } else {
      console.warn("[ANALYSIS IMAGE] SAR image preview unavailable: No uploaded file or preview URL");
      setDisplayImageUrl(null);
      setImageError('SAR image preview unavailable');
    }

    return () => {
      isCancelled = true;
      if (localBlobUrl && localBlobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(localBlobUrl);
      }
    };
  }, [sarPreviewUrl, uploadedFile, contract1?.overlay_image]);

  // ── 3. State & Controls ───────────────────────────────────────────────────
  const [polarization, setPolarization] = useState<'VV' | 'VH' | 'RATIO'>('VV');
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(true);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panPosition, setPanPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const effectiveDetection: MorphologicalProperties = useMemo(() => {
    if (!contract1) {
      return {
        id: 'DET-NONE',
        title: 'No Detection',
        areaKm2: 0,
        majorAxisKm: 0,
        minorAxisKm: 0,
        bearingDeg: 0,
        centroid: 'N/A',
        confidence: 0,
        status: 'SUSPECT',
        classification: 'SUSPECT ANOMALY',
        classificationDescription: 'No detection available.',
      };
    }
    return createDetectionFromContract1(contract1, currentScene);
  }, [contract1, currentScene]);

  const [probeData, setProbeData] = useState<{
    lat: string; lon: string;
    backscatterDb: number | string; isInsideSlick: boolean; dampingFactor: number | string;
  }>(() => ({
    lat: currentScene.lat.toFixed(4) + '°N',
    lon: Math.abs(currentScene.lon).toFixed(4) + (currentScene.lon >= 0 ? '°E' : '°W'),
    backscatterDb: 'N/A',
    isInsideSlick: true,
    dampingFactor: 'N/A'
  }));

  const [detectionStatus, setDetectionStatus] = useState<string>(effectiveDetection.status || 'CONFIRMED');

  useEffect(() => {
    setProbeData({
      lat: (contract1 ? contract1.centroid[1] : currentScene.lat).toFixed(4) + '°N',
      lon: Math.abs(contract1 ? contract1.centroid[0] : currentScene.lon).toFixed(4) + ((contract1 ? contract1.centroid[0] : currentScene.lon) >= 0 ? '°E' : '°W'),
      backscatterDb: 'N/A (Server Processed)',
      isInsideSlick: true,
      dampingFactor: 'N/A'
    });
    setDetectionStatus(effectiveDetection.status || 'CONFIRMED');
    setZoomLevel(1);
    setPanPosition({ x: 0, y: 0 });
  }, [currentScene.id, contract1, effectiveDetection.status]);

  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // ── 4. Coordinate Projector Anchored to Actual Image Dimensions ────────────
  const naturalWidth = imageDims?.naturalWidth || 1000;
  const naturalHeight = imageDims?.naturalHeight || 800;
  const scaleRatio = naturalWidth / 1000;

  const detectionProjector = useMemo(() => {
    if (!contract1) {
      return () => ({ x: naturalWidth / 2, y: naturalHeight / 2 });
    }
    const points: LatLon[] = [{ lat: contract1.centroid[1], lon: contract1.centroid[0] }];
    if (contract1.polygon?.[0]) {
      for (const pt of contract1.polygon[0]) {
        points.push({ lat: pt[1], lon: pt[0] });
      }
    }
    const padding = Math.round(naturalWidth * 0.16);
    return projectPoints(points, naturalWidth, naturalHeight, padding);
  }, [contract1, naturalWidth, naturalHeight]);

  // ── 5. Image Event Handlers ───────────────────────────────────────────────
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const image = e.currentTarget;
    console.log("[ANALYSIS IMAGE] SAR image loaded successfully");
    console.log("[ANALYSIS IMAGE] Natural dimensions:", {
      width: image.naturalWidth,
      height: image.naturalHeight
    });
    console.log("[ANALYSIS IMAGE] Image dimensions:", {
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      displayWidth: image.clientWidth,
      displayHeight: image.clientHeight
    });
    setImageDims({
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      displayWidth: image.clientWidth,
      displayHeight: image.clientHeight
    });
  };

  const handleImageError = () => {
    console.error("[ANALYSIS IMAGE] SAR image failed to load");
    setImageError('SAR image preview unavailable');
  };

  // ── 6. Pan & Zoom Handlers ────────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only left-click drag
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - panPosition.x, y: e.clientY - panPosition.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPanPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
    if (viewportRef.current) {
      const rect = viewportRef.current.getBoundingClientRect();
      const xPercent = (e.clientX - rect.left) / rect.width;
      const yPercent = (e.clientY - rect.top) / rect.height;
      const baseLat = contract1 ? contract1.centroid[1] : currentScene.lat;
      const baseLon = contract1 ? contract1.centroid[0] : currentScene.lon;
      const calcLat = (baseLat + (0.5 - yPercent) * 0.15).toFixed(4);
      const calcLon = (baseLon + (xPercent - 0.5) * 0.15).toFixed(4);
      const distFromCenter = Math.sqrt(Math.pow(xPercent - 0.5, 2) + Math.pow(yPercent - 0.5, 2));
      const isInside = distFromCenter < 0.12;
      setProbeData({
        lat: `${Math.abs(parseFloat(calcLat))}°${parseFloat(calcLat) >= 0 ? 'N' : 'S'}`,
        lon: `${Math.abs(parseFloat(calcLon))}°${parseFloat(calcLon) >= 0 ? 'E' : 'W'}`,
        backscatterDb: 'N/A (Server Processed)',
        isInsideSlick: isInside,
        dampingFactor: 'N/A'
      });
    }
  };

  const handleMouseUp = () => setIsDragging(false);
  const handleZoom = (delta: number) => setZoomLevel(prev => Math.min(Math.max(prev + delta, 0.5), 4.0));
  const resetView = () => { setZoomLevel(1); setPanPosition({ x: 0, y: 0 }); };

  /* Empty state when no detection response is loaded */
  if (!contract1) {
    return (
      <div className="flex-1 relative w-full h-[calc(100vh-72px)] bg-[#09090b] flex items-center justify-center select-none">
        <div
          className="flex flex-col items-center gap-4 p-8 max-w-md text-center"
          style={{ background: 'var(--gov-surface)', border: '1px solid var(--gov-border)', borderTop: '3px solid var(--gov-navy)', borderRadius: '2px' }}
        >
          <Crosshair className="w-8 h-8" style={{ color: 'var(--gov-saffron)' }} />
          <h2 className="text-sm font-bold" style={{ color: 'var(--gov-navy)' }}>No Detection Loaded</h2>
          <p className="text-xs" style={{ color: 'var(--gov-text-secondary)' }}>
            Run scene ingestion first to process this scene through the backend detector and generate slick anomalies.
          </p>
          <button
            onClick={onGoToIngest || onCloseDrawer}
            className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer"
            style={{ background: 'var(--gov-green)', color: '#ffffff', border: 'none', borderRadius: '2px' }}
          >
            Go to Ingestion
          </button>
        </div>
      </div>
    );
  }

  // Pre-render log
  if (displayImageUrl && !imageError) {
    console.log("[ANALYSIS IMAGE] Rendering uploaded SAR image");
  }

  /* Helper for metric cards */
  const StatCard = ({ label, value, unit }: { label: string; value: string | number; unit?: string }) => (
    <div
      className="p-3 flex flex-col justify-center"
      style={{ background: 'var(--gov-surface-alt)', border: '1px solid var(--gov-border)', borderRadius: '2px' }}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--gov-text-muted)' }}>{label}</span>
      <span className="font-mono text-sm font-bold" style={{ color: 'var(--gov-text-primary)' }}>
        {value}{unit && <span className="text-xs font-normal ml-1" style={{ color: 'var(--gov-text-muted)' }}>{unit}</span>}
      </span>
    </div>
  );

  return (
    <div className="flex-1 relative w-full h-[calc(100vh-72px)] bg-[#09090b] overflow-hidden flex select-none">

      {/* SAR radar viewport */}
      <div
        id="radar-viewport-container"
        ref={viewportRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="flex-1 h-full relative overflow-hidden cursor-crosshair bg-[#050508] flex items-center justify-center select-none"
      >
        {/* Transform wrapper applying shared Pan & Zoom to image and overlays */}
        <div
          className="w-full h-full flex items-center justify-center transition-transform duration-75 origin-center pointer-events-none"
          style={{ transform: `translate(${panPosition.x}px, ${panPosition.y}px) scale(${zoomLevel})` }}
        >
          {displayImageUrl && !imageError ? (
            /* Shared Image Container that wraps the rendered image exactly */
            <div
              className="relative inline-block pointer-events-auto max-w-full max-h-full"
              style={{
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
              }}
            >
              {/* Layer 1: Actual uploaded SAR image */}
              <img
                ref={imageRef}
                src={displayImageUrl}
                alt="Uploaded SAR scene"
                onLoad={handleImageLoad}
                onError={handleImageError}
                draggable={false}
                className={`max-h-[calc(100vh-100px)] ${isDrawerOpen ? 'max-w-[calc(100vw-500px)]' : 'max-w-[94vw]'} object-contain block select-none pointer-events-none transition-all duration-300 ${
                  polarization === 'VV'
                    ? 'grayscale contrast-125 brightness-95'
                    : polarization === 'VH'
                      ? 'grayscale contrast-150 brightness-110'
                      : 'sepia contrast-150 brightness-105'
                }`}
              />

              {/* Layer 2: Detection mask/overlay from backend if available */}
              {contract1.overlay_image && contract1.overlay_image !== displayImageUrl && (
                <img
                  src={contract1.overlay_image}
                  alt="Backend Detection Overlay"
                  draggable={false}
                  className="absolute inset-0 w-full h-full object-fill pointer-events-none opacity-80"
                  style={{ mixBlendMode: 'screen' }}
                />
              )}

              {/* Coordinate grid overlay */}
              <div
                className="absolute inset-0 w-full h-full pointer-events-none opacity-20"
                style={{
                  backgroundImage: `linear-gradient(rgba(0,100,255,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(0,100,255,0.2) 1px, transparent 1px)`,
                  backgroundSize: '80px 80px'
                }}
              />

              {/* Layer 3 & 4: Detection polygon, bounding geometry, centroid */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-auto"
                viewBox={`0 0 ${naturalWidth} ${naturalHeight}`}
                preserveAspectRatio="none"
              >
                <defs>
                  <filter id="radar-glow" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation={4 * scaleRatio} result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                  <radialGradient id="slick-primary-fill" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="70%" stopColor="#2563eb" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.05} />
                  </radialGradient>
                  <radialGradient id="slick-lookalike-fill" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#b45309" stopOpacity={0.05} />
                  </radialGradient>
                </defs>

                {/* Radar range rings centered on detected slick centroid */}
                {(() => {
                  const { x: cx, y: cy } = detectionProjector({ lat: contract1.centroid[1], lon: contract1.centroid[0] });
                  return (
                    <g opacity="0.35" stroke="#3b82f6" strokeWidth={0.8 * scaleRatio} fill="none">
                      <circle cx={cx} cy={cy} r={70 * scaleRatio} strokeDasharray={`${4 * scaleRatio} ${6 * scaleRatio}`} />
                      <circle cx={cx} cy={cy} r={140 * scaleRatio} strokeDasharray={`${3 * scaleRatio} ${9 * scaleRatio}`} />
                      <circle cx={cx} cy={cy} r={220 * scaleRatio} strokeDasharray={`${2 * scaleRatio} ${12 * scaleRatio}`} />
                      <line x1={cx} y1={Math.max(0, cy - 260 * scaleRatio)} x2={cx} y2={Math.min(naturalHeight, cy + 260 * scaleRatio)} strokeDasharray={`${4 * scaleRatio} ${4 * scaleRatio}`} />
                      <line x1={Math.max(0, cx - 260 * scaleRatio)} y1={cy} x2={Math.min(naturalWidth, cx + 260 * scaleRatio)} y2={cy} strokeDasharray={`${4 * scaleRatio} ${4 * scaleRatio}`} />
                    </g>
                  );
                })()}

                {/* Layer 3: Real detected slick polygon from Contract 1 */}
                {contract1.polygon?.[0] && (() => {
                  const polyPts = contract1.polygon[0].map(pt => detectionProjector({ lat: pt[1], lon: pt[0] }));
                  if (polyPts.length < 3) return null;
                  const polyPathD = polyPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ' Z';
                  return (
                    <path
                      d={polyPathD}
                      fill="url(#slick-primary-fill)"
                      stroke={effectiveDetection.confidence >= 70 ? "#60a5fa" : "#f59e0b"}
                      strokeWidth={2.5 * scaleRatio}
                      filter="url(#radar-glow)"
                    />
                  );
                })()}

                {/* Layer 3 & 4: Principal axes ellipse & Centroid derived from Contract 1 */}
                {(() => {
                  const { x: cx, y: cy } = detectionProjector({ lat: contract1.centroid[1], lon: contract1.centroid[0] });
                  const rx = Math.max(contract1.major_axis_km * 12 * scaleRatio, 35 * scaleRatio);
                  const ry = Math.max(contract1.minor_axis_km * 16 * scaleRatio, 18 * scaleRatio);
                  const rot = contract1.orientation_deg;
                  const isConfirmed = contract1.confidence >= 0.7;
                  return (
                    <g className="cursor-pointer group">
                      <ellipse
                        cx={cx} cy={cy} rx={rx} ry={ry}
                        transform={`rotate(${rot - 90} ${cx} ${cy})`}
                        fill="none"
                        stroke={isConfirmed ? "#60a5fa" : "#f59e0b"}
                        strokeWidth={2 * scaleRatio}
                        strokeDasharray={`${4 * scaleRatio} ${4 * scaleRatio}`}
                      />
                      <line
                        x1={cx - Math.cos((rot * Math.PI) / 180) * (rx * 1.2)}
                        y1={cy - Math.sin((rot * Math.PI) / 180) * (rx * 1.2)}
                        x2={cx + Math.cos((rot * Math.PI) / 180) * (rx * 1.2)}
                        y2={cy + Math.sin((rot * Math.PI) / 180) * (rx * 1.2)}
                        stroke="#60a5fa"
                        strokeWidth={1.5 * scaleRatio}
                        strokeDasharray={`${3 * scaleRatio} ${3 * scaleRatio}`}
                      />
                      {/* Centroid core & radar ring */}
                      <circle cx={cx} cy={cy} r={4 * scaleRatio} fill={isConfirmed ? "#3b82f6" : "#f59e0b"} />
                      <circle cx={cx} cy={cy} r={14 * scaleRatio} fill="none" stroke={isConfirmed ? "#3b82f6" : "#f59e0b"} strokeWidth={1 * scaleRatio} opacity="0.6" />
                    </g>
                  );
                })()}
              </svg>
            </div>
          ) : (
            /* Fallback when SAR image preview is unavailable — NEVER a silent black canvas! */
            <div
              className="p-8 max-w-md text-center flex flex-col items-center gap-3 shadow-xl pointer-events-auto"
              style={{ background: 'var(--gov-surface)', border: '1px solid var(--gov-border)', borderTop: '3px solid var(--gov-saffron)', borderRadius: '2px' }}
            >
              <AlertTriangle className="w-8 h-8" style={{ color: 'var(--gov-saffron)' }} />
              <h3 className="text-sm font-bold" style={{ color: 'var(--gov-navy)' }}>
                SAR image preview unavailable
              </h3>
              <p className="text-xs" style={{ color: 'var(--gov-text-secondary)' }}>
                {imageError || 'No preview could be decoded for this uploaded product. The detection geometry is preserved.'}
              </p>
              {onGoToIngest && (
                <button
                  onClick={onGoToIngest}
                  className="mt-2 px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer"
                  style={{ background: 'var(--gov-navy)', color: '#ffffff', borderRadius: '2px' }}
                >
                  Re-upload SAR File
                </button>
              )}
            </div>
          )}
        </div>

        {/* Zoom controls — floating panel on map */}
        <div
          className="absolute top-4 right-4 z-30 flex flex-col gap-1 shadow-md"
          style={{ background: 'var(--gov-surface)', border: '1px solid var(--gov-border)', borderRadius: '2px' }}
        >
          <button onClick={() => handleZoom(0.2)} className="w-8 h-8 flex items-center justify-center cursor-pointer hover:bg-black/5" style={{ color: 'var(--gov-navy)' }} title="Zoom In"><ZoomIn className="w-4 h-4" /></button>
          <div style={{ height: '1px', background: 'var(--gov-border)' }} />
          <button onClick={() => handleZoom(-0.2)} className="w-8 h-8 flex items-center justify-center cursor-pointer hover:bg-black/5" style={{ color: 'var(--gov-navy)' }} title="Zoom Out"><ZoomOut className="w-4 h-4" /></button>
          <div style={{ height: '1px', background: 'var(--gov-border)' }} />
          <button onClick={resetView} className="w-8 h-8 flex items-center justify-center cursor-pointer hover:bg-black/5" style={{ color: 'var(--gov-navy)' }} title="Reset"><RotateCcw className="w-3.5 h-3.5" /></button>
        </div>

        {/* Button to reopen drawer when closed */}
        {!isDrawerOpen && (
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="absolute top-4 right-16 z-30 px-3 py-1.5 text-xs font-semibold shadow-md flex items-center gap-1.5 cursor-pointer hover:bg-black/5"
            style={{ background: 'var(--gov-surface)', border: '1px solid var(--gov-border)', borderRadius: '2px', color: 'var(--gov-navy)' }}
            title="Open Forensic Drawer"
          >
            <PanelRightOpen className="w-3.5 h-3.5" />
            <span>Forensic Matrix</span>
          </button>
        )}

        {/* Polarization selector */}
        <div
          className="absolute top-4 left-4 z-30 flex gap-0 overflow-hidden shadow-md"
          style={{ border: '1px solid var(--gov-border)', borderRadius: '2px' }}
        >
          {(['VV', 'VH', 'RATIO'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPolarization(p)}
              className="px-3 py-1.5 text-xs font-mono font-bold transition-colors cursor-pointer"
              style={{
                background: polarization === p ? 'var(--gov-navy)' : 'var(--gov-surface)',
                color: polarization === p ? '#ffffff' : 'var(--gov-text-secondary)',
                borderRight: p !== 'RATIO' ? '1px solid var(--gov-border)' : 'none'
              }}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Probe data bar */}
        <div className="absolute bottom-4 left-4 z-20 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 max-w-xl">
          <div
            className="flex items-center gap-3 px-3.5 py-2.5 shadow-md"
            style={{ background: 'var(--gov-surface)', border: '1px solid var(--gov-border)', borderRadius: '2px' }}
          >
            <div
              className="w-7 h-7 rounded flex items-center justify-center shrink-0"
              style={{ background: 'var(--gov-navy-light)', border: '1px solid var(--gov-navy)' }}
            >
              <Radio className="w-3.5 h-3.5 animate-pulse" style={{ color: 'var(--gov-navy)' }} />
            </div>
            <div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--gov-text-muted)' }}>Backend Detector</span>
                <span className="text-[10px] font-mono font-bold" style={{ color: 'var(--gov-green)' }}>
                  {contract1.detector.toUpperCase()}
                </span>
              </div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="font-mono text-base font-bold" style={{ color: 'var(--gov-text-primary)' }}>
                  {contract1.area_km2} <span className="text-xs font-normal" style={{ color: 'var(--gov-text-muted)' }}>km² detected</span>
                </span>
                <span className="text-[11px] font-mono" style={{ color: 'var(--gov-text-secondary)' }}>
                  Confidence: <strong style={{ color: 'var(--gov-navy)' }}>{Math.round(contract1.confidence * 100)}%</strong>
                </span>
              </div>
            </div>
          </div>

          <div
            className="flex items-center gap-2.5 px-3.5 py-2.5 shadow-md"
            style={{ background: 'var(--gov-surface)', border: '1px solid var(--gov-border)', borderRadius: '2px' }}
          >
            <Crosshair className="w-4 h-4" style={{ color: 'var(--gov-text-muted)' }} />
            <div>
              <span className="text-[10px] font-semibold block uppercase tracking-wider" style={{ color: 'var(--gov-text-muted)' }}>Centroid WGS84</span>
              <span className="font-mono text-xs font-medium" style={{ color: 'var(--gov-navy)' }}>
                {contract1.centroid[1].toFixed(4)}°N, {contract1.centroid[0].toFixed(4)}°E
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Forensic Drawer — government panel */}
      {isDrawerOpen && (
        <aside
          id="detection-forensic-drawer"
          className="w-full sm:w-[460px] z-30 flex flex-col shadow-2xl h-full shrink-0"
          style={{ background: 'var(--gov-surface)', borderLeft: '1px solid var(--gov-border)' }}
        >
          {/* Drawer header */}
          <div
            className="p-4 shrink-0"
            style={{ background: 'var(--gov-surface-alt)', borderBottom: '3px solid var(--gov-navy)' }}
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full`}
                  style={{ background: detectionStatus === 'CONFIRMED' ? 'var(--gov-green)' : 'var(--gov-saffron)' }}
                />
                <div>
                  <h2 className="text-sm font-bold tracking-tight" style={{ color: 'var(--gov-navy)' }}>
                    {effectiveDetection.id}: {effectiveDetection.title}
                  </h2>
                  <span className="text-[11px] font-mono" style={{ color: 'var(--gov-text-muted)' }}>
                    {contract1.centroid[1].toFixed(4)}°N, {contract1.centroid[0].toFixed(4)}°E
                  </span>
                </div>
              </div>
              <button
                onClick={() => { setIsDrawerOpen(false); if (onCloseDrawer) onCloseDrawer(); }}
                className="p-1 rounded transition-colors cursor-pointer hover:bg-black/5"
                style={{ color: 'var(--gov-text-muted)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className={`tag ${effectiveDetection.confidence >= 80 ? 'tag-active' : 'tag-amber'}`}>
                <ShieldCheck className="w-3.5 h-3.5" />
                {Math.round(contract1.confidence * 100)}% Detection Confidence
              </span>
              <span className="tag">{currentScene.satellite}</span>
              <span className="tag font-mono text-[10px]">{effectiveDetection.slickType || 'N/A (Unclassified)'}</span>
            </div>
          </div>

          {/* Drawer body */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

            {/* Morphological Geometry Matrix */}
            <section>
              <div className="gov-section-header">
                <span>Morphological Geometry Matrix</span>
                <span className="text-[10px] font-mono normal-case" style={{ color: 'var(--gov-text-muted)' }}>
                  CALC: {contract1.crs || 'WGS84'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <StatCard label="Surface Area" value={contract1.area_km2} unit="km²" />
                <StatCard label="Perimeter" value={effectiveDetection.perimeterKm || `${(contract1.major_axis_km * 3.14).toFixed(2)}`} unit="km" />
                <StatCard label="Major Axis (Length)" value={contract1.major_axis_km} unit="km" />
                <StatCard label="Minor Axis (Width)" value={contract1.minor_axis_km} unit="km" />
                <StatCard label="Orientation Angle" value={`${Math.round(contract1.orientation_deg)}° T`} />
                <StatCard label="Aspect Ratio (L/W)" value={`${(contract1.major_axis_km / Math.max(contract1.minor_axis_km, 0.01)).toFixed(2)} : 1`} />
                <StatCard label="Detector Model" value={contract1.detector.toUpperCase()} />
                <StatCard label="CRS Reference" value={contract1.crs || 'EPSG:4326'} />
              </div>
            </section>

            {/* Classification */}
            <div
              className="p-4"
              style={{
                background: 'var(--gov-navy-light)',
                border: '1px solid var(--gov-navy)',
                borderLeft: '4px solid var(--gov-navy)',
                borderRadius: '2px'
              }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-8 h-8 rounded flex items-center justify-center shrink-0"
                  style={{ background: 'var(--gov-navy)', color: '#ffffff' }}
                >
                  <Droplet className="w-4 h-4 fill-current" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--gov-navy)' }}>{effectiveDetection.classification}</span>
                    <span className="font-mono text-[11px] font-semibold" style={{ color: 'var(--gov-green)' }}>{Math.round(contract1.confidence * 100)}% Match</span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--gov-text-secondary)' }}>{effectiveDetection.classificationDescription}</p>
                </div>
              </div>
            </div>

            {/* Estimated Age */}
            <div
              className="p-3.5 flex items-center justify-between"
              style={{ background: 'var(--gov-warning-bg)', border: '1px solid var(--gov-saffron)', borderLeft: '4px solid var(--gov-saffron)', borderRadius: '2px' }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded flex items-center justify-center"
                  style={{ background: 'var(--gov-saffron)', color: '#ffffff' }}
                >
                  <History className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider block" style={{ color: 'var(--gov-text-muted)' }}>Estimated Age</span>
                  <span className="font-mono text-xs font-semibold" style={{ color: 'var(--gov-text-saffron)' }}>{effectiveDetection.estimatedAge || 'N/A (Hindcast required)'}</span>
                </div>
              </div>
              <span className="tag tag-amber text-[10px]">{effectiveDetection.estimatedAge ? 'Hindcast Verified' : 'Hindcast Required'}</span>
            </div>

          </div>

          {/* Drawer footer */}
          <div
            className="p-4 shrink-0"
            style={{ borderTop: '1px solid var(--gov-border)', background: 'var(--gov-surface-alt)' }}
          >
            <button
              id="view-drift-analysis-btn"
              onClick={onViewDriftAnalysis}
              className="w-full py-3 px-4 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer"
              style={{
                background: 'var(--gov-green)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '3px'
              }}
            >
              <span>Proceed to Numerical Drift Modelling ({effectiveDetection.id})</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </aside>
      )}
    </div>
  );
};

