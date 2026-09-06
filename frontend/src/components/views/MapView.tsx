import React, { useState, useRef, useMemo } from 'react';
import { CorridorResponse, GisLayers, MorphologicalProperties, SceneMetadata, Suspect } from '../../types';
import { DetectionResponse } from '../../api/api';
import { LatLon, parseCentroidString, projectPoints } from '../../utils/geoProjection';
import {
  Layers,
  Crosshair,
  Sliders,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ExternalLink,
  Eye,
  EyeOff
} from 'lucide-react';
import { MarineTrafficMap } from '../MarineTrafficMap';

interface MapViewProps {
  currentScene: SceneMetadata;
  activeDetection?: MorphologicalProperties;
  gisLayers: GisLayers;
  setGisLayers: React.Dispatch<React.SetStateAction<GisLayers>>;
  contract1: DetectionResponse | null;
  corridor: CorridorResponse | null;
  topSuspect: Suspect | null;
  onSelectDetection?: (detection?: MorphologicalProperties) => void;
}

export const MapView: React.FC<MapViewProps> = ({
  currentScene,
  activeDetection,
  gisLayers,
  setGisLayers,
  contract1,
  corridor,
  topSuspect,
  onSelectDetection
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panPosition, setPanPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isLayersPanelCollapsed, setIsLayersPanelCollapsed] = useState<boolean>(false);
  const [cursorCoords, setCursorCoords] = useState<{ lat: string; lon: string }>({
    lat: '58.3421°N',
    lon: '2.1190°E'
  });
  const [hoveredSlick, setHoveredSlick] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Real-geometry projector — same pattern as DriftView/SuspectsView. Only
  // available once a corridor has actually been fetched (Drift stage run).
  const projector = useMemo(() => {
    if (!corridor || !contract1) return null;
    const points = [
      { lat: contract1.centroid[1], lon: contract1.centroid[0] },
      ...corridor.corridor.map(n => ({ lat: n.lat, lon: n.lon })),
    ];
    return projectPoints(points);
  }, [corridor, contract1]);

  // Oldest corridor node = furthest-back estimated origin, with its own
  // uncertainty radius — the real equivalent of "Origin Ellipse".
  const oldestNode = useMemo(() => {
    if (!corridor) return null;
    return corridor.corridor.reduce((oldest, n) =>
      n.hours_ago > oldest.hours_ago ? n : oldest, corridor.corridor[0]);
  }, [corridor]);
  const maxRadiusKm = useMemo(() => {
    if (!corridor) return 1;
    return Math.max(...corridor.corridor.map(n => n.radius_km));
  }, [corridor]);

  // Detection-mask projector — independent of the drift corridor (available
  // as soon as a scene has detections, even before Drift has run). Anchored
  // on the scene's own detections' real centroids, falling back to the
  // scene's nominal lat/lon so a lone detection still gets a sane bounding box.
  const detectionProjector = useMemo(() => {
    const points: LatLon[] = (currentScene.detections || [])
      .map(d => parseCentroidString(d.centroid))
      .filter((p): p is LatLon => p !== null);
    if (points.length === 0) {
      points.push({ lat: currentScene.lat, lon: currentScene.lon });
    }
    return projectPoints(points);
  }, [currentScene]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target instanceof SVGElement || e.target instanceof HTMLImageElement || (e.target as HTMLElement).id === 'map-canvas-container') {
      setIsDragging(true);
      setDragStart({ x: e.clientX - panPosition.x, y: e.clientY - panPosition.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPanPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const xPercent = (e.clientX - rect.left) / rect.width;
      const yPercent = (e.clientY - rect.top) / rect.height;
      const baseLat = currentScene.lat;
      const baseLon = currentScene.lon;
      const calcLat = (baseLat + (0.5 - yPercent) * 0.4).toFixed(4);
      const calcLon = (baseLon + (xPercent - 0.5) * 0.4).toFixed(4);
      setCursorCoords({
        lat: `${Math.abs(parseFloat(calcLat))}°${parseFloat(calcLat) >= 0 ? 'N' : 'S'}`,
        lon: `${Math.abs(parseFloat(calcLon))}°${parseFloat(calcLon) >= 0 ? 'E' : 'W'}`
      });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleZoom = (delta: number) => {
    setZoomLevel(prev => Math.min(Math.max(prev + delta, 0.7), 2.5));
  };

  const resetView = () => {
    setZoomLevel(1);
    setPanPosition({ x: 0, y: 0 });
  };

  /* Helper to build checkbox row for layer panel */
  const LayerRow = ({
    label, checked, onChange, colorDot, icon, disabled, disabledReason
  }: {
    label: string; checked: boolean; onChange: (v: boolean) => void;
    colorDot?: string; icon?: React.ReactNode; disabled?: boolean; disabledReason?: string;
  }) => (
    <div
      className="flex items-center gap-2.5 px-2 py-1.5 rounded transition-colors"
      style={{ background: checked && !disabled ? 'var(--gov-navy-light)' : 'transparent', opacity: disabled ? 0.5 : 1 }}
      title={disabled ? disabledReason : undefined}
    >
      <label className={`flex items-center gap-2.5 w-full ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={e => onChange(e.target.checked)}
          className="h-4 w-4 cursor-pointer disabled:cursor-not-allowed"
          style={{ accentColor: 'var(--gov-navy)' }}
        />
        {colorDot && <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: colorDot, border: '1px solid rgba(0,0,0,0.2)' }} />}
        {icon && icon}
        <span className="text-xs" style={{ color: 'var(--gov-text-primary)', fontFamily: 'var(--font-mono)' }}>
          {label}
        </span>
      </label>
    </div>
  );

  return (
    <div
      id="map-view-canvas"
      ref={containerRef}
      className="flex-1 relative w-full h-[calc(100vh-72px)] overflow-hidden select-none bg-[#010f1f]"
    >
      {/* Map canvas — kept dark (cartographic requirement) */}
      <div id="map-canvas-container" className="absolute inset-0 w-full h-full">
        <MarineTrafficMap
          centerX={60.2}
          centerY={13.3}
          zoom={6}
          showOverlays={true}
          className="absolute inset-0 w-full h-full"
        />

        {/* Subtle grid overlay */}
        <div
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(rgba(133,148,144,0.1) 1px, transparent 1px)',
            backgroundSize: '40px 40px'
          }}
        />

        {/* Drift Corridor Path — real backward-hindcast nodes from /api/drift/corridor,
            same geometry DriftView renders. Only drawn once that stage has run. */}
        {gisLayers.oceanCurrents && projector && corridor && contract1 && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-70" viewBox="0 0 1000 800" preserveAspectRatio="none">
            {(() => {
              const origin = projector({ lat: contract1.centroid[1], lon: contract1.centroid[0] });
              const nodePoints = corridor.corridor.map(n => projector({ lat: n.lat, lon: n.lon }));
              const pathD = [origin, ...nodePoints]
                .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
                .join(' ');
              return (
                <g stroke="#ffb95f" strokeWidth="1.5" fill="none" strokeDasharray="3 5">
                  <path d={pathD} />
                  {nodePoints.map((p, idx) => (
                    <circle key={idx} cx={p.x} cy={p.y} r="2.5" fill="#ffb95f" stroke="none" />
                  ))}
                </g>
              );
            })()}
          </svg>
        )}

        {/* Confidence Heatmap */}
        {gisLayers.confidenceHeatmap && (
          <div
            className="absolute left-[44%] top-[40%] w-64 h-48 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none opacity-40 blur-2xl"
            style={{ background: 'radial-gradient(circle, rgba(239,68,68,0.8) 0%, rgba(245,158,11,0.5) 50%, transparent 80%)' }}
          />
        )}

        {/* SVG Layer */}
        <svg
          className="absolute inset-0 w-full h-full z-10 pointer-events-none"
          viewBox="0 0 1000 800"
          preserveAspectRatio="none"
        >
          <defs>
            <filter id="glow-teal" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <radialGradient id="slick-fill" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.35 * (gisLayers.predictedMaskOpacity / 100)} />
              <stop offset="100%" stopColor="#2dd4bf" stopOpacity={0.15 * (gisLayers.predictedMaskOpacity / 100)} />
            </radialGradient>
          </defs>

          {/* Suspect Vessel Position — a single real point for the top-ranked
              suspect, placed at the corridor node its fits_hours_ago matches
              (same lookup SuspectsView uses). No fabricated track polyline. */}
          {gisLayers.aisTracks && topSuspect && corridor && projector && (() => {
            const node = corridor.corridor.find(n => n.hours_ago === topSuspect.fits_hours_ago);
            if (!node) return null;
            const p = projector({ lat: node.lat, lon: node.lon });
            return (
              <g>
                <circle cx={p.x} cy={p.y} r="14" fill="none" stroke="#ffb95f" strokeWidth="1.5" opacity="0.6" />
                <circle cx={p.x} cy={p.y} r="4" fill="#ffb95f" />
                <text x={p.x + 12} y={p.y - 10} fill="#ffb95f" fontFamily="IBM Plex Mono" fontSize="11">
                  {topSuspect.name} (T-{node.hours_ago}h)
                </text>
              </g>
            );
          })()}

          {/* Origin Estimate — the oldest (furthest-back) real corridor node,
              radius scaled from its actual radius_km. */}
          {gisLayers.originEstimate && oldestNode && projector && (() => {
            const p = projector({ lat: oldestNode.lat, lon: oldestNode.lon });
            const r = 6 + (oldestNode.radius_km / maxRadiusKm) * 26;
            return (
              <g>
                <circle cx={p.x} cy={p.y} r={r} fill="none" stroke="#ffb4ab" strokeWidth="1.5" strokeDasharray="3 3" />
                <circle cx={p.x} cy={p.y} r="3" fill="#ffb4ab" />
                <text x={p.x + 15} y={p.y + 5} fill="#ffb4ab" fontFamily="IBM Plex Mono" fontSize="11">
                  EST. ORIGIN (T-{oldestNode.hours_ago}h)
                </text>
              </g>
            );
          })()}

          {gisLayers.predictedMask && (
            <g id="slick-polygons-layer">
              {(currentScene.detections || []).map((anom) => {
                const isSelected = activeDetection?.id === anom.id;
                const parsedCentroid = parseCentroidString(anom.centroid);
                const { x: cx, y: cy } = parsedCentroid
                  ? detectionProjector(parsedCentroid)
                  : { x: 500, y: 400 };
                const rx = Math.max(anom.majorAxisKm * 10, 40);
                const ry = Math.max(anom.minorAxisKm * 15, 20);
                const rot = anom.bearingDeg;
                const isLookAlike = anom.status === 'LOOK_ALIKE' || anom.confidence < 50;
                return (
                  <g
                    key={anom.id}
                    id={`slick-polygon-${anom.id}`}
                    onClick={() => onSelectDetection && onSelectDetection(anom)}
                    onMouseEnter={() => setHoveredSlick(true)}
                    onMouseLeave={() => setHoveredSlick(false)}
                    className="cursor-pointer group pointer-events-auto"
                  >
                    <ellipse
                      cx={cx} cy={cy} rx={rx} ry={ry}
                      transform={`rotate(${rot - 90} ${cx} ${cy})`}
                      fill="url(#slick-fill)"
                      stroke={isLookAlike ? "#f59e0b" : "#2dd4bf"}
                      strokeWidth={isSelected || hoveredSlick ? "3" : "1.8"}
                      strokeDasharray={isLookAlike ? "4 4" : "none"}
                      filter="url(#glow-teal)"
                    />
                    <circle cx={cx} cy={cy} r="4" fill={isLookAlike ? "#f59e0b" : "#2dd4bf"} className="map-glow" />
                    <circle cx={cx} cy={cy} r="14" fill="none" stroke={isLookAlike ? "#f59e0b" : "#2dd4bf"} strokeWidth="1" opacity="0.6" />
                    <line x1={cx - 20} y1={cy} x2={cx + 20} y2={cy} stroke={isLookAlike ? "#f59e0b" : "#2dd4bf"} strokeWidth="1.5" />
                    <line x1={cx} y1={cy - 20} x2={cx} y2={cy + 20} stroke={isLookAlike ? "#f59e0b" : "#2dd4bf"} strokeWidth="1.5" />
                    <g transform={`translate(${cx + 15}, ${cy - 25})`}>
                      <rect width="130" height="26" rx="2" fill="#0d1c2d" stroke={isSelected ? "#60a5fa" : (isLookAlike ? "#f59e0b" : "#2dd4bf")} strokeWidth="1.5" opacity="0.95" />
                      <text x="8" y="17" fill={isLookAlike ? "#fde68a" : "#57f1db"} fontFamily="IBM Plex Mono" fontSize="11" fontWeight="600">
                        {anom.id} ({anom.confidence}%)
                      </text>
                    </g>
                  </g>
                );
              })}
            </g>
          )}

          <path d="M510 400 Q400 500 200 550" fill="none" stroke="rgba(255,185,95,0.7)" strokeDasharray="4 4" strokeWidth="1.5" />
        </svg>
      </div>

      {/* GIS Layers Panel — white/government style */}
      <div
        id="gis-layers-panel"
        className={`absolute top-4 left-4 z-30 flex flex-col shadow-lg transition-all duration-200 overflow-hidden ${isLayersPanelCollapsed ? 'w-44' : 'w-72'}`}
        style={{ background: 'var(--gov-surface)', border: '1px solid var(--gov-border)', borderTop: '3px solid var(--gov-navy)', borderRadius: '2px' }}
      >
        {/* Panel header */}
        <div
          className="px-3 py-2.5 flex justify-between items-center"
          style={{ background: 'var(--gov-surface-alt)', borderBottom: '1px solid var(--gov-border)' }}
        >
          <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--gov-navy)' }}>
            <Layers className="w-3.5 h-3.5" style={{ color: 'var(--gov-saffron)' }} />
            GIS Layer Stack
          </span>
          <button
            onClick={() => setIsLayersPanelCollapsed(!isLayersPanelCollapsed)}
            className="p-1 rounded transition-colors"
            style={{ color: 'var(--gov-text-muted)', cursor: 'pointer' }}
            title="Toggle Panel"
          >
            {isLayersPanelCollapsed ? <Eye className="w-3.5 h-3.5" /> : <Sliders className="w-3.5 h-3.5" />}
          </button>
        </div>

        {!isLayersPanelCollapsed && (
          <div className="p-3 flex flex-col gap-1 max-h-[calc(100vh-220px)] overflow-y-auto">
            <LayerRow label="SAR Backscatter Base" checked={gisLayers.sarBackscatter} onChange={v => setGisLayers({ ...gisLayers, sarBackscatter: v })} colorDot="#718096" />

            {/* Predicted mask with opacity slider */}
            <div style={{ border: '1px solid var(--gov-navy)', borderRadius: '2px', background: 'var(--gov-navy-light)' }}>
              <LayerRow label="Predicted Mask (Detector)" checked={gisLayers.predictedMask} onChange={v => setGisLayers({ ...gisLayers, predictedMask: v })} colorDot="#000080" />
              {gisLayers.predictedMask && (
                <div className="pl-9 pr-3 pb-2 flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider w-14" style={{ color: 'var(--gov-navy)' }}>Opacity</span>
                  <input
                    type="range" min="0" max="100"
                    value={gisLayers.predictedMaskOpacity}
                    onChange={e => setGisLayers({ ...gisLayers, predictedMaskOpacity: Number(e.target.value) })}
                    className="flex-1"
                    style={{ accentColor: 'var(--gov-navy)' }}
                  />
                  <span className="text-xs font-mono w-8 text-right" style={{ color: 'var(--gov-navy)' }}>{gisLayers.predictedMaskOpacity}%</span>
                </div>
              )}
            </div>

            <LayerRow label="Confidence Heatmap" checked={gisLayers.confidenceHeatmap} onChange={v => setGisLayers({ ...gisLayers, confidenceHeatmap: v })} colorDot="#C62828" />
            <LayerRow
              label={`Drift Corridor Path (${corridor?.field_source ?? 'n/a'})`}
              checked={gisLayers.oceanCurrents}
              onChange={v => setGisLayers({ ...gisLayers, oceanCurrents: v })}
              colorDot="#FF9933"
              disabled={!corridor}
              disabledReason="Run Drift analysis first to fetch a real corridor"
            />
            <LayerRow
              label="Suspect Vessel Position"
              checked={gisLayers.aisTracks}
              onChange={v => setGisLayers({ ...gisLayers, aisTracks: v })}
              colorDot="#FF9933"
              disabled={!topSuspect}
              disabledReason="Run Suspect matching first to identify a top suspect"
            />
            <LayerRow
              label="Origin Estimate"
              checked={gisLayers.originEstimate}
              onChange={v => setGisLayers({ ...gisLayers, originEstimate: v })}
              icon={<Crosshair className="w-3 h-3 shrink-0" style={{ color: '#C62828' }} />}
              disabled={!corridor}
              disabledReason="Run Drift analysis first to fetch a real corridor"
            />

            {/* Inspect button */}
            <button
              onClick={() => onSelectDetection && onSelectDetection(activeDetection || currentScene.detections?.[0])}
              className="mt-2 w-full py-2 flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer"
              style={{
                background: 'var(--gov-green)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '2px'
              }}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Inspect Anomaly ({activeDetection?.id || 'DET-001'})
            </button>
          </div>
        )}
      </div>


      {/* Scale bar */}
      <div className="absolute bottom-4 left-4 z-20 pointer-events-none">
        <div
          className="flex flex-col gap-1 items-start px-3 py-2"
          style={{ background: 'var(--gov-surface)', border: '1px solid var(--gov-border)', borderRadius: '2px' }}
        >
          <div className="font-mono text-[10px]" style={{ color: 'var(--gov-text-secondary)' }}>10 NM (18.5 km)</div>
          <div className="flex h-1.5 w-28" style={{ border: '1px solid var(--gov-border-strong)', borderTop: 'none' }}>
            <div className="w-1/2 h-full" style={{ background: 'var(--gov-navy)', borderRight: '1px solid var(--gov-border-strong)' }} />
          </div>
        </div>
      </div>

      {/* Coordinates display */}
      <div
        id="coordinate-display"
        className="absolute bottom-4 right-4 z-20 flex items-center gap-2 px-4 py-2 pointer-events-none"
        style={{ background: 'var(--gov-surface)', border: '1px solid var(--gov-border)', borderRadius: '2px' }}
      >
        <span className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--gov-green)' }} />
        <span className="font-mono text-xs font-semibold" style={{ color: 'var(--gov-navy)' }}>
          {cursorCoords.lat}, {cursorCoords.lon}
        </span>
      </div>
    </div>
  );
};
