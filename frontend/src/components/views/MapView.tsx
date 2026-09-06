import React, { useState, useRef, useMemo, useEffect } from 'react';
import { CorridorResponse, GisLayers, MorphologicalProperties, SceneMetadata, Suspect } from '../../types';
import { DetectionResponse } from '../../api/api';
import {
  Layers,
  Crosshair,
  Sliders,
  ExternalLink,
  Eye,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Compass,
  MapPin,
  Ship,
  X
} from 'lucide-react';
import { MarineTrafficMap } from '../MarineTrafficMap';
import { CoordinateOverlay } from '../CoordinateOverlay';

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

// Coordinate validation: -90 <= lat <= 90, -180 <= lon <= 180
export function isValidCoordinate(lat: any, lon: any): boolean {
  if (lat === null || lat === undefined || lon === null || lon === undefined) return false;
  const numLat = typeof lat === 'number' ? lat : parseFloat(lat);
  const numLon = typeof lon === 'number' ? lon : parseFloat(lon);
  if (isNaN(numLat) || isNaN(numLon)) return false;
  if (!isFinite(numLat) || !isFinite(numLon)) return false;
  if (numLat < -90 || numLat > 90) return false;
  if (numLon < -180 || numLon > 180) return false;
  return true;
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
  const [isLayersPanelCollapsed, setIsLayersPanelCollapsed] = useState<boolean>(false);
  const [isOverlayPanelOpen, setIsOverlayPanelOpen] = useState<boolean>(true);
  const [noAnomalyModalOpen, setNoAnomalyModalOpen] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Contract 1 coordinate extraction: contract1.centroid = [longitude, latitude]
  const c1Coords = useMemo(() => {
    if (!contract1 || !Array.isArray(contract1.centroid) || contract1.centroid.length < 2) {
      return null;
    }
    const rawLongitude = contract1.centroid[0];
    const rawLatitude = contract1.centroid[1];
    const rawStr = `[${rawLongitude}, ${rawLatitude}]`;

    const longitude = Number(rawLongitude);
    const latitude = Number(rawLatitude);

    const valid = isValidCoordinate(latitude, longitude);

    return {
      raw: rawStr,
      longitude,
      latitude,
      valid,
      formatted: valid
        ? `${Math.abs(latitude).toFixed(6)}°${latitude >= 0 ? 'N' : 'S'}, ${Math.abs(longitude).toFixed(6)}°${longitude >= 0 ? 'E' : 'W'}`
        : 'INVALID COORDINATE'
    };
  }, [contract1]);

  // Contract 2 coordinate extraction: corridor node = { lat: number, lon: number }
  const c2Nodes = useMemo(() => {
    if (!corridor || !Array.isArray(corridor.corridor)) return [];
    return corridor.corridor.map((node, idx) => {
      const latitude = Number(node.lat);
      const longitude = Number(node.lon);
      const valid = isValidCoordinate(latitude, longitude);
      return {
        idx: idx + 1,
        hours_ago: node.hours_ago,
        radius_km: node.radius_km,
        latitude,
        longitude,
        valid,
        raw: `{ lat: ${node.lat}, lon: ${node.lon} }`,
        formatted: valid
          ? `${Math.abs(latitude).toFixed(6)}°${latitude >= 0 ? 'N' : 'S'}, ${Math.abs(longitude).toFixed(6)}°${longitude >= 0 ? 'E' : 'W'}`
          : 'INVALID COORDINATE'
      };
    });
  }, [corridor]);

  // AIS / Suspect vessel extraction
  const suspectCoord = useMemo(() => {
    if (!topSuspect || !corridor) return null;
    const matchedNode = corridor.corridor.find(n => n.hours_ago === topSuspect.fits_hours_ago);
    if (!matchedNode) return null;
    const latitude = Number(matchedNode.lat);
    const longitude = Number(matchedNode.lon);
    const valid = isValidCoordinate(latitude, longitude);
    return {
      name: topSuspect.name,
      mmsi: topSuspect.mmsi,
      fits_hours_ago: topSuspect.fits_hours_ago,
      matched_at: topSuspect.matched_at,
      latitude,
      longitude,
      valid,
      formatted: valid
        ? `${Math.abs(latitude).toFixed(6)}°${latitude >= 0 ? 'N' : 'S'}, ${Math.abs(longitude).toFixed(6)}°${longitude >= 0 ? 'E' : 'W'}`
        : 'INVALID COORDINATE'
    };
  }, [topSuspect, corridor]);

  // Center MarineTraffic map on real Contract 1 detection coordinates if available
  const centerLongitude = c1Coords?.valid ? c1Coords.longitude : 60.2;
  const centerLatitude = c1Coords?.valid ? c1Coords.latitude : 13.3;

  const handleInspectClick = () => {
    if (contract1 || activeDetection) {
      if (onSelectDetection) {
        onSelectDetection(activeDetection || currentScene.detections?.[0]);
      }
    } else {
      setNoAnomalyModalOpen(true);
    }
  };

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
          checked={checked && !disabled}
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
      {/* ========================================================================= */}
      {/* 1. MARINETRAFFIC LIVE AIS MAP CONTAINER                                    */}
      {/* Full-screen real vessel traffic map                                       */}
      {/* ========================================================================= */}
      <div
        id="marinetraffic-map-section"
        className={`absolute inset-0 w-full h-full transition-opacity duration-300 z-0 ${
          gisLayers.marineTraffic !== false ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <MarineTrafficMap
          centerX={centerLongitude}
          centerY={centerLatitude}
          zoom={6}
          showOverlays={true}
          className="w-full h-full"
        />
      </div>

      {/* Fallback canvas shown if user unchecks MarineTraffic Live AIS */}
      {gisLayers.marineTraffic === false && (
        <div className="absolute inset-0 w-full h-full bg-[#030a16] flex flex-col items-center justify-center text-slate-500 font-mono text-xs z-0 pointer-events-none">
          <Eye className="w-8 h-8 opacity-40 mb-2" />
          <div>MarineTraffic Live AIS map layer is currently hidden via GIS Layer Stack.</div>
          <div className="text-[10px] text-slate-600 mt-1">Check "MarineTraffic Live AIS" in the left panel to show map.</div>
        </div>
      )}


      {/* ========================================================================= */}
      {/* 3. TRANSPARENT COORDINATE OVERLAY (Directly above MarineTraffic iframe)   */}
      {/* Prominently marks Contract 1, Contract 2, Suspect Vessel, and Origin      */}
      {/* ========================================================================= */}
      <CoordinateOverlay
        contract1={contract1}
        corridor={corridor}
        topSuspect={topSuspect}
        gisLayers={gisLayers}
      />

      {/* MarineTraffic Live Map Header Tag */}
      <div className="absolute top-4 left-4 z-20 pointer-events-none">
        <div className="bg-slate-950/90 border border-blue-500/40 rounded px-3 py-1.5 backdrop-blur shadow-xl flex items-center gap-2 font-mono text-xs text-blue-300">
          <span className={`w-2 h-2 rounded-full ${gisLayers.marineTraffic !== false ? 'bg-blue-400 animate-pulse' : 'bg-slate-500'}`} />
          <span className="font-bold tracking-wide">MARINETRAFFIC LIVE AIS MAP</span>
          <span className="text-slate-400 text-[10px]">
            {gisLayers.marineTraffic !== false ? '(Real-Time Vessel Traffic)' : '(LAYER HIDDEN)'}
          </span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. FLOATING CONTROLS: GIS LAYERS PANEL (Left Side)                        */}
      {/* ========================================================================= */}
      <div
        id="gis-layers-panel"
        className={`absolute top-16 left-4 z-30 flex flex-col shadow-2xl transition-all duration-200 overflow-hidden ${
          isLayersPanelCollapsed ? 'w-44' : 'w-72'
        }`}
        style={{
          background: 'var(--gov-surface)',
          border: '1px solid var(--gov-border)',
          borderTop: '3px solid var(--gov-navy)',
          borderRadius: '2px'
        }}
      >
        <div
          className="px-3 py-2 flex justify-between items-center"
          style={{ background: 'var(--gov-surface-alt)', borderBottom: '1px solid var(--gov-border)' }}
        >
          <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--gov-navy)' }}>
            <Layers className="w-3.5 h-3.5" style={{ color: 'var(--gov-saffron)' }} />
            GIS Layer Stack
          </span>
          <button
            onClick={() => setIsLayersPanelCollapsed(!isLayersPanelCollapsed)}
            className="p-1 rounded transition-colors cursor-pointer"
            style={{ color: 'var(--gov-text-muted)' }}
            title="Toggle Panel"
          >
            {isLayersPanelCollapsed ? <Eye className="w-3.5 h-3.5" /> : <Sliders className="w-3.5 h-3.5" />}
          </button>
        </div>

        {!isLayersPanelCollapsed && (
          <div className="p-3 flex flex-col gap-1 max-h-[calc(100vh-280px)] overflow-y-auto">
            {/* 1. MarineTraffic Live AIS Toggle */}
            <LayerRow
              label="MarineTraffic Live AIS"
              checked={gisLayers.marineTraffic !== false}
              onChange={v => setGisLayers({ ...gisLayers, marineTraffic: v })}
              colorDot="#3b82f6"
            />

            <div className="mt-1 pt-1 border-t border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Telemetry Overlays:
            </div>

            {/* 3. Predicted Mask (Detector) Toggle & Opacity Slider */}
            <div style={{ border: '1px solid var(--gov-navy)', borderRadius: '2px', background: 'var(--gov-navy-light)' }}>
              <LayerRow
                label="Predicted Mask (Detector)"
                checked={gisLayers.predictedMask}
                onChange={v => setGisLayers({ ...gisLayers, predictedMask: v })}
                colorDot="#06b6d4"
                disabled={!contract1}
                disabledReason="Run Ingest stage to produce Contract 1 polygon mask"
              />
              {gisLayers.predictedMask && (
                <div className="pl-9 pr-3 pb-2 flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider w-14" style={{ color: 'var(--gov-navy)' }}>Opacity</span>
                  <input
                    type="range" min="0" max="100"
                    value={gisLayers.predictedMaskOpacity}
                    onChange={e => setGisLayers({ ...gisLayers, predictedMaskOpacity: Number(e.target.value) })}
                    className="flex-1 cursor-pointer"
                    style={{ accentColor: 'var(--gov-navy)' }}
                  />
                  <span className="text-xs font-mono w-8 text-right" style={{ color: 'var(--gov-navy)' }}>{gisLayers.predictedMaskOpacity}%</span>
                </div>
              )}
            </div>

            {/* 4. Confidence Heatmap Toggle */}
            <LayerRow
              label="Confidence Heatmap"
              checked={gisLayers.confidenceHeatmap}
              onChange={v => setGisLayers({ ...gisLayers, confidenceHeatmap: v })}
              colorDot="#C62828"
              disabled={!contract1}
              disabledReason="Run Ingest stage to compute detection confidence"
            />

            {/* 5. Drift Corridor Path Toggle */}
            <LayerRow
              label={`Drift Corridor Path (${corridor?.field_source ?? 'analytic'})`}
              checked={gisLayers.oceanCurrents}
              onChange={v => setGisLayers({ ...gisLayers, oceanCurrents: v })}
              colorDot="#f59e0b"
              disabled={!corridor}
              disabledReason="Run Drift analysis first to compute trajectory corridor"
            />

            {/* 6. Suspect Vessel Position Toggle */}
            <LayerRow
              label="Suspect Vessel Position"
              checked={gisLayers.aisTracks}
              onChange={v => setGisLayers({ ...gisLayers, aisTracks: v })}
              colorDot="#ef4444"
              disabled={!topSuspect}
              disabledReason="Run Suspect matching first to identify a top suspect"
            />

            {/* 7. Origin Estimate Toggle */}
            <LayerRow
              label="Origin Estimate"
              checked={gisLayers.originEstimate}
              onChange={v => setGisLayers({ ...gisLayers, originEstimate: v })}
              icon={<Crosshair className="w-3 h-3 shrink-0" style={{ color: '#C62828' }} />}
              disabled={!contract1}
              disabledReason="Run Ingest stage first to fetch Contract 1 detection origin"
            />

            {/* 8. Inspect Anomaly Button */}
            <button
              onClick={handleInspectClick}
              className="mt-2 w-full py-2 flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer shadow-md"
              style={{
                background: contract1 || activeDetection ? 'var(--gov-green)' : '#475569',
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

      {/* ========================================================================= */}
      {/* 5. TELEMETRY DETAILS PANEL (Top-Right of Map)                              */}
      {/* ========================================================================= */}
      <div className="absolute top-4 right-4 z-30 flex flex-col items-end gap-2">
        <button
          onClick={() => setIsOverlayPanelOpen(!isOverlayPanelOpen)}
          className="px-3 py-1.5 rounded text-xs font-mono font-bold bg-slate-950/95 text-cyan-300 border border-cyan-500/50 hover:bg-cyan-950/50 shadow-2xl cursor-pointer flex items-center gap-2 backdrop-blur"
        >
          <Activity className="w-3.5 h-3.5 text-cyan-400" />
          [ {isOverlayPanelOpen ? 'Hide Coordinates Panel' : 'Show Coordinates Panel'} ]
        </button>

        {isOverlayPanelOpen && (
          <div
            id="coordinate-telemetry-overlay-panel"
            className="w-88 max-h-[calc(100vh-140px)] overflow-y-auto bg-slate-950/90 border border-cyan-500/40 rounded-xl p-4 shadow-2xl backdrop-blur font-mono text-[11px] text-slate-200 flex flex-col gap-3 pointer-events-auto transition-opacity duration-200"
            style={{ opacity: Math.max(gisLayers.predictedMaskOpacity / 100, 0.2) }}
          >
            <div className="flex items-center justify-between border-b border-cyan-900/60 pb-2">
              <span className="font-bold text-cyan-300 flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-cyan-400" />
                TELEMETRY COORDINATES
              </span>
              <span className="text-[10px] text-cyan-400 font-semibold">
                OPACITY: {gisLayers.predictedMaskOpacity}%
              </span>
            </div>

            {/* CONTRACT 1 — DETECTED SPILL */}
            {gisLayers.predictedMask && (
              <div className="bg-slate-900/90 p-3 rounded-lg border border-cyan-500/40 flex flex-col gap-1.5 shadow-md">
                <div className="text-cyan-300 font-bold text-xs uppercase flex items-center justify-between border-b border-slate-800 pb-1">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                    CONTRACT 1 — DETECTED SPILL
                  </span>
                  {c1Coords ? (
                    c1Coords.valid ? (
                      <span className="text-emerald-400 text-[10px] flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> VALID
                      </span>
                    ) : (
                      <span className="text-rose-400 text-[10px] flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> INVALID
                      </span>
                    )
                  ) : (
                    <span className="text-slate-400 text-[10px]">NO DATA</span>
                  )}
                </div>

                {c1Coords ? (
                  <div className="flex flex-col gap-1 text-[11px] pt-0.5">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Centroid Lat:</span>
                      <span className="text-white font-semibold">{c1Coords.latitude.toFixed(6)}°</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Centroid Lon:</span>
                      <span className="text-white font-semibold">{c1Coords.longitude.toFixed(6)}°</span>
                    </div>
                    {contract1?.area_km2 !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Spill Area:</span>
                        <span className="text-cyan-300 font-semibold">{contract1.area_km2} km²</span>
                      </div>
                    )}
                    {contract1?.major_axis_km !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Major Axis:</span>
                        <span className="text-slate-200">{contract1.major_axis_km} km</span>
                      </div>
                    )}
                    {contract1?.confidence !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Confidence:</span>
                        <span className="text-emerald-400 font-semibold">
                          {(contract1.confidence * 100).toFixed(1)}%
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-400">Detector:</span>
                      <span className="text-slate-300">ResNet-50 SAR Morphological</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-400 italic text-[10px] pt-1">
                    Run Ingest stage to fetch Contract 1 detection.
                  </div>
                )}
              </div>
            )}

            {/* CONTRACT 2 — DRIFT CORRIDOR */}
            {gisLayers.oceanCurrents && (
              <div className="bg-slate-900/90 p-3 rounded-lg border border-amber-500/40 flex flex-col gap-1.5 shadow-md">
                <div className="text-amber-300 font-bold text-xs uppercase flex items-center justify-between border-b border-slate-800 pb-1">
                  <span>CONTRACT 2 — DRIFT CORRIDOR</span>
                  <span className="text-slate-400 text-[10px]">
                    {c2Nodes.length > 0 ? `${c2Nodes.length} Nodes` : 'NO DATA'}
                  </span>
                </div>
                {c2Nodes.length > 0 ? (
                  <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1 pt-0.5">
                    {c2Nodes.map((n) => (
                      <div key={n.idx} className="bg-slate-950/80 p-2 rounded border border-slate-800/80 text-[10px] flex flex-col gap-0.5">
                        <div className="flex justify-between font-bold text-amber-400">
                          <span>Node {n.idx} (T-{n.hours_ago}h)</span>
                          <span className="text-slate-400 font-normal">r = {n.radius_km} km</span>
                        </div>
                        <div className="flex justify-between text-slate-300">
                          <span>Lat: <strong className="text-white">{n.latitude.toFixed(6)}°</strong></span>
                          <span>Lon: <strong className="text-white">{n.longitude.toFixed(6)}°</strong></span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-slate-400 italic text-[10px] pt-1">
                    No corridor data available. Run Drift stage.
                  </div>
                )}
              </div>
            )}

            {/* AIS / TOP SUSPECT */}
            {gisLayers.aisTracks && (
              <div className="bg-slate-900/90 p-3 rounded-lg border border-orange-500/40 flex flex-col gap-1.5 shadow-md">
                <div className="text-orange-300 font-bold text-xs uppercase flex items-center justify-between border-b border-slate-800 pb-1">
                  <span className="flex items-center gap-1.5">
                    <Ship className="w-3.5 h-3.5 text-orange-400" />
                    AIS / TOP SUSPECT
                  </span>
                  {suspectCoord ? (
                    <span className="text-emerald-400 text-[10px] font-bold">MATCHED</span>
                  ) : (
                    <span className="text-slate-400 text-[10px]">NONE</span>
                  )}
                </div>
                {suspectCoord ? (
                  <div className="text-[11px] flex flex-col gap-1 pt-0.5">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Vessel Name:</span>
                      <span className="font-bold text-white">{suspectCoord.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">MMSI:</span>
                      <span className="text-amber-300 font-semibold">{suspectCoord.mmsi}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Matched Node:</span>
                      <span className="text-cyan-300 font-semibold">T-{suspectCoord.fits_hours_ago}h</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Latitude:</span>
                      <span className="text-white font-semibold">{suspectCoord.latitude.toFixed(6)}°</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Longitude:</span>
                      <span className="text-white font-semibold">{suspectCoord.longitude.toFixed(6)}°</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-400 italic text-[10px] pt-1">
                    No suspect matched yet. Run Suspects stage.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* NO ANOMALY DETECTION NOTICE MODAL                                          */}
      {/* ========================================================================= */}
      {noAnomalyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 max-w-md w-full shadow-2xl flex flex-col gap-3 font-mono text-xs text-slate-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-bold text-amber-400 flex items-center gap-2 text-sm">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                No Anomaly Detection Available
              </span>
              <button onClick={() => setNoAnomalyModalOpen(false)} className="text-slate-400 hover:text-white p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="text-slate-300 leading-relaxed">
              No real Contract 1 anomaly detection response is currently loaded in memory.
              <br /><br />
              To inspect an anomaly:
              <ol className="list-decimal pl-5 mt-1 space-y-1 text-slate-400">
                <li>Go to the <strong>Ingest</strong> pipeline stage.</li>
                <li>Click <strong>Run Detection Pipeline</strong> to receive live Contract 1 detection output.</li>
                <li>Return to the Map view to inspect details.</li>
              </ol>
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setNoAnomalyModalOpen(false)}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded cursor-pointer transition-colors"
              >
                Close Notice
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
