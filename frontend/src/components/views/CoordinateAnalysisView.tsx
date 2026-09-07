import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  CorridorResponse,
  GisLayers,
  MorphologicalProperties,
  SceneMetadata,
  Suspect,
} from '../../types';
import { DetectionResponse } from '../../api/api';
import {
  MapLibreAnalysisMap,
  MapLibreAnalysisMapHandle,
  FeatureClickInfo,
} from '../MapLibreAnalysisMap';
import { GISLayerStack } from '../GISLayerStack';
import {
  Layers,
  Crosshair,
  Maximize2,
  Ship,
  Copy,
  Check,
  Globe,
  Compass,
} from 'lucide-react';

interface CoordinateAnalysisViewProps {
  currentScene: SceneMetadata;
  contract1: DetectionResponse | null;
  corridor: CorridorResponse | null;
  topSuspect: Suspect | null;
  uploadedFile?: File | null;
  sarPreviewUrl?: string | null;
  gisLayers: GisLayers;
  setGisLayers: React.Dispatch<React.SetStateAction<GisLayers>>;
  theme: 'light' | 'dark';
  onNavigateToAis?: () => void;
  onNavigateToIngest?: () => void;
  onSelectDetection?: (detection?: MorphologicalProperties) => void;
}

export const CoordinateAnalysisView: React.FC<CoordinateAnalysisViewProps> = ({
  contract1,
  corridor,
  topSuspect,
  uploadedFile,
  sarPreviewUrl,
  gisLayers,
  setGisLayers,
  theme,
  onNavigateToAis,
  onNavigateToIngest,
  onSelectDetection,
}) => {
  const mapHandleRef = useRef<MapLibreAnalysisMapHandle>(null);
  const [isLayerStackOpen, setIsLayerStackOpen] = useState(true);
  const [isDetailsOpen, setIsDetailsOpen] = useState(true);
  const [hoverCoords, setHoverCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [clickedCoords, setClickedCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<FeatureClickInfo | null>(null);
  const [copied, setCopied] = useState(false);

  // ── Required Logging ────────────────────────────────────────────────────────
  useEffect(() => {
    console.log("[ANALYSIS] AnalysisView mounted");
  }, []);

  const prevContract1Ref = useRef<DetectionResponse | null>(null);
  useEffect(() => {
    if (contract1) {
      if (!prevContract1Ref.current) {
        console.log("[ANALYSIS] Contract 1 received:", contract1);
      } else {
        console.log("[ANALYSIS] Contract 1 updated:", contract1);
      }
      console.log("[ANALYSIS] Detection centroid:", contract1.centroid);
      console.log("[ANALYSIS] Detection polygon:", contract1.polygon);
      console.log("[ANALYSIS] Detection area:", contract1.area_km2);
      console.log("[ANALYSIS] Detection confidence:", contract1.confidence);
      prevContract1Ref.current = contract1;
    }
  }, [contract1]);

  // ── Formatted Contract 1 Coordinates ─────────────────────────────────────────
  const c1Centroid = useMemo(() => {
    if (!contract1 || !Array.isArray(contract1.centroid) || contract1.centroid.length < 2) return null;
    const lon = Number(contract1.centroid[0]);
    const lat = Number(contract1.centroid[1]);
    return {
      lat,
      lon,
      formatted: `${Math.abs(lat).toFixed(6)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(6)}°${lon >= 0 ? 'E' : 'W'}`,
    };
  }, [contract1]);

  // ── Formatted Corridor Info ──────────────────────────────────────────────────
  const corridorStats = useMemo(() => {
    if (!corridor || !Array.isArray(corridor.corridor) || corridor.corridor.length === 0) return null;
    const nodes = corridor.corridor;
    const firstNode = nodes[0];
    const lastNode = nodes[nodes.length - 1];
    return {
      count: nodes.length,
      firstLat: Number(firstNode.lat),
      firstLon: Number(firstNode.lon),
      lastLat: Number(lastNode.lat),
      lastLon: Number(lastNode.lon),
      maxRadius: Math.max(...nodes.map(n => n.radius_km || 0)),
    };
  }, [corridor]);

  // ── Formatted Suspect Info ───────────────────────────────────────────────────
  const suspectCoord = useMemo(() => {
    if (!topSuspect || !corridor) return null;
    const matched = corridor.corridor.find(n => n.hours_ago === topSuspect.fits_hours_ago);
    if (!matched) return null;
    const lat = Number(matched.lat);
    const lon = Number(matched.lon);
    return {
      name: topSuspect.name || 'Unknown Vessel',
      mmsi: topSuspect.mmsi || 'N/A',
      fits_hours_ago: topSuspect.fits_hours_ago,
      lat,
      lon,
      formatted: `${Math.abs(lat).toFixed(6)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(6)}°${lon >= 0 ? 'E' : 'W'}`,
    };
  }, [topSuspect, corridor]);

  // ── Copy active coordinates to clipboard ────────────────────────────────────
  const copyCoordinates = (lat: number, lon: number) => {
    const text = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isDark = theme === 'dark';

  return (
    <div
      id="coordinate-analysis-view"
      className="flex flex-col w-full h-[calc(100vh-72px)] select-none overflow-hidden"
      style={{
        background: 'var(--gov-bg)',
        color: 'var(--gov-text-primary)',
      }}
    >
      {/* ========================================================================= */}
      {/* 1. HEADER BAR                                                             */}
      {/* Title, Subtitle, Status Badges & View Actions                             */}
      {/* ========================================================================= */}
      <header
        className="flex-none px-5 py-2.5 flex items-center justify-between z-10 transition-colors shadow-sm"
        style={{
          background: 'var(--gov-surface)',
          borderBottom: '1px solid var(--gov-border)',
        }}
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div
              className="p-1.5 rounded"
              style={{
                background: 'rgba(6, 182, 212, 0.15)',
                color: '#0891b2',
              }}
            >
              <Compass className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight uppercase flex items-center gap-2" style={{ color: 'var(--gov-text-primary)' }}>
                Coordinate Analysis
                <span
                  className="text-[10px] font-mono px-2 py-0.5 rounded font-semibold tracking-wider"
                  style={{
                    background: 'rgba(6, 182, 212, 0.15)',
                    color: '#0891b2',
                    border: '1px solid rgba(6, 182, 212, 0.3)',
                  }}
                >
                  MAPLIBRE GL
                </span>
              </h1>
              <p className="text-[11px] font-medium" style={{ color: 'var(--gov-text-muted)' }}>
                Contract 1 • Contract 2 • AIS Geographic Analysis
              </p>
            </div>
          </div>

          {/* Quick status badges */}
          <div className="hidden md:flex items-center gap-2 pl-4 border-l" style={{ borderColor: 'var(--gov-border)' }}>
            {contract1 ? (
              <span
                className="text-[10px] font-mono px-2 py-1 rounded flex items-center gap-1.5 font-semibold"
                style={{
                  background: 'rgba(6, 182, 212, 0.12)',
                  color: '#0891b2',
                  border: '1px solid rgba(6, 182, 212, 0.35)',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                C1 SPILL: {Number(contract1.area_km2).toFixed(2)} km²
              </span>
            ) : (
              <span className="text-[10px] font-mono px-2 py-1 rounded" style={{ background: 'var(--gov-surface-alt)', color: 'var(--gov-text-muted)' }}>
                C1: Inactive
              </span>
            )}

            {corridor ? (
              <span
                className="text-[10px] font-mono px-2 py-1 rounded flex items-center gap-1.5 font-semibold"
                style={{
                  background: 'rgba(245, 158, 11, 0.12)',
                  color: '#b45309',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                C2 CORRIDOR: {corridorStats?.count ?? 0} NODES
              </span>
            ) : (
              <span className="text-[10px] font-mono px-2 py-1 rounded" style={{ background: 'var(--gov-surface-alt)', color: 'var(--gov-text-muted)' }}>
                C2: Inactive
              </span>
            )}

            {topSuspect ? (
              <span
                className="text-[10px] font-mono px-2 py-1 rounded flex items-center gap-1.5 font-semibold"
                style={{
                  background: 'rgba(239, 68, 68, 0.12)',
                  color: '#b91c1c',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                SUSPECT: {topSuspect.name || topSuspect.mmsi}
              </span>
            ) : (
              <span className="text-[10px] font-mono px-2 py-1 rounded" style={{ background: 'var(--gov-surface-alt)', color: 'var(--gov-text-muted)' }}>
                SUSPECT: None
              </span>
            )}
          </div>
        </div>

        {/* View Actions */}
        <div className="flex items-center gap-2">
          {/* Fit Bounds Button */}
          <button
            onClick={() => mapHandleRef.current?.fitAll()}
            className="px-2.5 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
            style={{
              background: 'var(--gov-surface-alt)',
              border: '1px solid var(--gov-border)',
              color: 'var(--gov-text-primary)',
            }}
            title="Fit view to all analysis features"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Fit Extent</span>
          </button>

          {/* Jump to Centroid */}
          {c1Centroid && (
            <button
              onClick={() => mapHandleRef.current?.zoomToCentroid()}
              className="px-2.5 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
              style={{
                background: 'rgba(6, 182, 212, 0.1)',
                border: '1px solid rgba(6, 182, 212, 0.3)',
                color: '#0891b2',
              }}
              title="Zoom to Contract 1 Spill Centroid"
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Spill Centroid</span>
            </button>
          )}

          {/* Jump to Suspect */}
          {suspectCoord && (
            <button
              onClick={() => mapHandleRef.current?.zoomToSuspect()}
              className="px-2.5 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#b91c1c',
              }}
              title="Zoom to Suspect Vessel"
            >
              <Ship className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Suspect</span>
            </button>
          )}

          {/* Toggle Floating GIS Layer Stack */}
          <button
            onClick={() => setIsLayerStackOpen(!isLayerStackOpen)}
            className="px-2.5 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
            style={{
              background: isLayerStackOpen ? 'rgba(6, 182, 212, 0.15)' : 'var(--gov-surface-alt)',
              border: isLayerStackOpen ? '1px solid #0891b2' : '1px solid var(--gov-border)',
              color: isLayerStackOpen ? '#0891b2' : 'var(--gov-text-primary)',
            }}
            title={isLayerStackOpen ? 'Hide GIS Layer Stack' : 'Show GIS Layer Stack'}
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">GIS Layers</span>
          </button>

          {/* Switch to Live AIS Map (View 1) */}
          {onNavigateToAis && (
            <button
              onClick={onNavigateToAis}
              className="px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm hover:opacity-90"
              style={{
                background: 'var(--gov-navy)',
                color: '#ffffff',
                border: '1px solid var(--gov-navy)',
              }}
              title="Navigate to MarineTraffic Live AIS Map"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Live AIS Map</span>
            </button>
          )}
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. MAIN CONTENT AREA — FULL MAPLIBRE CANVAS + FLOATING OVERLAYS            */}
      {/* NO SPLIT SCREEN. NO SIDEBAR. MapLibre occupies 100% of the canvas.         */}
      {/* ========================================================================= */}
      <div className="coordinate-analysis-map relative flex-1 w-full h-full overflow-hidden" style={{ minHeight: 0 }}>
        {/* MapLibre Container — Full Canvas (absolute inset-0) */}
        <div className="maplibre-container absolute inset-0 w-full h-full">
          <MapLibreAnalysisMap
            ref={mapHandleRef}
            contract1={contract1}
            corridor={corridor}
            topSuspect={topSuspect}
            gisLayers={gisLayers}
            theme={theme}
            isVisible={true}
            onHoverCoord={setHoverCoords}
            onClickCoord={setClickedCoords}
            onFeatureClick={(info) => {
              setSelectedFeature(info);
              setClickedCoords({ lat: info.lat, lon: info.lon });
            }}
          />
        </div>

        {/* Empty State Overlay when no detection is loaded */}
        {!contract1 && (
          <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center p-4">
            <div
              className="p-6 rounded-lg shadow-2xl backdrop-blur-md max-w-md w-full flex flex-col items-center text-center gap-3 border pointer-events-auto select-none"
              style={{
                background: isDark ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.96)',
                borderColor: isDark ? 'rgba(6, 182, 212, 0.3)' : 'var(--gov-border)',
              }}
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(6, 182, 212, 0.12)', color: '#0891b2' }}
              >
                <Compass className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-sm font-bold tracking-tight uppercase" style={{ color: 'var(--gov-text-primary)' }}>
                  No Detection Data Available
                </h2>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--gov-text-muted)' }}>
                  Run detection from Data Ingestion to populate the Coordinate Analysis map.
                </p>
              </div>
              {onNavigateToIngest && (
                <button
                  id="go-to-ingest-btn"
                  onClick={onNavigateToIngest}
                  className="mt-2 px-4 py-2 text-xs font-semibold rounded uppercase tracking-wider cursor-pointer shadow hover:opacity-90 transition-opacity"
                  style={{
                    background: 'var(--gov-navy)',
                    color: '#ffffff',
                  }}
                >
                  Go to Data Ingestion
                </button>
              )}
            </div>
          </div>
        )}

        {/* Map floating banner overlay & live Coordinate Inspector HUD (Top-Right) */}
        <div className="absolute top-4 right-4 z-20 pointer-events-none flex flex-col gap-2">
          <div
            className="px-3 py-1.5 rounded shadow-lg backdrop-blur-md flex items-center gap-2 text-xs font-mono"
            style={{
              background: isDark ? 'rgba(16, 23, 38, 0.88)' : 'rgba(255, 255, 255, 0.92)',
              border: isDark ? '1px solid rgba(6, 182, 212, 0.4)' : '1px solid rgba(6, 182, 212, 0.5)',
              color: isDark ? '#e2e8f0' : '#0f172a',
            }}
          >
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="font-bold tracking-wide" style={{ color: '#0891b2' }}>
              COORDINATE ANALYSIS MAP
            </span>
            <span className="text-[10px]" style={{ color: 'var(--gov-text-muted)' }}>
              WGS-84 • [Lon, Lat]
            </span>
          </div>

          {/* Live MapLibre Geographic Coordinate Inspector HUD */}
          <div
            id="maplibre-coordinate-inspector-hud"
            className="px-3.5 py-2 rounded-md shadow-xl backdrop-blur-md flex flex-col gap-1 font-mono text-xs"
            style={{
              background: isDark ? 'rgba(9, 14, 23, 0.92)' : 'rgba(255, 255, 255, 0.94)',
              border: isDark ? '1px solid rgba(6, 182, 212, 0.5)' : '1px solid rgba(6, 182, 212, 0.45)',
              color: isDark ? '#f1f5f9' : '#0f172a',
              minWidth: '200px',
            }}
          >
            <div className="flex items-center justify-between pb-1 border-b" style={{ borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}>
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#0891b2' }}>
                <Crosshair className="w-3 h-3 text-cyan-500" />
                <span>COORDINATE INSPECTOR</span>
              </div>
              <span className="text-[9px] px-1 py-0.5 rounded font-bold" style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#0891b2' }}>
                LIVE
              </span>
            </div>
            <div className="flex flex-col gap-0.5 pt-0.5 font-bold tracking-wider">
              <div className="flex items-center justify-between">
                <span style={{ color: isDark ? '#94a3b8' : '#64748b' }}>LAT:</span>
                <span className="text-cyan-600 dark:text-cyan-400">
                  {hoverCoords ? `${hoverCoords.lat.toFixed(6)}°` : '——.——————°'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: isDark ? '#94a3b8' : '#64748b' }}>LON:</span>
                <span className="text-cyan-600 dark:text-cyan-400">
                  {hoverCoords ? `${hoverCoords.lon.toFixed(6)}°` : '——.——————°'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Floating GIS Layer Stack (Top-Left) — Floating on top of MapLibre */}
        {isLayerStackOpen && (
          <div className="gis-layer-stack absolute top-4 left-4 z-30 pointer-events-auto">
            <GISLayerStack
              gisLayers={gisLayers}
              setGisLayers={setGisLayers}
              contract1={contract1}
              corridor={corridor}
              topSuspect={topSuspect}
              onSelectDetection={onSelectDetection}
            />
          </div>
        )}

        {/* Floating Detection Details Panel (Bottom-Right) */}
        {contract1 && (
          <div
            id="detection-details-panel"
            className="absolute bottom-4 right-4 z-30 pointer-events-auto w-80 rounded-md shadow-2xl backdrop-blur-md font-mono text-xs flex flex-col overflow-hidden"
            style={{
              background: isDark ? 'rgba(9, 14, 23, 0.95)' : 'rgba(255, 255, 255, 0.96)',
              border: isDark ? '1px solid rgba(6, 182, 212, 0.45)' : '1px solid rgba(6, 182, 212, 0.5)',
            }}
          >
            {/* Status Header: BACKEND DETECTION OUTPUT - Contract 1 • Verified */}
            <div
              className="px-3.5 py-2.5 flex items-center justify-between border-b select-none"
              style={{
                background: isDark ? 'rgba(6, 182, 212, 0.14)' : 'rgba(6, 182, 212, 0.08)',
                borderColor: 'var(--gov-border)',
              }}
            >
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  BACKEND DETECTION OUTPUT
                </span>
                <span className="text-[11px] font-bold" style={{ color: 'var(--gov-text-primary)' }}>
                  Contract 1 • Verified
                </span>
              </div>
              <button
                onClick={() => setIsDetailsOpen(!isDetailsOpen)}
                className="p-1 rounded cursor-pointer hover:opacity-80"
                style={{ color: 'var(--gov-text-muted)' }}
                title={isDetailsOpen ? 'Collapse Details' : 'Expand Details'}
              >
                {isDetailsOpen ? '▲' : '▼'}
              </button>
            </div>

            {isDetailsOpen && (
              <div className="p-3.5 flex flex-col gap-2 max-h-72 overflow-y-auto">
                <div
                  className="text-[10px] font-bold uppercase tracking-wider pb-1 border-b"
                  style={{ color: 'var(--gov-text-muted)', borderColor: 'var(--gov-border)' }}
                >
                  Detection Details
                </div>

                <div className="flex flex-col gap-1.5 text-[11px]">
                  <div className="flex justify-between items-center">
                    <span style={{ color: 'var(--gov-text-muted)' }}>Area:</span>
                    <span className="font-semibold text-cyan-600 dark:text-cyan-400">
                      {contract1.area_km2 != null ? `${contract1.area_km2} km²` : 'N/A'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span style={{ color: 'var(--gov-text-muted)' }}>Major Axis:</span>
                    <span className="font-semibold" style={{ color: 'var(--gov-text-primary)' }}>
                      {contract1.major_axis_km != null ? `${contract1.major_axis_km} km` : 'N/A'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span style={{ color: 'var(--gov-text-muted)' }}>Minor Axis:</span>
                    <span className="font-semibold" style={{ color: 'var(--gov-text-primary)' }}>
                      {contract1.minor_axis_km != null ? `${contract1.minor_axis_km} km` : 'N/A'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span style={{ color: 'var(--gov-text-muted)' }}>Orientation:</span>
                    <span className="font-semibold" style={{ color: 'var(--gov-text-primary)' }}>
                      {contract1.orientation_deg != null ? `${contract1.orientation_deg}°` : 'N/A'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span style={{ color: 'var(--gov-text-muted)' }}>Confidence:</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {contract1.confidence != null ? `${(contract1.confidence * 100).toFixed(1)}%` : 'N/A'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span style={{ color: 'var(--gov-text-muted)' }}>Detector:</span>
                    <span className="font-semibold" style={{ color: 'var(--gov-text-primary)' }}>
                      {contract1.detector ?? 'N/A'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center pt-1 border-t" style={{ borderColor: 'var(--gov-border)' }}>
                    <span style={{ color: 'var(--gov-text-muted)' }}>Centroid:</span>
                    <div className="text-right font-semibold text-cyan-600 dark:text-cyan-400">
                      {Array.isArray(contract1.centroid) && contract1.centroid.length >= 2 ? (
                        <>
                          <div>Lat: {contract1.centroid[1]}°</div>
                          <div>Lon: {contract1.centroid[0]}°</div>
                        </>
                      ) : (
                        'N/A'
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <span style={{ color: 'var(--gov-text-muted)' }}>CRS:</span>
                    <span className="font-semibold" style={{ color: 'var(--gov-text-primary)' }}>
                      {(contract1 as any).crs ?? 'EPSG:4326'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span style={{ color: 'var(--gov-text-muted)' }}>Observed At:</span>
                    <span className="font-semibold text-[10px]" style={{ color: 'var(--gov-text-primary)' }}>
                      {contract1.observed_at ?? 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Clicked Feature Inspector Overlay (Floating Bottom-Left) */}
        {selectedFeature && (
          <div
            className="absolute bottom-4 left-4 z-30 pointer-events-auto p-3 rounded flex flex-col gap-2 shadow-2xl backdrop-blur-md max-w-sm font-mono text-xs"
            style={{
              background: isDark ? 'rgba(9, 14, 23, 0.95)' : 'rgba(255, 255, 255, 0.95)',
              border: '1px solid var(--gov-border)',
              borderLeft: `3px solid ${selectedFeature.badgeColor || '#0891b2'}`,
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded" style={{ background: `${selectedFeature.badgeColor}22`, color: selectedFeature.badgeColor }}>
                {selectedFeature.badge}
              </span>
              <button
                onClick={() => setSelectedFeature(null)}
                className="text-xs font-mono hover:opacity-80 p-0.5 cursor-pointer"
                style={{ color: 'var(--gov-text-muted)' }}
              >
                ✕
              </button>
            </div>
            <div className="text-xs font-bold" style={{ color: 'var(--gov-text-primary)' }}>
              {selectedFeature.title}
            </div>
            {selectedFeature.subtitle && (
              <div className="text-[11px]" style={{ color: 'var(--gov-text-muted)' }}>
                {selectedFeature.subtitle}
              </div>
            )}
            <div className="pt-2 border-t flex flex-col gap-1 font-mono text-[11px]" style={{ borderColor: 'var(--gov-border)' }}>
              {Object.entries(selectedFeature.properties).map(([k, v]) => (
                <div key={k} className="flex justify-between items-center">
                  <span style={{ color: 'var(--gov-text-muted)' }}>{k}:</span>
                  <span className="font-semibold" style={{ color: 'var(--gov-text-primary)' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3. BOTTOM PANEL: COORDINATE INSPECTOR FOOTER                              */}
      {/* Live mousemove coordinates (6 decimal places) & Clicked feature coords    */}
      {/* ========================================================================= */}
      <footer
        id="coordinate-inspector"
        className="flex-none px-4 py-2 flex flex-wrap items-center justify-between gap-4 z-10 transition-colors"
        style={{
          background: 'var(--gov-surface)',
          borderTop: '1px solid var(--gov-border)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {/* Left: Mouse position with 6 decimal places */}
        <div className="flex items-center gap-3 font-mono">
          <div className="flex items-center gap-2 text-xs font-bold">
            <Crosshair className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
            <span style={{ color: 'var(--gov-text-muted)' }}>COORDINATE INSPECTOR:</span>
            <span className="text-cyan-600 dark:text-cyan-400 tracking-wider">
              {hoverCoords ? (
                <>
                  <span>LAT: {hoverCoords.lat.toFixed(6)}°</span>
                  <span className="mx-2" style={{ color: 'var(--gov-border)' }}>•</span>
                  <span>LON: {hoverCoords.lon.toFixed(6)}°</span>
                </>
              ) : (
                <>
                  <span>LAT: ——.——————°</span>
                  <span className="mx-2" style={{ color: 'var(--gov-border)' }}>•</span>
                  <span>LON: ——.——————°</span>
                </>
              )}
            </span>
          </div>

          <span className="hidden sm:inline text-xs" style={{ color: 'var(--gov-border)' }}>|</span>

          {/* Coordinate system label */}
          <span className="hidden sm:inline text-[10px] font-semibold" style={{ color: 'var(--gov-text-muted)' }}>
            EPSG:4326 (WGS-84) • 6 DECIMAL PLACES
          </span>
        </div>

        {/* Right: Clicked point / feature inspector with copy button */}
        <div className="flex items-center gap-3 text-xs font-mono">
          {clickedCoords ? (
            <div className="flex items-center gap-2">
              <span style={{ color: 'var(--gov-text-muted)' }}>
                {selectedFeature ? `INSPECT [${selectedFeature.badge}]:` : 'INSPECT [MAP]:'}
              </span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400 tracking-wider">
                LAT: {clickedCoords.lat.toFixed(6)}° &nbsp;•&nbsp; LON: {clickedCoords.lon.toFixed(6)}°
              </span>
              <button
                onClick={() => copyCoordinates(clickedCoords.lat, clickedCoords.lon)}
                className="px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 transition-colors cursor-pointer ml-1"
                style={{
                  background: copied ? 'rgba(16, 185, 129, 0.15)' : 'var(--gov-surface-alt)',
                  border: '1px solid var(--gov-border)',
                  color: copied ? '#10b981' : 'var(--gov-text-primary)',
                }}
                title="Copy coordinates to clipboard"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          ) : (
            <span className="text-[11px] italic" style={{ color: 'var(--gov-text-muted)' }}>
              Click any feature or map location to inspect exact coordinates
            </span>
          )}
        </div>
      </footer>
    </div>
  );
};
