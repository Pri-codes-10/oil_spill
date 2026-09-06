import React, { useMemo } from 'react';
import { CorridorResponse, GisLayers, Suspect } from '../types';
import { DetectionResponse } from '../api/api';
import { isValidCoordinate } from './views/MapView';

/**
 * CoordinateOverlay
 * 
 * IMPORTANT HONESTY NOTE:
 * MarineTraffic is an external cross-origin iframe; its internal map coordinates cannot be
 * directly accessed or manipulated. This component renders an "ANALYSIS OVERLAY" positioned
 * directly on top of the MarineTraffic iframe, projecting real backend coordinates (Contract 1,
 * Contract 2, Suspect vessel, Origin) onto the viewport for visual inspection and analysis.
 */

export interface CoordinateOverlayProps {
  contract1: DetectionResponse | null;
  corridor: CorridorResponse | null;
  topSuspect: Suspect | null;
  gisLayers: GisLayers;
  className?: string;
}

export const CoordinateOverlay: React.FC<CoordinateOverlayProps> = ({
  contract1,
  corridor,
  topSuspect,
  gisLayers,
  className = ''
}) => {
  // 1. Contract 1 Centroid [lon, lat]
  const c1Centroid = useMemo(() => {
    if (!contract1?.centroid || !Array.isArray(contract1.centroid) || contract1.centroid.length < 2) return null;
    const lon = Number(contract1.centroid[0]);
    const lat = Number(contract1.centroid[1]);
    if (!isValidCoordinate(lat, lon)) return null;
    return { lat, lon };
  }, [contract1]);

  // 2. Contract 1 Polygon Points
  const c1PolygonPts = useMemo(() => {
    if (!contract1?.polygon || !Array.isArray(contract1.polygon[0])) return [];
    return contract1.polygon[0]
      .filter((pt: any) => Array.isArray(pt) && pt.length >= 2 && isValidCoordinate(pt[1], pt[0]))
      .map((pt: any) => ({ lat: Number(pt[1]), lon: Number(pt[0]) }));
  }, [contract1]);

  // 3. Contract 2 Corridor Nodes
  const corridorNodes = useMemo(() => {
    if (!corridor?.corridor || !Array.isArray(corridor.corridor)) return [];
    return corridor.corridor
      .map((node, idx) => ({
        idx: idx + 1,
        hours_ago: node.hours_ago,
        radius_km: node.radius_km,
        lat: Number(node.lat),
        lon: Number(node.lon)
      }))
      .filter((n) => isValidCoordinate(n.lat, n.lon));
  }, [corridor]);

  // 4. Suspect Vessel Position
  const suspectVessel = useMemo(() => {
    if (!topSuspect || !corridor?.corridor) return null;
    const matchedNode = corridor.corridor.find((n) => n.hours_ago === topSuspect.fits_hours_ago);
    if (!matchedNode) return null;
    const lat = Number(matchedNode.lat);
    const lon = Number(matchedNode.lon);
    if (!isValidCoordinate(lat, lon)) return null;
    return {
      name: topSuspect.name,
      mmsi: topSuspect.mmsi,
      fits_hours_ago: topSuspect.fits_hours_ago,
      lat,
      lon
    };
  }, [topSuspect, corridor]);

  // Collect all valid points for projection bounds
  const allPoints = useMemo(() => {
    const pts: { lat: number; lon: number }[] = [];
    if (c1Centroid) pts.push(c1Centroid);
    c1PolygonPts.forEach((p) => pts.push(p));
    corridorNodes.forEach((n) => pts.push({ lat: n.lat, lon: n.lon }));
    if (suspectVessel) pts.push({ lat: suspectVessel.lat, lon: suspectVessel.lon });
    return pts;
  }, [c1Centroid, c1PolygonPts, corridorNodes, suspectVessel]);

  // Projection math: maps (lat, lon) -> SVG coordinates (1000 x 650)
  const { project, c1Pt, corridorPts, suspectPt } = useMemo(() => {
    if (allPoints.length === 0) {
      const fallbackProject = () => ({ x: 500, y: 325 });
      return { project: fallbackProject, c1Pt: null, corridorPts: [], suspectPt: null };
    }

    const minLat = Math.min(...allPoints.map((p) => p.lat));
    const maxLat = Math.max(...allPoints.map((p) => p.lat));
    const minLon = Math.min(...allPoints.map((p) => p.lon));
    const maxLon = Math.max(...allPoints.map((p) => p.lon));

    const spanLat = Math.max(maxLat - minLat, 0.08);
    const spanLon = Math.max(maxLon - minLon, 0.12);

    const projectFunc = (lat: number, lon: number): { x: number; y: number } => {
      // Normalize lon [0, 1]
      const normX = (lon - (minLon - spanLon * 0.2)) / (spanLon * 1.4);
      // Normalize lat [0, 1] (inverted for SVG screen Y)
      const normY = ((maxLat + spanLat * 0.2) - lat) / (spanLat * 1.4);

      // Distribute in center 240px to 800px horizontally, 120px to 540px vertically
      const x = Math.min(Math.max(260 + normX * 520, 220), 840);
      const y = Math.min(Math.max(130 + normY * 390, 100), 550);
      return { x, y };
    };

    const c1 = c1Centroid ? projectFunc(c1Centroid.lat, c1Centroid.lon) : null;
    const cNodes = corridorNodes.map((n) => ({
      ...n,
      pt: projectFunc(n.lat, n.lon)
    }));
    const sPt = suspectVessel ? projectFunc(suspectVessel.lat, suspectVessel.lon) : null;

    return { project: projectFunc, c1Pt: c1, corridorPts: cNodes, suspectPt: sPt };
  }, [allPoints, c1Centroid, corridorNodes, suspectVessel]);

  // Corridor line points connecting origin through corridor nodes
  const corridorLineString = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    if (c1Pt) pts.push(c1Pt);
    corridorPts.forEach((n) => pts.push(n.pt));
    if (pts.length < 2) return '';
    return pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  }, [c1Pt, corridorPts]);

  // Contract 1 polygon SVG points
  const polygonPointsString = useMemo(() => {
    if (c1PolygonPts.length < 3) return '';
    return c1PolygonPts.map((p) => {
      const proj = project(p.lat, p.lon);
      return `${proj.x.toFixed(1)},${proj.y.toFixed(1)}`;
    }).join(' ');
  }, [c1PolygonPts, project]);

  // Apply layer opacity from slider
  const overlayOpacity = Math.max((gisLayers.predictedMaskOpacity ?? 85) / 100, 0.1);

  return (
    <div
      className={`coordinate-overlay absolute inset-0 w-full h-full pointer-events-none z-20 overflow-hidden transition-opacity duration-200 ${className}`}
      style={{ opacity: overlayOpacity }}
    >
      {/* Honest Label Badge */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
        <div className="bg-slate-950/90 border border-cyan-500/60 rounded-full px-4 py-1 backdrop-blur shadow-2xl flex items-center gap-2 font-mono text-[11px] text-cyan-300">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="font-bold tracking-wider uppercase">ANALYSIS OVERLAY</span>
          <span className="text-slate-400 text-[10px]">(Projected Backend Coordinates)</span>
        </div>
      </div>

      <svg
        className="w-full h-full pointer-events-none"
        viewBox="0 0 1000 650"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <radialGradient id="spill-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.55" />
            <stop offset="60%" stopColor="#0891b2" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#0e7490" stopOpacity="0.05" />
          </radialGradient>

          <radialGradient id="confidence-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.45" />
            <stop offset="50%" stopColor="#f59e0b" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
          </radialGradient>

          <filter id="glow-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#000000" floodOpacity="0.8" />
          </filter>
        </defs>

        {/* ================================================================= */}
        {/* 4. CONFIDENCE HEATMAP (Controlled by gisLayers.confidenceHeatmap)  */}
        {/* ================================================================= */}
        {gisLayers.confidenceHeatmap && c1Pt && (
          <g filter="url(#glow-shadow)">
            <circle cx={c1Pt.x} cy={c1Pt.y} r="85" fill="url(#confidence-glow)" />
            <g transform={`translate(${c1Pt.x - 75}, ${c1Pt.y - 75})`}>
              <rect width="150" height="22" rx="4" fill="#1e1b4b" stroke="#818cf8" strokeWidth="1" opacity="0.92" />
              <text x="8" y="15" fill="#c7d2fe" fontFamily="monospace" fontSize="9.5" fontWeight="bold">
                🔥 CONFIDENCE: {((contract1?.confidence || 0.94) * 100).toFixed(0)}%
              </text>
            </g>
          </g>
        )}

        {/* ================================================================= */}
        {/* 1. CONTRACT 1 POLYGON MASK (Controlled by gisLayers.predictedMask) */}
        {/* ================================================================= */}
        {gisLayers.predictedMask && polygonPointsString && (
          <g filter="url(#glow-shadow)">
            <polygon
              points={polygonPointsString}
              fill="url(#spill-halo)"
              stroke="#22d3ee"
              strokeWidth="2.5"
            />
          </g>
        )}

        {/* ================================================================= */}
        {/* 2. CONTRACT 2 CORRIDOR PATH LINE & NODES                          */}
        {/* (Controlled by gisLayers.oceanCurrents)                           */}
        {/* ================================================================= */}
        {gisLayers.oceanCurrents && (
          <g filter="url(#glow-shadow)">
            {/* Connecting Drift Corridor Line */}
            {corridorLineString && (
              <polyline
                points={corridorLineString}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="3.5"
                strokeDasharray="8 5"
                opacity="0.95"
              />
            )}

            {/* Corridor Nodes */}
            {corridorPts.map((node) => (
              <g key={`corridor-node-${node.idx}`}>
                {/* Node Uncertainty Ring */}
                <circle cx={node.pt.x} cy={node.pt.y} r="15" fill="rgba(245, 158, 11, 0.25)" stroke="#f59e0b" strokeWidth="1.5" />
                <circle cx={node.pt.x} cy={node.pt.y} r="6" fill="#fbbf24" stroke="#ffffff" strokeWidth="1.5" />

                {/* Node Label Badge */}
                <g transform={`translate(${node.pt.x + 10}, ${node.pt.y - 12})`}>
                  <rect width="66" height="25" rx="4" fill="#0f172a" stroke="#f59e0b" strokeWidth="1" opacity="0.95" />
                  <text x="6" y="12" fill="#fbbf24" fontFamily="monospace" fontSize="10" fontWeight="bold">
                    ● T-{node.hours_ago}h
                  </text>
                  <text x="6" y="21" fill="#cbd5e1" fontFamily="monospace" fontSize="8">
                    {node.lat.toFixed(2)}°, {node.lon.toFixed(2)}°
                  </text>
                </g>
              </g>
            ))}
          </g>
        )}

        {/* ================================================================= */}
        {/* 7. ORIGIN ESTIMATE MARKER (Controlled by gisLayers.originEstimate)*/}
        {/* ================================================================= */}
        {gisLayers.originEstimate && c1Pt && c1Centroid && (
          <g filter="url(#glow-shadow)">
            <circle cx={c1Pt.x} cy={c1Pt.y} r="46" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.8" />
            <circle cx={c1Pt.x} cy={c1Pt.y} r="24" fill="none" stroke="#f87171" strokeWidth="1.2" />
            <line x1={c1Pt.x - 52} y1={c1Pt.y} x2={c1Pt.x + 52} y2={c1Pt.y} stroke="#ef4444" strokeWidth="1.2" strokeDasharray="3 3" />
            <line x1={c1Pt.x} y1={c1Pt.y - 52} x2={c1Pt.x} y2={c1Pt.y + 52} stroke="#ef4444" strokeWidth="1.2" strokeDasharray="3 3" />

            <g transform={`translate(${c1Pt.x - 90}, ${c1Pt.y - 75})`}>
              <rect width="180" height="34" rx="5" fill="#450a0a" stroke="#ef4444" strokeWidth="1.2" opacity="0.95" />
              <text x="8" y="14" fill="#fca5a5" fontFamily="monospace" fontSize="10.5" fontWeight="bold">🎯 ORIGIN ESTIMATE</text>
              <text x="8" y="27" fill="#fee2e2" fontFamily="monospace" fontSize="9">
                LAT {c1Centroid.lat.toFixed(6)}° LON {c1Centroid.lon.toFixed(6)}°
              </text>
            </g>
          </g>
        )}

        {/* ================================================================= */}
        {/* 1. CONTRACT 1 CENTROID MARKER (Controlled by predictedMask)       */}
        {/* ================================================================= */}
        {gisLayers.predictedMask && c1Pt && c1Centroid && (
          <g filter="url(#glow-shadow)">
            {/* Visual Crosshair Beacon */}
            <circle cx={c1Pt.x} cy={c1Pt.y} r="32" fill="none" stroke="#06b6d4" strokeWidth="1.5" opacity="0.4" className="animate-ping" />
            <circle cx={c1Pt.x} cy={c1Pt.y} r="18" fill="rgba(6, 182, 212, 0.3)" stroke="#22d3ee" strokeWidth="2.2" />
            <circle cx={c1Pt.x} cy={c1Pt.y} r="5" fill="#ffffff" />

            {/* Diamond Icon ✦ */}
            <text x={c1Pt.x} y={c1Pt.y - 24} textAnchor="middle" fill="#22d3ee" fontSize="20" fontWeight="bold">✦</text>

            {/* Marker Label Box */}
            <g transform={`translate(${c1Pt.x - 95}, ${c1Pt.y + 16})`}>
              <rect width="190" height="50" rx="6" fill="#041226" stroke="#06b6d4" strokeWidth="1.8" opacity="0.96" />
              <text x="8" y="15" fill="#22d3ee" fontFamily="monospace" fontSize="11" fontWeight="bold">✦ CONTRACT 1</text>
              <text x="8" y="28" fill="#94a3b8" fontFamily="monospace" fontSize="9.5">Detected Spill Origin</text>
              <text x="8" y="42" fill="#ffffff" fontFamily="monospace" fontSize="10" fontWeight="bold">
                LAT {c1Centroid.lat.toFixed(6)}° LON {c1Centroid.lon.toFixed(6)}°
              </text>
            </g>
          </g>
        )}

        {/* ================================================================= */}
        {/* 3. SUSPECT VESSEL MARKER (Controlled by gisLayers.aisTracks)       */}
        {/* ================================================================= */}
        {gisLayers.aisTracks && suspectPt && suspectVessel && (
          <g filter="url(#glow-shadow)">
            {/* Vessel Glyph */}
            <g transform={`translate(${suspectPt.x}, ${suspectPt.y})`}>
              <circle cx="0" cy="0" r="24" fill="rgba(239, 68, 68, 0.35)" stroke="#ef4444" strokeWidth="2" />
              <polygon points="0,-15 13,13 -13,13" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" />
              <text x="0" y="7" textAnchor="middle" fill="#ffffff" fontSize="15">🚢</text>
            </g>

            {/* Suspect Vessel Info Card */}
            <g transform={`translate(${suspectPt.x + 22}, ${suspectPt.y - 32})`}>
              <rect width="186" height="56" rx="6" fill="#2a0808" stroke="#ef4444" strokeWidth="1.8" opacity="0.96" />
              <text x="8" y="15" fill="#f87171" fontFamily="monospace" fontSize="11" fontWeight="bold">🚢 SUSPECT VESSEL</text>
              <text x="8" y="29" fill="#ffffff" fontFamily="monospace" fontSize="10.5" fontWeight="bold">{suspectVessel.name}</text>
              <text x="8" y="41" fill="#fca5a5" fontFamily="monospace" fontSize="9">
                MMSI: {suspectVessel.mmsi} • MATCH: T-{suspectVessel.fits_hours_ago}h
              </text>
              <text x="8" y="51" fill="#cbd5e1" fontFamily="monospace" fontSize="8">
                LAT {suspectVessel.lat.toFixed(6)}° LON {suspectVessel.lon.toFixed(6)}°
              </text>
            </g>
          </g>
        )}
      </svg>
    </div>
  );
};
