import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as maplibregl from 'maplibre-gl';
import {
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
  FullscreenControl,
  Popup,
  setWorkerUrl,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { CorridorResponse, SceneMetadata } from '../../types';
import { DetectionResponse, getCorridor } from '../../api/api';
import {
  Play,
  Pause,
  RotateCcw,
  RefreshCw,
  ArrowRight,
  AlertTriangle,
  Loader2,
  UploadCloud,
  Layers,
  Compass,
  Info,
} from 'lucide-react';

// Configure official worker URL for Vite
try {
  setWorkerUrl(workerUrl);
} catch (err) {
  console.warn('MapLibre workerUrl setup warning:', err);
}

// ─── Basemap Styles ────────────────────────────────────────────────────────────
const LIGHT_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

// ─── Coordinate validation ─────────────────────────────────────────────────────
function isValidCoord(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

// ─── Bearing calculation for directional indicators ───────────────────────────
function calculateBearing(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const rad = Math.PI / 180;
  const dLon = (lon2 - lon1) * rad;
  const y = Math.sin(dLon) * Math.cos(lat2 * rad);
  const x =
    Math.cos(lat1 * rad) * Math.sin(lat2 * rad) -
    Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// ─── Geodesic circle generator (WGS-84) for exact geographic radius ───────────
function createGeoCircle(lon: number, lat: number, radiusKm: number, points: number = 48): number[][] {
  const coords: number[][] = [];
  const earthRadiusKm = 6371;
  const d = radiusKm / earthRadiusKm;
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;

  for (let i = 0; i <= points; i++) {
    const bearing = (i * 2 * Math.PI) / points;
    const ptLatRad = Math.asin(
      Math.sin(latRad) * Math.cos(d) +
      Math.cos(latRad) * Math.sin(d) * Math.cos(bearing)
    );
    const ptLonRad =
      lonRad +
      Math.atan2(
        Math.sin(bearing) * Math.sin(d) * Math.cos(latRad),
        Math.cos(d) - Math.sin(latRad) * Math.sin(ptLatRad)
      );
    coords.push([(ptLonRad * 180) / Math.PI, (ptLatRad * 180) / Math.PI]);
  }
  return coords;
}

// ─── Playback Node Interface ──────────────────────────────────────────────────
export interface PlaybackNode {
  index: number;
  lat: number;
  lon: number;
  hours_ago: number;
  radius_km: number;
  isObserved?: boolean;
}

// ─── Source & Layer IDs ───────────────────────────────────────────────────────
const SOURCE = {
  observed: 'drift-observed-source',
  fullPath: 'drift-full-path-source',
  traversedPath: 'drift-traversed-path-source',
  nodes: 'drift-nodes-source',
  activeMarker: 'drift-active-marker-source',
  activeUncertainty: 'drift-active-uncertainty-source',
} as const;

const LAYER = {
  fullPathLine: 'drift-full-path-line',
  traversedPathGlow: 'drift-traversed-path-glow',
  traversedPathLine: 'drift-traversed-path-line',
  activeUncertaintyFill: 'drift-active-uncertainty-fill',
  activeUncertaintyLine: 'drift-active-uncertainty-line',
  nodesHalo: 'drift-nodes-halo',
  nodes: 'drift-nodes',
  nodesLabel: 'drift-nodes-label',
  observedHalo: 'drift-observed-halo',
  observedMarker: 'drift-observed-marker',
  observedLabel: 'drift-observed-label',
  activeMarkerHalo: 'drift-active-marker-halo',
  activeMarker: 'drift-active-marker',
  activeMarkerLabel: 'drift-active-marker-label',
} as const;

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

// ─── Extract Chronological Playback Sequence from Backend Nodes ───────────────
function extractPlaybackNodes(
  contract1: DetectionResponse | null,
  corridor: CorridorResponse | null
): PlaybackNode[] {
  if (!corridor || !Array.isArray(corridor.corridor) || corridor.corridor.length === 0) {
    return [];
  }

  // Filter valid nodes
  const valid = corridor.corridor.filter(
    (n) =>
      Number.isFinite(n.lat) &&
      Number.isFinite(n.lon) &&
      isValidCoord(Number(n.lat), Number(n.lon))
  );
  if (valid.length === 0) return [];

  // Sort descending by hours_ago: movement goes from oldest historical lookback down to 0
  const sorted = [...valid].sort((a, b) => b.hours_ago - a.hours_ago);

  const nodes: PlaybackNode[] = sorted.map((n, idx) => ({
    index: idx,
    lat: Number(n.lat),
    lon: Number(n.lon),
    hours_ago: n.hours_ago,
    radius_km: Math.max(Number(n.radius_km) || 1, 0.1),
    isObserved: false,
  }));

  // Append observed centroid as final destination node if available
  if (contract1 && Array.isArray(contract1.centroid) && contract1.centroid.length >= 2) {
    const cLon = Number(contract1.centroid[0]);
    const cLat = Number(contract1.centroid[1]);
    if (isValidCoord(cLat, cLon)) {
      const last = nodes[nodes.length - 1];
      if (
        last.hours_ago !== 0 ||
        Math.abs(last.lon - cLon) > 1e-5 ||
        Math.abs(last.lat - cLat) > 1e-5
      ) {
        nodes.push({
          index: nodes.length,
          lon: cLon,
          lat: cLat,
          hours_ago: 0,
          radius_km: last ? last.radius_km : 1,
          isObserved: true,
        });
      } else {
        last.isObserved = true;
      }
    }
  }

  // Re-index nodes sequentially
  nodes.forEach((n, i) => {
    n.index = i;
  });

  return nodes;
}

// ─── Compute Geographic Bounds for fitBounds ──────────────────────────────────
function computeDriftBounds(
  contract1: DetectionResponse | null,
  corridor: CorridorResponse | null
): [[number, number], [number, number]] | null {
  const pts: [number, number][] = [];

  if (contract1 && Array.isArray(contract1.centroid) && contract1.centroid.length >= 2) {
    const lon = Number(contract1.centroid[0]);
    const lat = Number(contract1.centroid[1]);
    if (isValidCoord(lat, lon)) pts.push([lon, lat]);
  }

  if (corridor && Array.isArray(corridor.corridor)) {
    corridor.corridor.forEach((n) => {
      const lon = Number(n.lon);
      const lat = Number(n.lat);
      const r = Math.max(Number(n.radius_km) || 1, 0.1);
      const dLat = r / 110.574;
      const cosLat = Math.cos((lat * Math.PI) / 180);
      const dLon = r / (111.320 * (Math.abs(cosLat) < 0.0001 ? 1 : Math.abs(cosLat)));
      if (isValidCoord(lat, lon)) {
        pts.push([lon, lat]);
        pts.push([lon - dLon, lat - dLat]);
        pts.push([lon + dLon, lat + dLat]);
      }
    });
  }

  if (pts.length === 0) return null;
  const lons = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  if (minLon === maxLon && minLat === maxLat) {
    return [
      [minLon - 0.05, minLat - 0.05],
      [maxLon + 0.05, maxLat + 0.05],
    ];
  }
  return [
    [minLon, minLat],
    [maxLon, maxLat],
  ];
}

// ─── DriftView Component ──────────────────────────────────────────────────────
interface DriftViewProps {
  currentScene: SceneMetadata;
  contract1: DetectionResponse | null;
  corridor?: CorridorResponse | null;
  onCorridorReady: (corridor: CorridorResponse) => void;
  onProceedToSuspects: () => void;
  onGoToIngest: () => void;
  theme?: 'light' | 'dark';
}

export const DriftView: React.FC<DriftViewProps> = ({
  currentScene,
  contract1,
  corridor: initialCorridor,
  onCorridorReady,
  onProceedToSuspects,
  onGoToIngest,
  theme = 'dark',
}) => {
  const [corridor, setCorridor] = useState<CorridorResponse | null>(initialCorridor || null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [progress, setProgress] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapLoadedRef = useRef<boolean>(false);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  const contract1Ref = useRef(contract1);
  const corridorRef = useRef(corridor);
  const themeRef = useRef(theme);

  const progressRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);
  const playbackSpeedRef = useRef<number>(playbackSpeed);
  const animFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const lastReportedNodeIndexRef = useRef<number>(-1);

  contract1Ref.current = contract1;
  corridorRef.current = corridor;
  themeRef.current = theme;
  playbackSpeedRef.current = playbackSpeed;

  // Extract ordered playback nodes
  const playbackNodes = useMemo(() => {
    return extractPlaybackNodes(contract1, corridor);
  }, [contract1, corridor]);

  const playbackNodesRef = useRef(playbackNodes);
  playbackNodesRef.current = playbackNodes;

  // 1. Initial debug logs
  useEffect(() => {
    console.log("[DRIFT PLAYBACK] DriftView mounted");
    if (corridor) {
      console.log("[DRIFT PLAYBACK] Contract 2 received:", corridor);
      console.log("[DRIFT PLAYBACK] Corridor nodes:", corridor.corridor);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync external corridor prop changes
  useEffect(() => {
    if (initialCorridor) {
      setCorridor(initialCorridor);
      console.log("[DRIFT PLAYBACK] Contract 2 received:", initialCorridor);
      console.log("[DRIFT PLAYBACK] Corridor nodes:", initialCorridor.corridor);
    }
  }, [initialCorridor]);

  // 2. Fetch corridor if not provided
  const fetchCorridor = async (c1: DetectionResponse) => {
    setIsLoading(true);
    setError(null);
    try {
      console.log("[DRIFT] Requesting backward hindcast corridor from backend...");
      const result = await getCorridor(c1, 'analytic');
      setCorridor(result);
      onCorridorReady(result);
      console.log("[DRIFT PLAYBACK] Contract 2 received:", result);
      console.log("[DRIFT PLAYBACK] Corridor nodes:", result.corridor);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to reach the backend drift API.';
      setError(msg);
      console.error("[DRIFT] Corridor fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (contract1 && !corridor && !isLoading && !error) {
      void fetchCorridor(contract1);
    }
  }, [contract1]); // eslint-disable-line react-hooks/exhaustive-deps

  // 3. Popup helper
  const showPopup = useCallback((lngLat: maplibregl.LngLat, html: string) => {
    const map = mapRef.current;
    if (!map) return;
    if (popupRef.current) popupRef.current.remove();
    popupRef.current = new maplibregl.Popup({ closeOnClick: true, maxWidth: '320px' })
      .setLngLat(lngLat)
      .setHTML(html)
      .addTo(map);
  }, []);

  // 4. Calculate interpolated state for a continuous progress value
  const getInterpolatedState = useCallback((prog: number) => {
    const nodes = playbackNodesRef.current;
    if (nodes.length === 0) {
      return {
        currentLon: 0,
        currentLat: 0,
        currentHoursAgo: 0,
        currentRadiusKm: 1,
        currentIndex: 0,
        currentNode: null,
        traversedCoords: [] as [number, number][],
      };
    }

    if (nodes.length === 1 || prog <= 0) {
      const n = nodes[0];
      return {
        currentLon: n.lon,
        currentLat: n.lat,
        currentHoursAgo: n.hours_ago,
        currentRadiusKm: n.radius_km,
        currentIndex: 0,
        currentNode: n,
        traversedCoords: [[n.lon, n.lat]] as [number, number][],
      };
    }

    const maxProg = nodes.length - 1;
    if (prog >= maxProg) {
      const last = nodes[maxProg];
      return {
        currentLon: last.lon,
        currentLat: last.lat,
        currentHoursAgo: last.hours_ago,
        currentRadiusKm: last.radius_km,
        currentIndex: maxProg,
        currentNode: last,
        traversedCoords: nodes.map((n) => [n.lon, n.lat]) as [number, number][],
      };
    }

    const segIndex = Math.floor(prog);
    const frac = prog - segIndex;
    const p1 = nodes[segIndex];
    const p2 = nodes[segIndex + 1];

    // Smooth linear interpolation BETWEEN TWO CONSECUTIVE REAL NODES ONLY
    const currentLon = p1.lon + (p2.lon - p1.lon) * frac;
    const currentLat = p1.lat + (p2.lat - p1.lat) * frac;
    const currentHoursAgo = p1.hours_ago + (p2.hours_ago - p1.hours_ago) * frac;
    const currentRadiusKm = p1.radius_km + (p2.radius_km - p1.radius_km) * frac;

    const traversedCoords: [number, number][] = [];
    for (let i = 0; i <= segIndex; i++) {
      traversedCoords.push([nodes[i].lon, nodes[i].lat]);
    }
    if (frac > 0.0001) {
      traversedCoords.push([currentLon, currentLat]);
    }

    return {
      currentLon,
      currentLat,
      currentHoursAgo,
      currentRadiusKm,
      currentIndex: segIndex,
      currentNode: p1,
      traversedCoords,
    };
  }, []);

  // 5. Update active dynamic layers on the map
  const applyProgressToMap = useCallback((prog: number) => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;

    const {
      currentLon,
      currentLat,
      currentHoursAgo,
      currentRadiusKm,
      traversedCoords,
    } = getInterpolatedState(prog);

    // Traversed Path
    const traversedFC: GeoJSON.FeatureCollection =
      traversedCoords.length >= 2
        ? {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: traversedCoords },
                properties: {},
              },
            ],
          }
        : traversedCoords.length === 1
        ? {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: traversedCoords[0] },
                properties: {},
              },
            ],
          }
        : EMPTY_FC;

    (map.getSource(SOURCE.traversedPath) as maplibregl.GeoJSONSource | undefined)?.setData(
      traversedFC
    );

    // Active Marker
    const timeLabel =
      currentHoursAgo <= 0.05
        ? 'Observed Spill'
        : `T-${currentHoursAgo.toFixed(1)}h`;

    const activeMarkerFC: GeoJSON.FeatureCollection =
      traversedCoords.length > 0
        ? {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [currentLon, currentLat] },
                properties: {
                  lat: currentLat,
                  lon: currentLon,
                  hours_ago: currentHoursAgo,
                  radius_km: currentRadiusKm,
                  label: timeLabel,
                },
              },
            ],
          }
        : EMPTY_FC;

    (map.getSource(SOURCE.activeMarker) as maplibregl.GeoJSONSource | undefined)?.setData(
      activeMarkerFC
    );

    // Active Uncertainty Geographic Polygon
    const ring = createGeoCircle(currentLon, currentLat, currentRadiusKm, 48);
    const uncertaintyFC: GeoJSON.FeatureCollection =
      traversedCoords.length > 0
        ? {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                geometry: { type: 'Polygon', coordinates: [ring] },
                properties: {
                  lat: currentLat,
                  lon: currentLon,
                  radius_km: currentRadiusKm,
                },
              },
            ],
          }
        : EMPTY_FC;

    (map.getSource(SOURCE.activeUncertainty) as maplibregl.GeoJSONSource | undefined)?.setData(
      uncertaintyFC
    );
  }, [getInterpolatedState]);

  // 6. Setup static and dynamic MapLibre Layers
  const setupDriftLayers = useCallback((map: maplibregl.Map) => {
    const isDark = themeRef.current === 'dark';
    const c1 = contract1Ref.current;
    const nodes = playbackNodesRef.current;

    // ── Static Sources ──────────────────────────────────────────────────────
    // Observed Spill
    let observedFC: GeoJSON.FeatureCollection = EMPTY_FC;
    if (c1 && Array.isArray(c1.centroid) && c1.centroid.length >= 2) {
      const lon = Number(c1.centroid[0]);
      const lat = Number(c1.centroid[1]);
      if (isValidCoord(lat, lon)) {
        observedFC = {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [lon, lat] },
              properties: {
                lat,
                lon,
                observed_at: c1.observed_at || corridorRef.current?.observed_at || 'Observed',
              },
            },
          ],
        };
      }
    }

    // Full Planned Path (all actual nodes connected in chronological order)
    const fullPathCoords: [number, number][] = nodes.map((n) => [n.lon, n.lat]);
    const fullPathFC: GeoJSON.FeatureCollection =
      fullPathCoords.length >= 2
        ? {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: fullPathCoords },
                properties: {},
              },
            ],
          }
        : EMPTY_FC;

    // Discrete Nodes
    const nodesFC: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: nodes.map((n) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [n.lon, n.lat] },
        properties: {
          index: n.index,
          lat: n.lat,
          lon: n.lon,
          hours_ago: n.hours_ago,
          radius_km: n.radius_km,
          label: n.hours_ago === 0 ? 'T-0h' : `T-${n.hours_ago}h`,
        },
      })),
    };

    // Add or Update Sources
    if (!map.getSource(SOURCE.observed)) {
      map.addSource(SOURCE.observed, { type: 'geojson', data: observedFC });
    } else {
      (map.getSource(SOURCE.observed) as maplibregl.GeoJSONSource).setData(observedFC);
    }

    if (!map.getSource(SOURCE.fullPath)) {
      map.addSource(SOURCE.fullPath, { type: 'geojson', data: fullPathFC });
    } else {
      (map.getSource(SOURCE.fullPath) as maplibregl.GeoJSONSource).setData(fullPathFC);
    }

    if (!map.getSource(SOURCE.traversedPath)) {
      map.addSource(SOURCE.traversedPath, { type: 'geojson', data: EMPTY_FC });
    }

    if (!map.getSource(SOURCE.nodes)) {
      map.addSource(SOURCE.nodes, { type: 'geojson', data: nodesFC });
    } else {
      (map.getSource(SOURCE.nodes) as maplibregl.GeoJSONSource).setData(nodesFC);
    }

    if (!map.getSource(SOURCE.activeUncertainty)) {
      map.addSource(SOURCE.activeUncertainty, { type: 'geojson', data: EMPTY_FC });
    }

    if (!map.getSource(SOURCE.activeMarker)) {
      map.addSource(SOURCE.activeMarker, { type: 'geojson', data: EMPTY_FC });
    }

    // ── Layers ──────────────────────────────────────────────────────────────
    // 1. Full Planned Corridor Path (dashed / route outline)
    if (!map.getLayer(LAYER.fullPathLine)) {
      map.addLayer({
        id: LAYER.fullPathLine,
        type: 'line',
        source: SOURCE.fullPath,
        paint: {
          'line-color': isDark ? '#0891b2' : '#0284c7',
          'line-width': 2.5,
          'line-dasharray': [3, 2],
          'line-opacity': 0.45,
        },
      });
    }

    // 2. Active Uncertainty Radius Fill
    if (!map.getLayer(LAYER.activeUncertaintyFill)) {
      map.addLayer({
        id: LAYER.activeUncertaintyFill,
        type: 'fill',
        source: SOURCE.activeUncertainty,
        paint: {
          'fill-color': '#f59e0b',
          'fill-opacity': isDark ? 0.2 : 0.16,
        },
      });
    }

    // 3. Active Uncertainty Radius Boundary
    if (!map.getLayer(LAYER.activeUncertaintyLine)) {
      map.addLayer({
        id: LAYER.activeUncertaintyLine,
        type: 'line',
        source: SOURCE.activeUncertainty,
        paint: {
          'line-color': isDark ? '#fbbf24' : '#d97706',
          'line-width': 1.8,
          'line-dasharray': [3, 2],
          'line-opacity': 0.9,
        },
      });
    }

    // 4. Traversed Trail Glow
    if (!map.getLayer(LAYER.traversedPathGlow)) {
      map.addLayer({
        id: LAYER.traversedPathGlow,
        type: 'line',
        source: SOURCE.traversedPath,
        paint: {
          'line-color': '#06b6d4',
          'line-width': 9,
          'line-opacity': isDark ? 0.35 : 0.25,
          'line-blur': 3,
        },
      });
    }

    // 5. Traversed Trail Solid Line
    if (!map.getLayer(LAYER.traversedPathLine)) {
      map.addLayer({
        id: LAYER.traversedPathLine,
        type: 'line',
        source: SOURCE.traversedPath,
        paint: {
          'line-color': '#06b6d4',
          'line-width': 4,
          'line-opacity': 1,
        },
      });
    }

    // 6. Static Corridor Nodes Halo
    if (!map.getLayer(LAYER.nodesHalo)) {
      map.addLayer({
        id: LAYER.nodesHalo,
        type: 'circle',
        source: SOURCE.nodes,
        paint: {
          'circle-radius': 9,
          'circle-color': 'rgba(245, 158, 11, 0.25)',
          'circle-stroke-color': '#f59e0b',
          'circle-stroke-width': 1.2,
        },
      });
    }

    // 7. Static Corridor Nodes
    if (!map.getLayer(LAYER.nodes)) {
      map.addLayer({
        id: LAYER.nodes,
        type: 'circle',
        source: SOURCE.nodes,
        paint: {
          'circle-radius': 5.5,
          'circle-color': '#f59e0b',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });
    }

    // 8. Static Corridor Node Labels
    if (!map.getLayer(LAYER.nodesLabel)) {
      map.addLayer({
        id: LAYER.nodesLabel,
        type: 'symbol',
        source: SOURCE.nodes,
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 11,
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-offset': [0, -1.8],
          'text-anchor': 'bottom',
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': isDark ? '#fde68a' : '#92400e',
          'text-halo-color': isDark ? '#090e17' : '#ffffff',
          'text-halo-width': 2.5,
        },
      });
    }

    // 9. Observed Spill Halo
    if (!map.getLayer(LAYER.observedHalo)) {
      map.addLayer({
        id: LAYER.observedHalo,
        type: 'circle',
        source: SOURCE.observed,
        paint: {
          'circle-radius': 22,
          'circle-color': 'rgba(16, 185, 129, 0.22)',
          'circle-stroke-color': '#10b981',
          'circle-stroke-width': 2,
          'circle-stroke-opacity': 0.9,
        },
      });
    }

    // 10. Observed Spill Center Point
    if (!map.getLayer(LAYER.observedMarker)) {
      map.addLayer({
        id: LAYER.observedMarker,
        type: 'circle',
        source: SOURCE.observed,
        paint: {
          'circle-radius': 8,
          'circle-color': '#10b981',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2.5,
        },
      });
    }

    // 11. Observed Spill Text Label
    if (!map.getLayer(LAYER.observedLabel)) {
      map.addLayer({
        id: LAYER.observedLabel,
        type: 'symbol',
        source: SOURCE.observed,
        layout: {
          'text-field': 'OBSERVED SPILL',
          'text-size': 11,
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-offset': [0, 2.0],
          'text-anchor': 'top',
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': isDark ? '#6ee7b7' : '#047857',
          'text-halo-color': isDark ? '#090e17' : '#ffffff',
          'text-halo-width': 2.5,
        },
      });
    }

    // 12. Active Animated Marker Halo (Pulse)
    if (!map.getLayer(LAYER.activeMarkerHalo)) {
      map.addLayer({
        id: LAYER.activeMarkerHalo,
        type: 'circle',
        source: SOURCE.activeMarker,
        paint: {
          'circle-radius': 20,
          'circle-color': 'rgba(6, 182, 212, 0.35)',
          'circle-stroke-color': '#06b6d4',
          'circle-stroke-width': 2.2,
          'circle-stroke-opacity': 0.9,
        },
      });
    }

    // 13. Active Animated Marker Core Point
    if (!map.getLayer(LAYER.activeMarker)) {
      map.addLayer({
        id: LAYER.activeMarker,
        type: 'circle',
        source: SOURCE.activeMarker,
        paint: {
          'circle-radius': 9,
          'circle-color': '#06b6d4',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2.5,
        },
      });
    }

    // 14. Active Animated Marker Label
    if (!map.getLayer(LAYER.activeMarkerLabel)) {
      map.addLayer({
        id: LAYER.activeMarkerLabel,
        type: 'symbol',
        source: SOURCE.activeMarker,
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 12,
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-offset': [0, -2.4],
          'text-anchor': 'bottom',
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': isDark ? '#67e8f9' : '#0891b2',
          'text-halo-color': isDark ? '#090e17' : '#ffffff',
          'text-halo-width': 2.5,
        },
      });
    }

    // ── Popup Interactions ──────────────────────────────────────────────────
    const popupBg = isDark ? '#090e17' : '#ffffff';
    const popupText = isDark ? '#f1f5f9' : '#0f172a';
    const popupBorder = isDark ? '#223048' : '#cbd5e1';
    const popupMuted = isDark ? '#94a3b8' : '#64748b';

    // Click on any Corridor Node
    const handleNodeClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      (e.originalEvent as any)._handledByFeature = true;
      const feat = e.features?.[0];
      if (!feat) return;
      const p = feat.properties as Record<string, any>;
      const lat = Number(p.lat);
      const lon = Number(p.lon);
      const hoursAgo = Number(p.hours_ago);
      const radiusKm = Number(p.radius_km);
      const idx = Number(p.index);

      // Also move playback slider to this node
      if (Number.isFinite(idx)) {
        progressRef.current = idx;
        setProgress(idx);
        applyProgressToMap(idx);
      }

      showPopup(
        e.lngLat,
        `
        <div style="font-family:'IBM Plex Mono',monospace,sans-serif;font-size:11px;color:${popupText};background:${popupBg};padding:14px;border-radius:8px;border:1.5px solid #f59e0b;min-width:210px;box-shadow:0 8px 24px rgba(0,0,0,0.35);line-height:1.4">
          <div style="color:#f59e0b;font-weight:700;font-size:12px;margin-bottom:10px;border-bottom:1px solid ${popupBorder};padding-bottom:6px;letter-spacing:0.04em">DRIFT POSITION</div>
          <div style="margin-bottom:6px">
            <div style="color:${popupMuted};font-size:10px;text-transform:uppercase;letter-spacing:0.04em">Time:</div>
            <div style="font-weight:700;font-size:12px;color:${isDark ? '#fde68a' : '#b45309'}">T-${hoursAgo}h ago</div>
          </div>
          <div style="margin-bottom:6px">
            <div style="color:${popupMuted};font-size:10px;text-transform:uppercase;letter-spacing:0.04em">Latitude:</div>
            <div style="font-weight:600;font-size:11px">${lat.toFixed(6)}°</div>
          </div>
          <div style="margin-bottom:6px">
            <div style="color:${popupMuted};font-size:10px;text-transform:uppercase;letter-spacing:0.04em">Longitude:</div>
            <div style="font-weight:600;font-size:11px">${lon.toFixed(6)}°</div>
          </div>
          <div>
            <div style="color:${popupMuted};font-size:10px;text-transform:uppercase;letter-spacing:0.04em">Radius:</div>
            <div style="font-weight:600;font-size:11px">${radiusKm.toFixed(2)} km</div>
          </div>
        </div>
      `
      );
    };

    map.on('click', LAYER.nodes, handleNodeClick);
    map.on('click', LAYER.nodesHalo, handleNodeClick);

    // Click on Active Animated Marker
    const handleActiveClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      (e.originalEvent as any)._handledByFeature = true;
      const feat = e.features?.[0];
      if (!feat) return;
      const p = feat.properties as Record<string, any>;
      const lat = Number(p.lat);
      const lon = Number(p.lon);
      const hoursAgo = Number(p.hours_ago);
      const radiusKm = Number(p.radius_km);

      showPopup(
        e.lngLat,
        `
        <div style="font-family:'IBM Plex Mono',monospace,sans-serif;font-size:11px;color:${popupText};background:${popupBg};padding:14px;border-radius:8px;border:1.5px solid #06b6d4;min-width:210px;box-shadow:0 8px 24px rgba(0,0,0,0.35);line-height:1.4">
          <div style="color:#06b6d4;font-weight:700;font-size:12px;margin-bottom:10px;border-bottom:1px solid ${popupBorder};padding-bottom:6px;letter-spacing:0.04em">DRIFT POSITION</div>
          <div style="margin-bottom:6px">
            <div style="color:${popupMuted};font-size:10px;text-transform:uppercase;letter-spacing:0.04em">Time:</div>
            <div style="font-weight:700;font-size:12px;color:${isDark ? '#67e8f9' : '#0284c7'}">${hoursAgo <= 0.05 ? 'Observed / Current' : `T-${hoursAgo.toFixed(1)}h`}</div>
          </div>
          <div style="margin-bottom:6px">
            <div style="color:${popupMuted};font-size:10px;text-transform:uppercase;letter-spacing:0.04em">Latitude:</div>
            <div style="font-weight:600;font-size:11px">${lat.toFixed(6)}°</div>
          </div>
          <div style="margin-bottom:6px">
            <div style="color:${popupMuted};font-size:10px;text-transform:uppercase;letter-spacing:0.04em">Longitude:</div>
            <div style="font-weight:600;font-size:11px">${lon.toFixed(6)}°</div>
          </div>
          <div>
            <div style="color:${popupMuted};font-size:10px;text-transform:uppercase;letter-spacing:0.04em">Radius:</div>
            <div style="font-weight:600;font-size:11px">${radiusKm.toFixed(2)} km</div>
          </div>
        </div>
      `
      );
    };

    map.on('click', LAYER.activeMarker, handleActiveClick);
    map.on('click', LAYER.activeMarkerHalo, handleActiveClick);

    // Click Observed Spill
    const handleObservedClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      (e.originalEvent as any)._handledByFeature = true;
      const feat = e.features?.[0];
      if (!feat) return;
      const p = feat.properties as Record<string, any>;
      const lat = Number(p.lat);
      const lon = Number(p.lon);
      const observedAt = p.observed_at || '—';

      showPopup(
        e.lngLat,
        `
        <div style="font-family:'IBM Plex Mono',monospace,sans-serif;font-size:11px;color:${popupText};background:${popupBg};padding:14px;border-radius:8px;border:1.5px solid #10b981;min-width:220px;box-shadow:0 8px 24px rgba(0,0,0,0.35);line-height:1.4">
          <div style="color:#10b981;font-weight:700;font-size:12px;margin-bottom:10px;border-bottom:1px solid ${popupBorder};padding-bottom:6px;letter-spacing:0.04em">OBSERVED SPILL</div>
          <div style="margin-bottom:6px">
            <div style="color:${popupMuted};font-size:10px;text-transform:uppercase;letter-spacing:0.04em">Latitude:</div>
            <div style="font-weight:600;font-size:11px">${lat.toFixed(6)}°</div>
          </div>
          <div style="margin-bottom:6px">
            <div style="color:${popupMuted};font-size:10px;text-transform:uppercase;letter-spacing:0.04em">Longitude:</div>
            <div style="font-weight:600;font-size:11px">${lon.toFixed(6)}°</div>
          </div>
          <div>
            <div style="color:${popupMuted};font-size:10px;text-transform:uppercase;letter-spacing:0.04em">Observed At:</div>
            <div style="font-weight:600;font-size:11px;color:${isDark ? '#6ee7b7' : '#047857'}">${observedAt}</div>
          </div>
        </div>
      `
      );
    };

    map.on('click', LAYER.observedMarker, handleObservedClick);
    map.on('click', LAYER.observedHalo, handleObservedClick);

    // Pointer cursor on interactive layers
    [
      LAYER.nodes,
      LAYER.nodesHalo,
      LAYER.activeMarker,
      LAYER.activeMarkerHalo,
      LAYER.observedMarker,
      LAYER.observedHalo,
    ].forEach((id) => {
      map.on('mouseenter', id, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', id, () => {
        map.getCanvas().style.cursor = '';
      });
    });

    // Apply current progress to map
    applyProgressToMap(progressRef.current);
  }, [applyProgressToMap, showPopup]);

  // 7. Initialize MapLibre ONCE
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    try {
      const initialStyle = theme === 'dark' ? DARK_STYLE : LIGHT_STYLE;
      const map = new MapLibreMap({
        container: containerRef.current,
        style: initialStyle,
        center: [0, 20],
        zoom: 2,
        attributionControl: false,
      });
      mapRef.current = map;
      console.log("[DRIFT MAP] MapLibre initialized");

      map.on("error", (event) => {
        console.error("[DRIFT MAP] MapLibre error:", event);
        setMapError("Drift map could not be loaded.");
      });

      map.addControl(new NavigationControl({ showCompass: true }), 'top-right');
      map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-right');
      map.addControl(new FullscreenControl(), 'top-right');
      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

      map.once('load', () => {
        mapLoadedRef.current = true;
        setupDriftLayers(map);

        // Fit bounds to actual data if available
        const bounds = computeDriftBounds(contract1Ref.current, corridorRef.current);
        if (bounds) {
          console.log("[DRIFT PLAYBACK] Fitting bounds to actual backend coordinates");
          map.fitBounds(bounds, { padding: 90, maxZoom: 12, duration: 800 });
        }
      });

      map.on('styledata', () => {
        if (mapLoadedRef.current) {
          setupDriftLayers(map);
        }
      });
    } catch (err) {
      console.error("[DRIFT MAP] MapLibre initialization exception:", err);
      setMapError("Drift map could not be loaded.");
    }

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        mapLoadedRef.current = false;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 8. Reactive Updates when Theme changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    const targetStyle = theme === 'dark' ? DARK_STYLE : LIGHT_STYLE;
    map.setStyle(targetStyle);
  }, [theme]);

  // 9. Reactive Updates when Data changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;

    setupDriftLayers(map);

    if (corridor) {
      const bounds = computeDriftBounds(contract1, corridor);
      if (bounds) {
        console.log("[DRIFT PLAYBACK] Fitting bounds to actual backend coordinates");
        map.fitBounds(bounds, { padding: 90, maxZoom: 12, duration: 800 });
      }
    }
  }, [contract1, corridor, setupDriftLayers]);

  // 10. Animation Loop using requestAnimationFrame
  useEffect(() => {
    if (!isPlaying) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      return;
    }

    const maxProgress = Math.max(playbackNodes.length - 1, 0);
    // Base duration: 1400ms per node segment at 1x speed
    const msPerNode = 1400 / playbackSpeedRef.current;

    const tick = (timestamp: number) => {
      if (!lastTimeRef.current) {
        lastTimeRef.current = timestamp;
      }
      const delta = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;

      const deltaProgress = delta / msPerNode;
      const oldFloor = Math.floor(progressRef.current);
      const nextProgress = Math.min(progressRef.current + deltaProgress, maxProgress);

      progressRef.current = nextProgress;
      setProgress(nextProgress);
      applyProgressToMap(nextProgress);

      const newFloor = Math.floor(nextProgress);
      if (newFloor !== oldFloor && newFloor < playbackNodes.length) {
        const fromNode = playbackNodes[oldFloor];
        const toNode = playbackNodes[newFloor];
        if (fromNode && toNode) {
          console.log("[DRIFT PLAYBACK] Moving:", { from: fromNode, to: toNode });
        }
        if (newFloor !== lastReportedNodeIndexRef.current) {
          lastReportedNodeIndexRef.current = newFloor;
          const node = playbackNodes[newFloor];
          console.log("[DRIFT PLAYBACK] Current node:", {
            index: node.index,
            lat: node.lat,
            lon: node.lon,
            hours_ago: node.hours_ago,
            radius_km: node.radius_km,
          });
        }
      }

      if (nextProgress >= maxProgress) {
        setIsPlaying(false);
        isPlayingRef.current = false;
        console.log("[DRIFT PLAYBACK] Completed");
        animFrameRef.current = null;
        return;
      }

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [isPlaying, playbackNodes, applyProgressToMap]);

  // 11. Playback Control Handlers
  const handlePlay = () => {
    if (playbackNodes.length < 2) return;
    console.log("[DRIFT PLAYBACK] Started");

    // If currently at or near end, restart from beginning
    if (progressRef.current >= playbackNodes.length - 1 - 0.01) {
      progressRef.current = 0;
      setProgress(0);
      lastReportedNodeIndexRef.current = 0;
      applyProgressToMap(0);
      const first = playbackNodes[0];
      console.log("[DRIFT PLAYBACK] Current node:", {
        index: first.index,
        lat: first.lat,
        lon: first.lon,
        hours_ago: first.hours_ago,
        radius_km: first.radius_km,
      });
    }

    lastTimeRef.current = null;
    setIsPlaying(true);
    isPlayingRef.current = true;
  };

  const handlePause = () => {
    setIsPlaying(false);
    isPlayingRef.current = false;
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    const currIdx = Math.min(Math.floor(progressRef.current), playbackNodes.length - 1);
    console.log("[DRIFT PLAYBACK] Paused at index:", currIdx);
    console.log("[DRIFT PLAYBACK] Paused");
  };

  const handleReset = () => {
    setIsPlaying(false);
    isPlayingRef.current = false;
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    progressRef.current = 0;
    setProgress(0);
    lastReportedNodeIndexRef.current = -1;
    console.log("[DRIFT PLAYBACK] Reset");
    applyProgressToMap(0);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    progressRef.current = val;
    setProgress(val);
    applyProgressToMap(val);

    const nodeIdx = Math.min(Math.floor(val), playbackNodes.length - 1);
    if (
      nodeIdx >= 0 &&
      nodeIdx < playbackNodes.length &&
      nodeIdx !== lastReportedNodeIndexRef.current
    ) {
      lastReportedNodeIndexRef.current = nodeIdx;
      const node = playbackNodes[nodeIdx];
      console.log("[DRIFT PLAYBACK] Current node:", {
        index: node.index,
        lat: node.lat,
        lon: node.lon,
        hours_ago: node.hours_ago,
        radius_km: node.radius_km,
      });
    }
  };

  // Interpolated values for display
  const {
    currentLon,
    currentLat,
    currentHoursAgo,
    currentRadiusKm,
  } = getInterpolatedState(progress);

  const isDark = theme === 'dark';
  const oldestNode = playbackNodes.length > 0 ? playbackNodes[0] : null;
  const maxProgress = Math.max(playbackNodes.length - 1, 1);

  // If no Contract 1 detection exists at all
  if (!contract1) {
    return (
      <div className="flex-1 relative w-full h-[calc(100vh-72px)] bg-[#090e17] flex items-center justify-center select-none">
        <div
          className="flex flex-col items-center gap-4 p-8 max-w-md text-center shadow-2xl rounded-lg"
          style={{
            background: isDark ? '#0f172a' : '#ffffff',
            border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
            color: isDark ? '#f8fafc' : '#0f172a',
          }}
        >
          <UploadCloud className="w-10 h-10 text-amber-500 animate-pulse" />
          <h2 className="text-base font-bold">No Detection Loaded</h2>
          <p className="text-xs text-slate-400">
            Run scene ingestion and detection first. The backward hindcast drift analysis requires Contract 1 slick coordinates as the initial observation.
          </p>
          <button
            onClick={onGoToIngest}
            className="px-6 py-2.5 text-xs font-semibold uppercase tracking-wider rounded transition-all bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-md"
          >
            Go to Ingestion
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative w-full h-[calc(100vh-72px)] overflow-hidden select-none">
      {/* ── MAPLIBRE GEOGRAPHIC MAP CONTAINER (FULLSCREEN) ── */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />

      {/* ── EXPLICIT MAP ERROR STATE (NO STATIC FALLBACK) ── */}
      {mapError && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/90">
          <div className="flex flex-col items-center gap-3 p-6 max-w-md text-center bg-rose-950/80 border border-rose-500 rounded-lg text-rose-200">
            <AlertTriangle className="w-8 h-8 text-rose-400" />
            <span className="text-sm font-bold">{mapError}</span>
            <span className="text-xs text-rose-300">
              Check console logs for details. Verify network connectivity for MapLibre basemap tiles.
            </span>
            <button
              onClick={() => {
                setMapError(null);
                window.location.reload();
              }}
              className="mt-2 px-4 py-1.5 text-xs font-semibold rounded bg-rose-700 hover:bg-rose-600 text-white cursor-pointer"
            >
              Reload Page
            </button>
          </div>
        </div>
      )}

      {/* ── FLOATING HEADER TITLE ── */}
      <div
        className="absolute top-4 left-4 z-20 flex items-center gap-3 px-4 py-2.5 rounded-md shadow-xl backdrop-blur-md"
        style={{
          background: isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.9)',
          border: `1px solid ${isDark ? 'rgba(51, 65, 85, 0.8)' : 'rgba(203, 213, 225, 0.8)'}`,
          color: isDark ? '#f8fafc' : '#0f172a',
        }}
      >
        <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
        <div>
          <h1 className="text-xs font-bold tracking-wider uppercase flex items-center gap-2">
            Drift Analysis
            <span className="text-[10px] font-normal px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              Live MapLibre Playback
            </span>
          </h1>
          <p className="text-[10px] text-slate-400">
            Sequential backward-hindcast trajectory & temporal progression
          </p>
        </div>
      </div>

      {/* ── FLOATING MAP LEGEND ── */}
      <div
        id="drift-legend"
        className="absolute bottom-6 left-4 z-20 flex flex-col gap-2 p-3.5 rounded-md shadow-xl backdrop-blur-md min-w-[200px]"
        style={{
          background: isDark ? 'rgba(15, 23, 42, 0.88)' : 'rgba(255, 255, 255, 0.92)',
          border: `1px solid ${isDark ? 'rgba(51, 65, 85, 0.8)' : 'rgba(203, 213, 225, 0.8)'}`,
          color: isDark ? '#f8fafc' : '#0f172a',
        }}
      >
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-700/50 pb-1.5 flex items-center justify-between">
          <span>Drift Analysis</span>
          <Layers className="w-3.5 h-3.5 text-slate-400" />
        </div>

        <div className="flex flex-col gap-2 text-xs font-mono mt-1">
          <div className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full bg-cyan-400 border-2 border-white shadow-sm shrink-0 animate-pulse" />
            <span className="text-slate-300">Current Position</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full bg-emerald-500 border-2 border-white shadow-sm shrink-0" />
            <span className="text-slate-300">Observed Spill</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full bg-amber-500 border-2 border-white shadow-sm shrink-0" />
            <span className="text-slate-300">Historical Drift Node</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="w-5 h-1 rounded bg-cyan-400 shadow-sm shrink-0" />
            <span className="text-slate-300">Traversed Trail</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="w-5 h-0.5 border-b border-dashed border-cyan-500/60 shrink-0" />
            <span className="text-slate-300">Corridor Route</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="w-3.5 h-3.5 rounded-full border-1.5 border-dashed border-amber-400 bg-amber-500/20 shrink-0" />
            <span className="text-slate-300">Uncertainty Radius</span>
          </div>
        </div>
      </div>

      {/* ── FLOATING PLAYBACK CONTROLS PANEL (BOTTOM CENTER) ── */}
      {playbackNodes.length > 0 && (
        <div
          id="drift-playback-panel"
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex flex-col gap-2.5 p-4 rounded-xl shadow-2xl backdrop-blur-xl min-w-[360px] max-w-lg w-[90%] md:w-[460px]"
          style={{
            background: isDark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.95)',
            border: `1px solid ${isDark ? 'rgba(51, 65, 85, 0.8)' : 'rgba(203, 213, 225, 0.8)'}`,
            borderTop: '3px solid #06b6d4',
            color: isDark ? '#f8fafc' : '#0f172a',
          }}
        >
          {/* Header & Controls Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-cyan-400 font-mono">
                Drift Playback
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                {currentHoursAgo <= 0.05
                  ? 'Observed'
                  : `T-${currentHoursAgo.toFixed(1)}h`}
              </span>
            </div>

            {/* Play, Pause, Reset Buttons */}
            <div className="flex items-center gap-1.5">
              {!isPlaying ? (
                <button
                  id="playback-play-btn"
                  onClick={handlePlay}
                  className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                  title="Play drift sequence"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Play</span>
                </button>
              ) : (
                <button
                  id="playback-pause-btn"
                  onClick={handlePause}
                  className="px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                  title="Pause drift sequence"
                >
                  <Pause className="w-3.5 h-3.5 fill-current" />
                  <span>Pause</span>
                </button>
              )}

              <button
                id="playback-reset-btn"
                onClick={handleReset}
                className="p-1.5 rounded-md bg-slate-700/60 hover:bg-slate-700 text-slate-200 text-xs flex items-center justify-center transition-all cursor-pointer"
                title="Reset to oldest position"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Speed Selector */}
            <div className="flex items-center gap-1 bg-slate-800/80 p-0.5 rounded border border-slate-700">
              {[0.5, 1, 2, 4].map((spd) => (
                <button
                  key={spd}
                  onClick={() => setPlaybackSpeed(spd)}
                  className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded transition-all cursor-pointer ${
                    playbackSpeed === spd
                      ? 'bg-cyan-500 text-slate-950'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {spd}×
                </button>
              ))}
            </div>
          </div>

          {/* Timeline Slider with Actual Node Ticks */}
          <div className="relative flex flex-col gap-1 mt-1">
            <div className="relative w-full h-5 flex items-center">
              <input
                id="drift-playback-slider"
                type="range"
                min="0"
                max={maxProgress}
                step="0.01"
                value={progress}
                onChange={handleSliderChange}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400 z-10"
              />
            </div>

            {/* Timeline Labels */}
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
              <span>{oldestNode ? `T-${oldestNode.hours_ago}h` : 'Start'}</span>
              <span className="text-cyan-400 font-semibold">
                {currentHoursAgo <= 0.05
                  ? 'Current: Observed'
                  : `Current: T-${currentHoursAgo.toFixed(1)}h`}
              </span>
              <span>Observed (T-0h)</span>
            </div>
          </div>
        </div>
      )}

      {/* ── FLOATING DRIFT DETAILS PANEL (TOP RIGHT) ── */}
      <div
        id="corridor-info-panel"
        className="absolute top-4 right-14 w-84 z-20 flex flex-col rounded-md shadow-2xl backdrop-blur-md overflow-hidden"
        style={{
          background: isDark ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.94)',
          border: `1px solid ${isDark ? 'rgba(51, 65, 85, 0.8)' : 'rgba(203, 213, 225, 0.8)'}`,
          borderTop: '3px solid #06b6d4',
          color: isDark ? '#f8fafc' : '#0f172a',
        }}
      >
        <div
          className="px-4 py-3 flex items-center justify-between border-b"
          style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}
        >
          <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 text-cyan-400">
            <Compass className="w-3.5 h-3.5" />
            Drift Details
          </span>
          <span
            className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
              corridor?.field_source === 'cmems_era5'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
            }`}
          >
            {corridor ? (corridor.field_source === 'cmems_era5' ? 'CMEMS + ERA5' : 'Analytic Field') : 'No Data'}
          </span>
        </div>

        <div className="p-4 flex flex-col gap-2.5">
          {!corridor ? (
            <div className="text-xs text-amber-400 flex flex-col items-center gap-2 p-4 bg-amber-500/10 border border-amber-500/30 rounded text-center">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <div className="font-bold">No Drift Data Available</div>
              <div className="text-[11px] text-slate-300">Run detection and drift analysis first.</div>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center text-xs py-1 border-b border-slate-700/30">
                <span className="text-slate-400">Field Source:</span>
                <span className="font-mono font-medium text-slate-200">
                  {corridor.field_source || 'analytic'}
                </span>
              </div>

              <div className="flex justify-between items-center text-xs py-1 border-b border-slate-700/30">
                <span className="text-slate-400">Observed At:</span>
                <span className="font-mono font-medium text-slate-200">
                  {corridor.observed_at ? new Date(corridor.observed_at).toISOString().slice(0, 19).replace('T', ' ') + 'Z' : '—'}
                </span>
              </div>

              <div className="flex justify-between items-center text-xs py-1 border-b border-slate-700/30">
                <span className="text-slate-400">Corridor Nodes:</span>
                <span className="font-mono font-bold text-cyan-400">
                  {playbackNodes.length} actual points
                </span>
              </div>

              {/* Current Playback Coordinate HUD */}
              <div className="p-2.5 rounded bg-slate-800/60 border border-slate-700/60 flex flex-col gap-1.5 mt-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 flex items-center justify-between">
                  <span>Current Playback Position</span>
                  <span className="font-mono text-slate-300">
                    {currentHoursAgo <= 0.05
                      ? 'Observed'
                      : `T-${currentHoursAgo.toFixed(1)}h`}
                  </span>
                </div>
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-slate-400">Latitude:</span>
                  <span className="text-slate-200">{currentLat.toFixed(6)}°</span>
                </div>
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-slate-400">Longitude:</span>
                  <span className="text-slate-200">{currentLon.toFixed(6)}°</span>
                </div>
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-slate-400">Radius:</span>
                  <span className="text-amber-400 font-semibold">{currentRadiusKm.toFixed(2)} km</span>
                </div>
              </div>

              {/* Notice */}
              <div className="p-2 bg-slate-800/40 border border-slate-700/50 rounded flex items-start gap-2 mt-1">
                <Info className="w-3.5 h-3.5 text-cyan-400 mt-0.5 shrink-0" />
                <span className="text-[10px] text-slate-400 leading-snug">
                  Future drift prediction unavailable from current backend output. Playback animates historical backward-hindcast movement toward the observed slick.
                </span>
              </div>
            </>
          )}

          {/* Action buttons */}
          <div className="flex flex-col gap-2 mt-2">
            <button
              id="re-run-drift-btn"
              onClick={() => contract1 && fetchCorridor(contract1)}
              disabled={isLoading || !contract1}
              className="w-full h-8.5 flex items-center justify-center gap-2 text-xs font-semibold rounded transition-all cursor-pointer disabled:opacity-50 border border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              {isLoading ? 'Running Hindcast...' : 'Re-Run Drift Hindcast'}
            </button>

            <button
              id="match-suspects-btn"
              onClick={onProceedToSuspects}
              disabled={!corridor}
              className="w-full h-9 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wider rounded transition-all cursor-pointer disabled:opacity-50 bg-emerald-600 hover:bg-emerald-500 text-white shadow-md"
            >
              <span>Match Suspect Vessels</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── LOADING OVERLAY ── */}
      {isLoading && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm">
          <div
            className="flex items-center gap-3 px-6 py-4 rounded-lg shadow-2xl border"
            style={{
              background: isDark ? '#0f172a' : '#ffffff',
              borderColor: isDark ? '#334155' : '#cbd5e1',
              color: isDark ? '#f8fafc' : '#0f172a',
            }}
          >
            <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
            <span className="text-xs font-semibold">Running backward hindcast simulation...</span>
          </div>
        </div>
      )}

      {/* ── ERROR TOAST ── */}
      {error && !isLoading && (
        <div className="absolute bottom-6 right-6 z-40 flex items-center gap-3 px-4 py-3 rounded-lg shadow-2xl bg-rose-950/90 border border-rose-500 text-rose-200 text-xs">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
          <button
            onClick={() => contract1 && fetchCorridor(contract1)}
            className="ml-2 px-2.5 py-1 text-[10px] font-bold uppercase rounded bg-rose-700 hover:bg-rose-600 text-white cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
};
