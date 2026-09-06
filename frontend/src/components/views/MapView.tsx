import React, { useState, useRef } from 'react';
import { GisLayers, MorphologicalProperties, SceneMetadata } from '../../types';
import {
  Layers,
  Crosshair,
  Sliders,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Wind,
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
  onSelectDetection?: (detection?: MorphologicalProperties) => void;
}

export const MapView: React.FC<MapViewProps> = ({
  currentScene,
  activeDetection,
  gisLayers,
  setGisLayers,
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
    label, checked, onChange, colorDot, icon
  }: {
    label: string; checked: boolean; onChange: (v: boolean) => void;
    colorDot?: string; icon?: React.ReactNode;
  }) => (
    <div
      className="flex items-center gap-2.5 px-2 py-1.5 rounded cursor-pointer transition-colors"
      style={{ background: checked ? 'var(--gov-navy-light)' : 'transparent' }}
    >
      <label className="flex items-center gap-2.5 cursor-pointer w-full">
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          className="h-4 w-4 cursor-pointer"
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

        {/* Ocean Currents */}
        {gisLayers.oceanCurrents && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-50" viewBox="0 0 1000 800">
            <g stroke="#ffb95f" strokeWidth="1" fill="none" strokeDasharray="3 5">
              <path d="M 100 100 Q 300 150 500 120 T 900 160" />
              <path d="M 80 250 Q 280 290 480 260 T 880 300" />
              <path d="M 120 400 Q 320 440 520 410 T 920 450" />
              <path d="M 60 550 Q 260 600 460 570 T 860 610" />
              <path d="M 100 700 Q 300 740 500 710 T 900 750" />
            </g>
          </svg>
        )}

        {/* Wind Barbs */}
        {gisLayers.windBarbs && (
          <div className="absolute inset-0 w-full h-full pointer-events-none opacity-60">
            <div className="absolute top-[20%] left-[25%] flex items-center gap-1 text-[#bacac5] font-mono text-[10px]">
              <Wind className="w-4 h-4 text-[#859490] rotate-45" /> 14 kt NW
            </div>
            <div className="absolute top-[35%] left-[65%] flex items-center gap-1 text-[#bacac5] font-mono text-[10px]">
              <Wind className="w-4 h-4 text-[#859490] rotate-45" /> 16 kt NW
            </div>
            <div className="absolute top-[65%] left-[35%] flex items-center gap-1 text-[#bacac5] font-mono text-[10px]">
              <Wind className="w-4 h-4 text-[#859490]" /> 15 kt NW
            </div>
            <div className="absolute top-[75%] left-[75%] flex items-center gap-1 text-[#bacac5] font-mono text-[10px]">
              <Wind className="w-4 h-4 text-[#859490] rotate-45" /> 18 kt NW
            </div>
          </div>
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

          {gisLayers.aisTracks && (
            <g>
              <path d="M 120 620 Q 300 520 510 400 T 880 220" fill="none" stroke="rgba(255,185,95,0.75)" strokeDasharray="5 5" strokeWidth="1.5" />
              <path d="M 220 700 Q 420 580 620 460 T 920 340" fill="none" stroke="rgba(133,148,144,0.4)" strokeDasharray="4 6" strokeWidth="1" />
            </g>
          )}

          {gisLayers.originEstimate && (
            <g>
              <circle cx="280" cy="530" r="28" fill="none" stroke="#ffb4ab" strokeWidth="1.5" strokeDasharray="3 3" />
              <circle cx="280" cy="530" r="3" fill="#ffb4ab" />
              <text x="295" y="535" fill="#ffb4ab" fontFamily="IBM Plex Mono" fontSize="11">EST. ORIGIN (T-14h)</text>
            </g>
          )}

          {gisLayers.predictedMask && (
            <g id="slick-polygons-layer">
              {(currentScene.detections || []).map((anom, idx) => {
                const isSelected = activeDetection?.id === anom.id;
                const cx = idx === 0 ? 510 : idx === 1 ? 650 : 380;
                const cy = idx === 0 ? 400 : idx === 1 ? 320 : 540;
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
              <LayerRow label="Predicted Mask (AI)" checked={gisLayers.predictedMask} onChange={v => setGisLayers({ ...gisLayers, predictedMask: v })} colorDot="#000080" />
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
            <LayerRow label="Ocean Currents (HYCOM)" checked={gisLayers.oceanCurrents} onChange={v => setGisLayers({ ...gisLayers, oceanCurrents: v })} colorDot="#FF9933" />
            <LayerRow label="Wind Vectors (GFS)" checked={gisLayers.windBarbs} onChange={v => setGisLayers({ ...gisLayers, windBarbs: v })} icon={<Wind className="w-3 h-3 shrink-0" style={{ color: '#718096' }} />} />
            <LayerRow label="AIS Vessel Trajectories" checked={gisLayers.aisTracks} onChange={v => setGisLayers({ ...gisLayers, aisTracks: v })} colorDot="#FF9933" />
            <LayerRow label="Origin Ellipse (T-14h)" checked={gisLayers.originEstimate} onChange={v => setGisLayers({ ...gisLayers, originEstimate: v })} icon={<Crosshair className="w-3 h-3 shrink-0" style={{ color: '#C62828' }} />} />

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
