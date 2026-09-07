import React, { useRef, useMemo } from 'react';
import { GisLayers, MorphologicalProperties, SceneMetadata, Suspect, CorridorResponse } from '../../types';
import { DetectionResponse } from '../../api/api';
import { Eye } from 'lucide-react';
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
  onNavigateToAnalysis?: () => void;
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
  gisLayers,
  contract1,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Contract 1 coordinate extraction: contract1.centroid = [longitude, latitude]
  const c1Coords = useMemo(() => {
    if (!contract1 || !Array.isArray(contract1.centroid) || contract1.centroid.length < 2) {
      return null;
    }
    const rawLongitude = contract1.centroid[0];
    const rawLatitude = contract1.centroid[1];

    const longitude = Number(rawLongitude);
    const latitude = Number(rawLatitude);

    const valid = isValidCoordinate(latitude, longitude);

    return {
      longitude,
      latitude,
      valid,
    };
  }, [contract1]);

  // Center MarineTraffic map on real Contract 1 detection coordinates if available
  const centerLongitude = c1Coords?.valid ? c1Coords.longitude : 60.2;
  const centerLatitude = c1Coords?.valid ? c1Coords.latitude : 13.3;

  return (
    <div
      id="map-view-canvas"
      ref={containerRef}
      className="flex flex-col w-full h-[calc(100vh-72px)] overflow-hidden select-none bg-[#010f1f]"
    >
      {/* ========================================================================= */}
      {/* VIEW 1 — MARINETRAFFIC LIVE AIS MAP                                       */}
      {/* Full content area. Clean, full-size MarineTraffic map.                    */}
      {/* ========================================================================= */}
      <div
        id="marinetraffic-window"
        className="relative flex-1 w-full h-full overflow-hidden"
      >
        {/* MarineTraffic map container */}
        <div
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

        {/* Fallback when MarineTraffic layer hidden */}
        {gisLayers.marineTraffic === false && (
          <div className="absolute inset-0 w-full h-full bg-[#030a16] flex flex-col items-center justify-center text-slate-500 font-mono text-xs z-0 pointer-events-none">
            <Eye className="w-8 h-8 opacity-40 mb-2" />
            <div>MarineTraffic Live AIS map layer is currently hidden via GIS Layer Stack.</div>
          </div>
        )}
      </div>
    </div>
  );
};
