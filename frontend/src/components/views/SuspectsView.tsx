import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as maplibregl from 'maplibre-gl';
import {
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
  FullscreenControl,
  Popup,
  Marker,
  LngLatBounds,
  setWorkerUrl,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { CorridorResponse, Suspect, SceneMetadata } from '../../types';
import { DetectionResponse, rankSuspects } from '../../api/api';
import {
  Ship,
  X,
  ArrowRight,
  ShieldAlert,
  Zap,
  AlertTriangle,
  Loader2,
  Activity,
  Crosshair,
  Maximize2,
  FileText,
} from 'lucide-react';

// Configure official worker URL for Vite
try {
  setWorkerUrl(workerUrl);
} catch (err) {
  console.warn('MapLibre workerUrl setup warning:', err);
}

// Basemap styles
const LIGHT_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

interface SuspectsViewProps {
  currentScene: SceneMetadata;
  onProceedToExport: () => void;
  searchQuery: string;
  contract1: DetectionResponse | null;
  corridor: CorridorResponse | null;
  onTopSuspectReady: (suspect: Suspect | null) => void;
  onGoToIngest: () => void;
  theme?: 'light' | 'dark';
}

const FACTOR_LABELS: { key: keyof Suspect['factors']; label: string }[] = [
  { key: 'heading_alignment', label: 'Heading Alignment' },
  { key: 'proximity', label: 'Spatial Proximity' },
  { key: 'temporal', label: 'Temporal Fit' },
  { key: 'speed_anomaly', label: 'Speed Anomaly' },
  { key: 'transponder_gap', label: 'Transponder Gap' },
];

/**
 * Coordinate extraction and validation strictly from backend response.
 * Never invents coordinates and never derives them from centroid or corridor.
 */
export function extractSuspectCoordinates(suspect: any): { lat: number; lon: number } | null {
  if (!suspect || typeof suspect !== 'object') return null;

  let rawLat = suspect.lat ?? suspect.latitude ?? suspect.position?.lat ?? suspect.location?.lat ?? suspect.coordinates?.[1];
  let rawLon = suspect.lon ?? suspect.longitude ?? suspect.position?.lon ?? suspect.location?.lon ?? suspect.coordinates?.[0];

  if (typeof rawLat === 'string') rawLat = parseFloat(rawLat);
  if (typeof rawLon === 'string') rawLon = parseFloat(rawLon);

  const validLat = typeof rawLat === 'number' && Number.isFinite(rawLat) && rawLat >= -90 && rawLat <= 90;
  const validLon = typeof rawLon === 'number' && Number.isFinite(rawLon) && rawLon >= -180 && rawLon <= 180;

  if (validLat && validLon) {
    return { lat: rawLat, lon: rawLon };
  }
  return null;
}

/**
 * Format geographic coordinates: Latitude first, Longitude second.
 */
export function formatCoordinates(lat: number, lon: number): { latStr: string; lonStr: string } {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  const latStr = `${Math.abs(lat).toFixed(6)}° ${latDir}`;
  const lonStr = `${Math.abs(lon).toFixed(6)}° ${lonDir}`;
  return { latStr, lonStr };
}

export const SuspectsView: React.FC<SuspectsViewProps> = ({
  currentScene,
  onProceedToExport,
  searchQuery,
  contract1,
  corridor,
  onTopSuspectReady,
  onGoToIngest,
  theme = 'light',
}) => {
  const [suspects, setSuspects] = useState<Suspect[]>([]);
  const [aisSource, setAisSource] = useState<string | null>(null);
  const [selectedSuspect, setSelectedSuspect] = useState<Suspect | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Map state
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<{ [mmsi: number]: Marker }>({});
  const activePopupRef = useRef<Popup | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapLoaded, setMapLoaded] = useState<boolean>(false);

  // Live coordinate HUD & Inspector
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [inspectorPin, setInspectorPin] = useState<{ lat: number; lon: number } | null>(null);
  const inspectorMarkerRef = useRef<Marker | null>(null);

  // Layer visibility toggles
  const [showSpillLayer, setShowSpillLayer] = useState(true);
  const [showCorridorLayer, setShowCorridorLayer] = useState(true);
  const [showSuspectMarkers, setShowSuspectMarkers] = useState(true);

  // Fetch suspects from backend
  const fetchSuspects = async (c1: DetectionResponse, c2: CorridorResponse) => {
    setIsLoading(true);
    setError(null);
    try {
      console.log('[SUSPECT MAP] Contract 1:', c1);
      console.log('[SUSPECT MAP] Contract 2:', c2);

      const result = await rankSuspects(c2, c1.orientation_deg);
      const fetchedSuspects = result.suspects || [];

      // Required console logs
      console.log('[SUSPECT MAP] RAW SUSPECT RESPONSE:', result);
      console.log('[SUSPECT MAP] FIRST SUSPECT:', fetchedSuspects[0]);
      console.log('[SUSPECT MAP] Suspects received:', fetchedSuspects);
      console.log('[SUSPECT MAP] AIS source:', result.ais_source);

      fetchedSuspects.forEach((suspect) => {
        const coords = extractSuspectCoordinates(suspect);
        if (coords) {
          console.log('[SUSPECT MAP] Suspect:', {
            name: suspect.name,
            lat: coords.lat,
            lon: coords.lon,
            score: suspect.score,
          });
        } else {
          console.warn('[SUSPECT MAP] Invalid/missing suspect coordinates:', suspect);
        }
      });

      setSuspects(fetchedSuspects);
      setAisSource(result.ais_source);

      const top = fetchedSuspects[0] ?? null;
      setSelectedSuspect(top);
      onTopSuspectReady(top);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to reach backend attribution service.';
      setError(msg);
      console.error('[SUSPECT MAP] Attribution fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (contract1 && corridor) {
      void fetchSuspects(contract1, corridor);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract1, corridor]);

  // Filter suspects by search query
  const filteredSuspects = useMemo(() => {
    if (!searchQuery) return suspects;
    const q = searchQuery.toLowerCase();
    return suspects.filter(
      (v) => v.name.toLowerCase().includes(q) || String(v.mmsi).includes(q)
    );
  }, [suspects, searchQuery]);

  // Valid suspects with real coordinates
  const validSuspects = useMemo(() => {
    const valid = suspects.filter((s) => extractSuspectCoordinates(s) !== null);
    console.log('[SUSPECT MAP] Valid suspect coordinates:', valid);
    return valid;
  }, [suspects]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Map Initialization
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current) return;

    setMapError(null);
    setMapLoaded(false);
    console.log('[SUSPECT MAP] MapLibre initialization started');

    const styleUrl = theme === 'dark' ? DARK_STYLE : LIGHT_STYLE;

    // Determine initial center from Contract 1 or Corridor
    let initialCenter: [number, number] = [0, 0];
    if (contract1 && Array.isArray(contract1.centroid) && contract1.centroid.length === 2) {
      initialCenter = [contract1.centroid[0], contract1.centroid[1]];
    } else if (corridor && corridor.corridor.length > 0) {
      initialCenter = [corridor.corridor[0].lon, corridor.corridor[0].lat];
    }

    let map: MapLibreMap;
    try {
      map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: styleUrl,
        center: initialCenter,
        zoom: 9,
        attributionControl: false,
      });
      console.log('[SUSPECT MAP] MapLibre initialized');
    } catch (err) {
      console.error('[SUSPECT MAP] MapLibre error:', err);
      console.error('[SUSPECT MAP] MapLibre failed:', err);
      setMapError(err instanceof Error ? err.message : 'Live geographic map unavailable.');
      return;
    }

    map.addControl(new NavigationControl({ showCompass: true, visualizePitch: true }), 'top-left');
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');
    map.addControl(new FullscreenControl(), 'top-left');

    map.on('load', () => {
      console.log('[SUSPECT MAP] Map loaded');
      mapRef.current = map;
      setMapLoaded(true);
      map.resize();
    });

    map.on('error', (e) => {
      console.error('[SUSPECT MAP] MapLibre error:', e);
    });

    // Cursor coordinates tracking
    map.on('mousemove', (e) => {
      setCursorCoords({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    });

    map.on('mouseleave', () => {
      setCursorCoords(null);
    });

    // Coordinate inspector on click
    map.on('click', (e) => {
      const features = map.queryRenderedFeatures(e.point);
      if (
        features.length > 0 &&
        features.some((f) => f.layer?.id?.startsWith('suspect-') || f.layer?.id?.startsWith('spill-'))
      ) {
        return;
      }
      setInspectorPin({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    });

    mapRef.current = map;

    // ResizeObserver ensures map resizes whenever container dimensions change
    const resizeObserver = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    });
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    // Safety timeout resize
    const t1 = setTimeout(() => map.resize(), 150);
    const t2 = setTimeout(() => map.resize(), 600);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      resizeObserver.disconnect();
      Object.values(markersRef.current).forEach((m) => m.remove());
      markersRef.current = {};
      if (inspectorMarkerRef.current) {
        inspectorMarkerRef.current.remove();
        inspectorMarkerRef.current = null;
      }
      if (activePopupRef.current) {
        activePopupRef.current.remove();
        activePopupRef.current = null;
      }
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  // Update Inspector Pin marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (!inspectorPin) {
      if (inspectorMarkerRef.current) {
        inspectorMarkerRef.current.remove();
        inspectorMarkerRef.current = null;
      }
      return;
    }

    if (!inspectorMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'inspector-pin-marker';
      el.innerHTML = `
        <div style="
          background: #3b82f6;
          color: white;
          border: 2px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.4);
          width: 22px;
          height: 22px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        ">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="16"></line>
            <line x1="8" y1="12" x2="16" y2="12"></line>
          </svg>
        </div>
      `;
      inspectorMarkerRef.current = new Marker({ element: el })
        .setLngLat([inspectorPin.lon, inspectorPin.lat])
        .addTo(map);
    } else {
      inspectorMarkerRef.current.setLngLat([inspectorPin.lon, inspectorPin.lat]);
    }
  }, [inspectorPin, mapLoaded]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Fit Map Bounds to Geographic Data
  // ─────────────────────────────────────────────────────────────────────────────
  const fitMapBounds = useCallback(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const bounds = new LngLatBounds();
    let hasCoords = false;

    // 1. Valid Suspect coordinates
    validSuspects.forEach((suspect) => {
      const c = extractSuspectCoordinates(suspect);
      if (c) {
        bounds.extend([c.lon, c.lat]);
        hasCoords = true;
      }
    });

    // 2. Detection Centroid
    if (contract1 && Array.isArray(contract1.centroid) && contract1.centroid.length === 2) {
      bounds.extend([contract1.centroid[0], contract1.centroid[1]]);
      hasCoords = true;
    }

    // 3. Corridor coordinates
    if (corridor && Array.isArray(corridor.corridor)) {
      corridor.corridor.forEach((node) => {
        if (typeof node.lon === 'number' && typeof node.lat === 'number') {
          bounds.extend([node.lon, node.lat]);
          hasCoords = true;
        }
      });
    }

    if (hasCoords && !bounds.isEmpty()) {
      console.log('[SUSPECT MAP] Fitting map to geographic data');
      map.fitBounds(bounds, {
        padding: { top: 70, bottom: 70, left: 70, right: 70 },
        maxZoom: 13,
        duration: 1000,
      });
    }
  }, [validSuspects, contract1, corridor, mapLoaded]);

  // ─────────────────────────────────────────────────────────────────────────────
  // GeoJSON Context Layers (Drift Corridor & Spill Centroid / Polygon)
  // ─────────────────────────────────────────────────────────────────────────────
  const renderGeoLayers = useCallback(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !map.isStyleLoaded()) return;

    // 1. Spill Polygon & Centroid Layer
    if (contract1) {
      const centroidLon = contract1.centroid[0];
      const centroidLat = contract1.centroid[1];

      // Clean up previous layers
      if (map.getLayer('spill-centroid-glow')) map.removeLayer('spill-centroid-glow');
      if (map.getLayer('spill-centroid-point')) map.removeLayer('spill-centroid-point');
      if (map.getLayer('spill-polygon-line')) map.removeLayer('spill-polygon-line');
      if (map.getLayer('spill-polygon-fill')) map.removeLayer('spill-polygon-fill');
      if (map.getSource('spill-data')) map.removeSource('spill-data');

      const features: any[] = [
        {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [centroidLon, centroidLat],
          },
          properties: {
            type: 'centroid',
            title: 'DETECTED SPILL',
            lat: centroidLat,
            lon: centroidLon,
          },
        },
      ];

      if (Array.isArray(contract1.polygon) && contract1.polygon.length >= 3) {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [contract1.polygon.map((pt) => [pt[0], pt[1]])],
          },
          properties: {
            type: 'slick_polygon',
          },
        });
      }

      map.addSource('spill-data', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features,
        },
      });

      map.addLayer({
        id: 'spill-polygon-fill',
        type: 'fill',
        source: 'spill-data',
        filter: ['==', ['get', 'type'], 'slick_polygon'],
        paint: {
          'fill-color': '#ef4444',
          'fill-opacity': 0.25,
        },
        layout: {
          visibility: showSpillLayer ? 'visible' : 'none',
        },
      });

      map.addLayer({
        id: 'spill-polygon-line',
        type: 'line',
        source: 'spill-data',
        filter: ['==', ['get', 'type'], 'slick_polygon'],
        paint: {
          'line-color': '#dc2626',
          'line-width': 2,
          'line-dasharray': [2, 1],
        },
        layout: {
          visibility: showSpillLayer ? 'visible' : 'none',
        },
      });

      map.addLayer({
        id: 'spill-centroid-glow',
        type: 'circle',
        source: 'spill-data',
        filter: ['==', ['get', 'type'], 'centroid'],
        paint: {
          'circle-radius': 13,
          'circle-color': '#ef4444',
          'circle-opacity': 0.35,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#b91c1c',
        },
        layout: {
          visibility: showSpillLayer ? 'visible' : 'none',
        },
      });

      map.addLayer({
        id: 'spill-centroid-point',
        type: 'circle',
        source: 'spill-data',
        filter: ['==', ['get', 'type'], 'centroid'],
        paint: {
          'circle-radius': 6,
          'circle-color': '#dc2626',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
        layout: {
          visibility: showSpillLayer ? 'visible' : 'none',
        },
      });

      map.on('click', 'spill-centroid-point', (e) => {
        if (!e.features || !e.features[0]) return;
        const coords = (e.features[0].geometry as any).coordinates.slice();
        const formatted = formatCoordinates(centroidLat, centroidLon);

        new Popup({ offset: 12, closeButton: true })
          .setLngLat(coords)
          .setHTML(`
            <div style="padding: 6px 8px; font-family: sans-serif; font-size: 12px; color: #1e293b;">
              <div style="font-weight: 700; color: #dc2626; margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
                <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#dc2626;"></span>
                DETECTED SPILL
              </div>
              <div style="font-family: monospace; font-size: 11px; margin-top: 2px;">
                <b>Latitude:</b> ${formatted.latStr}<br/>
                <b>Longitude:</b> ${formatted.lonStr}
              </div>
              <div style="font-size: 10px; color: #64748b; margin-top: 4px;">
                Area: ${contract1.area_km2.toFixed(2)} km²
              </div>
            </div>
          `)
          .addTo(map);
      });
    }

    // 2. Drift Corridor Layer
    if (corridor && corridor.corridor.length > 0) {
      if (map.getLayer('corridor-line')) map.removeLayer('corridor-line');
      if (map.getLayer('corridor-nodes')) map.removeLayer('corridor-nodes');
      if (map.getSource('corridor-data')) map.removeSource('corridor-data');

      const pathCoords = corridor.corridor.map((n) => [n.lon, n.lat]);
      if (contract1) {
        pathCoords.unshift([contract1.centroid[0], contract1.centroid[1]]);
      }

      const nodeFeatures = corridor.corridor.map((n) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [n.lon, n.lat],
        },
        properties: {
          hours_ago: n.hours_ago,
          radius_km: n.radius_km,
        },
      }));

      map.addSource('corridor-data', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: pathCoords,
              },
              properties: {},
            },
            ...nodeFeatures,
          ],
        },
      });

      map.addLayer({
        id: 'corridor-line',
        type: 'line',
        source: 'corridor-data',
        filter: ['==', '$type', 'LineString'],
        paint: {
          'line-color': '#0284c7',
          'line-width': 2.5,
          'line-dasharray': [3, 2],
        },
        layout: {
          visibility: showCorridorLayer ? 'visible' : 'none',
        },
      });

      map.addLayer({
        id: 'corridor-nodes',
        type: 'circle',
        source: 'corridor-data',
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': 4.5,
          'circle-color': '#0284c7',
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
        },
        layout: {
          visibility: showCorridorLayer ? 'visible' : 'none',
        },
      });
    }
  }, [contract1, corridor, mapLoaded, showSpillLayer, showCorridorLayer]);

  useEffect(() => {
    if (mapLoaded) {
      renderGeoLayers();
      fitMapBounds();
    }
  }, [mapLoaded, renderGeoLayers, fitMapBounds]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Render Suspect Markers on MapLibre
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // Clear old markers
    Object.values(markersRef.current).forEach((m) => m.remove());
    markersRef.current = {};

    if (!showSuspectMarkers) return;

    console.log('[SUSPECT MAP] Adding suspect markers');
    console.log('[SUSPECT MAP] Suspect markers added:', validSuspects.length);

    validSuspects.forEach((suspect, idx) => {
      const coords = extractSuspectCoordinates(suspect);
      if (!coords) return;

      const rank = suspect.rank || idx + 1;
      const isSelected = selectedSuspect?.mmsi === suspect.mmsi;

      // Marker element
      const el = document.createElement('div');
      el.id = `suspect-marker-${suspect.mmsi}`;
      el.className = 'suspect-map-marker';
      el.style.cursor = 'pointer';
      el.style.userSelect = 'none';

      const markerBg = isSelected
        ? '#10b981'
        : rank === 1
        ? '#059669'
        : rank <= 3
        ? '#0284c7'
        : '#475569';

      const scale = isSelected ? 'scale(1.25)' : 'scale(1)';
      const zIndex = isSelected ? '40' : String(20 - rank);

      el.innerHTML = `
        <div style="
          transform: ${scale};
          transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s ease;
          background: ${markerBg};
          color: #ffffff;
          padding: 3px 7px;
          border-radius: 9999px;
          border: 2px solid #ffffff;
          box-shadow: 0 3px 8px rgba(0,0,0,0.35);
          display: flex;
          align-items: center;
          gap: 4px;
          font-family: 'IBM Plex Mono', monospace, sans-serif;
          font-size: 11px;
          font-weight: 700;
          z-index: ${zIndex};
        ">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 .6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>
            <path d="M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.94 5.34 2.81 7.76"/>
            <path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/>
            <path d="M12 10v4"/>
            <path d="M12 2v3"/>
          </svg>
          <span>#${rank}</span>
        </div>
      `;

      const formatted = formatCoordinates(coords.lat, coords.lon);
      const matchScorePct = Math.round(suspect.score * 100);

      // MapLibre uses [longitude, latitude]
      const marker = new Marker({ element: el, anchor: 'bottom' })
        .setLngLat([coords.lon, coords.lat])
        .addTo(map);

      // Marker Click Handler
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        console.log('[SUSPECT MAP] Selected suspect:', suspect);
        setSelectedSuspect(suspect);

        if (activePopupRef.current) {
          activePopupRef.current.remove();
        }

        const popup = new Popup({ offset: 25, closeButton: true })
          .setLngLat([coords.lon, coords.lat])
          .setHTML(`
            <div style="padding: 8px 10px; font-family: inherit; font-size: 12px; color: #0f172a; min-width: 210px;">
              <div style="font-weight: 800; font-size: 13px; color: #1e3a8a; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center;">
                <span>SUSPECT #${rank}</span>
                <span style="background: #10b981; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px;">${matchScorePct}% Match</span>
              </div>
              <div style="font-size: 12px; font-weight: 700; margin-bottom: 4px; color: #0f172a;">${suspect.name}</div>
              <div style="font-family: monospace; font-size: 11px; line-height: 1.5; color: #334155; border-top: 1px solid #e2e8f0; padding-top: 4px;">
                <div><b>MMSI:</b> ${suspect.mmsi}</div>
                <div><b>Latitude:</b> ${formatted.latStr}</div>
                <div><b>Longitude:</b> ${formatted.lonStr}</div>
                <div><b>Corridor Distance:</b> ${suspect.distance_km.toFixed(1)} km</div>
                <div><b>Temporal Fit:</b> T-${suspect.fits_hours_ago}h</div>
              </div>
            </div>
          `)
          .addTo(map);

        activePopupRef.current = popup;
      });

      markersRef.current[suspect.mmsi] = marker;
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validSuspects, selectedSuspect, showSuspectMarkers, mapLoaded]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Select Suspect & Center Map
  // ─────────────────────────────────────────────────────────────────────────────
  const handleSelectSuspect = (suspect: Suspect) => {
    console.log('[SUSPECT MAP] Selected suspect:', suspect);
    setSelectedSuspect(suspect);

    const coords = extractSuspectCoordinates(suspect);
    const map = mapRef.current;

    if (coords && map) {
      console.log('[SUSPECT MAP] Flying to:', {
        longitude: coords.lon,
        latitude: coords.lat,
      });

      map.flyTo({
        center: [coords.lon, coords.lat],
        zoom: Math.max(map.getZoom(), 11),
        duration: 900,
        essential: true,
      });

      // Show popup on marker
      if (activePopupRef.current) {
        activePopupRef.current.remove();
      }
      const formatted = formatCoordinates(coords.lat, coords.lon);
      const matchScorePct = Math.round(suspect.score * 100);

      const popup = new Popup({ offset: 25, closeButton: true })
        .setLngLat([coords.lon, coords.lat])
        .setHTML(`
          <div style="padding: 8px 10px; font-family: inherit; font-size: 12px; color: #0f172a; min-width: 210px;">
            <div style="font-weight: 800; font-size: 13px; color: #1e3a8a; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center;">
              <span>SUSPECT #${suspect.rank}</span>
              <span style="background: #10b981; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px;">${matchScorePct}% Match</span>
            </div>
            <div style="font-size: 12px; font-weight: 700; margin-bottom: 4px; color: #0f172a;">${suspect.name}</div>
            <div style="font-family: monospace; font-size: 11px; line-height: 1.5; color: #334155; border-top: 1px solid #e2e8f0; padding-top: 4px;">
              <div><b>MMSI:</b> ${suspect.mmsi}</div>
              <div><b>Latitude:</b> ${formatted.latStr}</div>
              <div><b>Longitude:</b> ${formatted.lonStr}</div>
              <div><b>Corridor Distance:</b> ${suspect.distance_km.toFixed(1)} km</div>
              <div><b>Temporal Fit:</b> T-${suspect.fits_hours_ago}h</div>
            </div>
          </div>
        `)
        .addTo(map);

      activePopupRef.current = popup;
    }
  };

  // Fallback for missing corridor
  if (!contract1 || !corridor) {
    return (
      <div
        className="flex-1 flex h-[calc(100vh-72px)] w-full items-center justify-center select-none"
        style={{ background: 'var(--gov-bg)' }}
      >
        <div
          className="flex flex-col items-center gap-4 p-8 max-w-md text-center shadow-lg"
          style={{
            background: 'var(--gov-surface)',
            border: '1px solid var(--gov-border)',
            borderTop: '3px solid var(--gov-navy)',
            borderRadius: '2px',
          }}
        >
          <Activity className="w-8 h-8" style={{ color: 'var(--gov-saffron)' }} />
          <h2 className="text-sm font-bold" style={{ color: 'var(--gov-navy)' }}>
            No Corridor Available
          </h2>
          <p className="text-xs" style={{ color: 'var(--gov-text-secondary)' }}>
            Run the drift hindcast first to produce a space-time corridor before AIS attribution can be plotted.
          </p>
          <button
            onClick={onGoToIngest}
            className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer"
            style={{
              background: 'var(--gov-green)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '2px',
            }}
          >
            Go to Drift Analysis
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex-1 flex flex-col lg:flex-row h-[calc(100vh-72px)] w-full overflow-hidden select-none"
      style={{ background: 'var(--gov-bg)' }}
    >
      {/* ─────────────────────────────────────────────────────────────────────────────
          LEFT: Suspect List + Actual Coordinates
      ───────────────────────────────────────────────────────────────────────────── */}
      <section
        id="suspects-list-panel"
        className="w-full lg:w-[380px] xl:w-[400px] h-[40vh] lg:h-full flex flex-col shrink-0 z-10 border-b lg:border-b-0 lg:border-r"
        style={{ background: 'var(--gov-surface)', borderColor: 'var(--gov-border)' }}
      >
        {/* Panel Header */}
        <div
          className="p-3.5 flex flex-col gap-2"
          style={{ background: 'var(--gov-surface-alt)', borderBottom: '3px solid var(--gov-navy)' }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--gov-navy)' }}>
              <ShieldAlert className="w-4 h-4" style={{ color: 'var(--gov-saffron)' }} />
              Attribution Ranking
            </span>
            <span className="tag tag-active text-[10px]">
              {isLoading ? 'Scoring...' : `${filteredSuspects.length} Suspects`}
            </span>
          </div>

          <div className="flex items-center justify-between">
            {aisSource && (
              <span className={`tag text-[10px] w-fit ${aisSource === 'synthetic' ? 'tag-amber' : 'tag-active'}`}>
                AIS Source: {aisSource}
              </span>
            )}
            <span className="text-[10px] font-mono" style={{ color: 'var(--gov-text-muted)' }}>
              {validSuspects.length} plotted on map
            </span>
          </div>
        </div>

        {/* Loading / Error States */}
        {isLoading && (
          <div className="flex items-center gap-2.5 p-4 text-xs" style={{ color: 'var(--gov-text-secondary)' }}>
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--gov-navy)' }} />
            Scoring AIS traffic against the drift corridor...
          </div>
        )}

        {error && !isLoading && (
          <div
            className="flex items-start gap-2.5 p-4"
            style={{ background: 'var(--gov-warning-bg)', borderBottom: '1px solid var(--gov-saffron)' }}
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--gov-saffron-dim)' }} />
            <div className="flex flex-col gap-1.5">
              <span className="text-xs" style={{ color: 'var(--gov-text-primary)' }}>
                {error}
              </span>
              <button
                onClick={() => contract1 && corridor && fetchSuspects(contract1, corridor)}
                className="w-fit px-2.5 py-1 text-[10px] font-semibold uppercase cursor-pointer"
                style={{ background: 'var(--gov-navy)', color: '#ffffff', borderRadius: '2px' }}
              >
                Retry Scoring
              </button>
            </div>
          </div>
        )}

        {/* Suspect Cards List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {filteredSuspects.map((vessel, index) => {
            const isSelected = selectedSuspect?.mmsi === vessel.mmsi;
            const rank = vessel.rank || index + 1;
            const scorePct = Math.round(vessel.score * 100);
            const scoreColor =
              scorePct >= 80
                ? 'var(--gov-green)'
                : scorePct >= 60
                ? 'var(--gov-saffron-dim)'
                : 'var(--gov-text-muted)';

            const coords = extractSuspectCoordinates(vessel);
            const formatted = coords ? formatCoordinates(coords.lat, coords.lon) : null;

            return (
              <div
                key={vessel.mmsi}
                id={`vessel-card-${vessel.mmsi}`}
                onClick={() => handleSelectSuspect(vessel)}
                className="p-3 cursor-pointer transition-all duration-150"
                style={{
                  background: isSelected ? 'var(--gov-navy-light)' : 'var(--gov-surface-alt)',
                  border: isSelected ? '1px solid var(--gov-navy)' : '1px solid var(--gov-border)',
                  borderLeft: isSelected ? '4px solid var(--gov-navy)' : '1px solid var(--gov-border)',
                  borderRadius: '2px',
                  boxShadow: isSelected ? '0 2px 6px rgba(0,0,128,0.08)' : 'none',
                }}
              >
                {/* Header: Rank + Name + MMSI */}
                <div className="flex justify-between items-start mb-2">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold flex items-center gap-1.5" style={{ color: 'var(--gov-text-primary)' }}>
                      <Ship className="w-3.5 h-3.5" style={{ color: isSelected ? 'var(--gov-navy)' : 'var(--gov-text-muted)' }} />
                      {vessel.name}
                    </span>
                    <span className="font-mono text-[11px]" style={{ color: 'var(--gov-text-muted)' }}>
                      MMSI: {vessel.mmsi}
                    </span>
                  </div>
                  <div
                    className="font-mono text-xs px-2 py-0.5 font-bold"
                    style={{
                      background: rank === 1 ? 'var(--gov-green)' : 'var(--gov-surface)',
                      color: rank === 1 ? '#ffffff' : 'var(--gov-text-secondary)',
                      border: `1px solid ${rank === 1 ? 'var(--gov-green)' : 'var(--gov-border)'}`,
                      borderRadius: '2px',
                    }}
                  >
                    #{rank}
                  </div>
                </div>

                {/* Real Geographic Coordinates Display */}
                <div
                  className="p-2 rounded mb-2 font-mono text-[11px] leading-tight"
                  style={{
                    background: 'var(--gov-surface)',
                    border: '1px solid var(--gov-border)',
                  }}
                >
                  {coords && formatted ? (
                    <div className="space-y-0.5">
                      <div className="flex justify-between">
                        <span className="text-[10px] uppercase font-bold text-gray-400">LATITUDE:</span>
                        <span className="font-bold text-blue-700">{formatted.latStr}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[10px] uppercase font-bold text-gray-400">LONGITUDE:</span>
                        <span className="font-bold text-blue-700">{formatted.lonStr}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-amber-600 font-sans font-medium text-[11px]">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>Coordinates unavailable</span>
                    </div>
                  )}
                </div>

                {/* Temporal & Distance Fit */}
                <div className="flex justify-between text-[10px] font-semibold uppercase mb-2" style={{ color: 'var(--gov-text-muted)' }}>
                  <span>FITS: T-{vessel.fits_hours_ago}H</span>
                  <span>DISTANCE: {vessel.distance_km.toFixed(1)} km</span>
                </div>

                {/* Match Score Bar */}
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold w-10 text-right" style={{ color: scoreColor }}>
                    {scorePct}%
                  </span>
                  <div className="flex-1 h-2 rounded-sm overflow-hidden" style={{ background: 'var(--gov-border)' }}>
                    <div
                      className="h-full transition-all duration-300"
                      style={{ width: `${scorePct}%`, background: scoreColor, borderRadius: '1px' }}
                    />
                  </div>
                </div>
              </div>
            );
          })}

          {!isLoading && !error && filteredSuspects.length === 0 && (
            <div className="p-6 text-center text-xs" style={{ color: 'var(--gov-text-muted)' }}>
              No suspects matched the query.
            </div>
          )}
        </div>

        {/* Proceed to Export Button */}
        <div
          className="p-3"
          style={{ borderTop: '1px solid var(--gov-border)', background: 'var(--gov-surface-alt)' }}
        >
          <button
            onClick={onProceedToExport}
            className="w-full py-2.5 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer"
            style={{
              background: 'var(--gov-green)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '2px',
            }}
          >
            <span>Export Evidence Package</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────────────────────
          CENTER: REAL INTERACTIVE MAPLIBRE MAP (NO STATIC IMAGE)
      ───────────────────────────────────────────────────────────────────────────── */}
      <section
        id="suspects-map-area"
        className="flex-1 relative flex flex-col h-[60vh] lg:h-full overflow-hidden"
        style={{ background: 'var(--gov-bg)' }}
      >
        {/* Actual MapLibre Container (100% width and height) */}
        <div ref={mapContainerRef} className="w-full h-full relative" style={{ minHeight: '300px' }} />

        {/* Error overlay if MapLibre fails (NEVER static image fallback) */}
        {mapError && (
          <div
            className="absolute inset-0 flex items-center justify-center p-6 text-center z-30"
            style={{ background: 'var(--gov-surface)' }}
          >
            <div className="flex flex-col items-center gap-3 max-w-sm">
              <AlertTriangle className="w-8 h-8 text-amber-500" />
              <span className="text-sm font-bold" style={{ color: 'var(--gov-navy)' }}>
                Live geographic map unavailable
              </span>
              <span className="text-xs" style={{ color: 'var(--gov-text-secondary)' }}>
                {mapError}
              </span>
            </div>
          </div>
        )}

        {/* Map Header Overlay */}
        <div className="absolute top-3 left-14 z-10 pointer-events-none flex items-center gap-2">
          <div
            className="px-3 py-1.5 rounded shadow-md pointer-events-auto flex items-center gap-2"
            style={{
              background: 'var(--gov-surface)',
              border: '1px solid var(--gov-border)',
              borderLeft: '3px solid var(--gov-navy)',
            }}
          >
            <ShieldAlert className="w-4 h-4" style={{ color: 'var(--gov-saffron)' }} />
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--gov-navy)' }}>
              Geographic Suspect Attribution Map
            </span>
          </div>
        </div>

        {/* Layer Controls & Fit Bounds (Top-Right) */}
        <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
          <div
            className="p-2 rounded shadow-md flex flex-col gap-1.5"
            style={{
              background: 'var(--gov-surface)',
              border: '1px solid var(--gov-border)',
            }}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider px-1" style={{ color: 'var(--gov-text-muted)' }}>
              Map Layers
            </span>
            <label className="flex items-center gap-2 px-1 text-xs cursor-pointer select-none" style={{ color: 'var(--gov-text-primary)' }}>
              <input
                type="checkbox"
                checked={showSuspectMarkers}
                onChange={(e) => setShowSuspectMarkers(e.target.checked)}
                className="cursor-pointer"
              />
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                Suspects ({validSuspects.length})
              </span>
            </label>
            <label className="flex items-center gap-2 px-1 text-xs cursor-pointer select-none" style={{ color: 'var(--gov-text-primary)' }}>
              <input
                type="checkbox"
                checked={showSpillLayer}
                onChange={(e) => setShowSpillLayer(e.target.checked)}
                className="cursor-pointer"
              />
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                Spill Origin
              </span>
            </label>
            <label className="flex items-center gap-2 px-1 text-xs cursor-pointer select-none" style={{ color: 'var(--gov-text-primary)' }}>
              <input
                type="checkbox"
                checked={showCorridorLayer}
                onChange={(e) => setShowCorridorLayer(e.target.checked)}
                className="cursor-pointer"
              />
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-sky-500"></span>
                Drift Corridor
              </span>
            </label>

            <button
              onClick={fitMapBounds}
              title="Fit map to all suspect and drift coordinates"
              className="mt-1 flex items-center justify-center gap-1 py-1 px-2 text-[10px] font-bold uppercase rounded cursor-pointer transition-colors"
              style={{
                background: 'var(--gov-surface-alt)',
                border: '1px solid var(--gov-border)',
                color: 'var(--gov-navy)',
              }}
            >
              <Maximize2 className="w-3 h-3" />
              Fit Bounds
            </button>
          </div>
        </div>

        {/* Live Coordinate HUD & Inspector (Bottom-Left) */}
        <div className="absolute bottom-3 left-3 z-10 flex flex-col gap-1.5 pointer-events-none">
          {inspectorPin && (
            <div
              className="px-2.5 py-1.5 rounded shadow-md pointer-events-auto flex items-center justify-between gap-3 text-xs"
              style={{
                background: 'var(--gov-surface)',
                border: '1px solid #3b82f6',
                borderLeft: '3px solid #3b82f6',
              }}
            >
              <div className="flex items-center gap-1.5">
                <Crosshair className="w-3.5 h-3.5 text-blue-500" />
                <span className="font-bold text-[10px] uppercase text-blue-600">INSPECT:</span>
                <span className="font-mono font-semibold text-[11px]" style={{ color: 'var(--gov-text-primary)' }}>
                  {formatCoordinates(inspectorPin.lat, inspectorPin.lon).latStr},{' '}
                  {formatCoordinates(inspectorPin.lat, inspectorPin.lon).lonStr}
                </span>
              </div>
              <button
                onClick={() => setInspectorPin(null)}
                className="p-0.5 rounded hover:bg-gray-200 cursor-pointer"
                title="Clear Pin"
              >
                <X className="w-3 h-3 text-gray-500" />
              </button>
            </div>
          )}

          {cursorCoords && (
            <div
              className="px-2 py-1 rounded shadow-sm text-[11px] font-mono pointer-events-auto"
              style={{
                background: 'rgba(15, 23, 42, 0.82)',
                color: '#ffffff',
              }}
            >
              <span>LAT: {formatCoordinates(cursorCoords.lat, cursorCoords.lon).latStr}</span>
              <span className="mx-1.5 text-gray-400">|</span>
              <span>LON: {formatCoordinates(cursorCoords.lat, cursorCoords.lon).lonStr}</span>
            </div>
          )}
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────────────────────
          RIGHT: Attribution Matrix & Forensic Evidence
      ───────────────────────────────────────────────────────────────────────────── */}
      <section
        id="suspects-evidence-panel"
        className="w-full lg:w-[340px] xl:w-[360px] h-auto lg:h-full flex flex-col shrink-0 z-10 border-t lg:border-t-0 lg:border-l overflow-y-auto"
        style={{ background: 'var(--gov-surface)', borderColor: 'var(--gov-border)' }}
      >
        {/* Right Header */}
        <div
          className="p-3.5 flex items-center justify-between"
          style={{ background: 'var(--gov-surface-alt)', borderBottom: '3px solid var(--gov-navy)' }}
        >
          <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--gov-navy)' }}>
            <Zap className="w-4 h-4" style={{ color: 'var(--gov-saffron)' }} />
            Attribution Matrix
          </span>
          {selectedSuspect && (
            <span className="tag tag-active text-xs font-bold font-mono">
              {Math.round(selectedSuspect.score * 100)}% Match
            </span>
          )}
        </div>

        {selectedSuspect ? (
          <div className="p-4 space-y-4 flex-1">
            {/* Selected Vessel Identity */}
            <div
              className="p-3 rounded"
              style={{ background: 'var(--gov-surface-alt)', border: '1px solid var(--gov-border)', borderLeft: '3px solid var(--gov-navy)' }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold" style={{ color: 'var(--gov-text-primary)' }}>
                  {selectedSuspect.name}
                </span>
                <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                  Rank #{selectedSuspect.rank}
                </span>
              </div>
              <div className="font-mono text-[11px] text-gray-500">MMSI: {selectedSuspect.mmsi}</div>
              {(() => {
                const c = extractSuspectCoordinates(selectedSuspect);
                if (c) {
                  const f = formatCoordinates(c.lat, c.lon);
                  return (
                    <div className="mt-1.5 pt-1.5 border-t border-gray-200 text-[11px] font-mono text-emerald-700 font-semibold">
                      {f.latStr} | {f.lonStr}
                    </div>
                  );
                }
                return (
                  <div className="mt-1.5 pt-1.5 border-t border-gray-200 text-[11px] font-mono text-amber-700">
                    Coordinates unavailable
                  </div>
                );
              })()}
            </div>

            {/* Attribution Factors (Weighted) */}
            <div
              className="p-3.5 rounded"
              style={{ background: 'var(--gov-surface-alt)', border: '1px solid var(--gov-border)' }}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider block mb-2.5" style={{ color: 'var(--gov-text-secondary)' }}>
                Five-Factor Breakdown
              </span>
              <div className="space-y-3">
                {FACTOR_LABELS.map(({ key, label }) => {
                  const val = Math.round((selectedSuspect.factors?.[key] ?? 0) * 100);
                  const weight = selectedSuspect.weights?.[key] ?? 0;
                  return (
                    <div key={key}>
                      <div className="flex justify-between font-mono text-[11px] mb-1" style={{ color: 'var(--gov-text-secondary)' }}>
                        <span>{label}</span>
                        <span className="font-semibold" style={{ color: 'var(--gov-navy)' }}>
                          {val}% <span className="text-[10px] text-gray-400">×{weight}</span>
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-sm overflow-hidden" style={{ background: 'var(--gov-border)' }}>
                        <div
                          className="h-full transition-all duration-300"
                          style={{ width: `${val}%`, background: 'var(--gov-navy)', borderRadius: '1px' }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Forensic Evidence Statement */}
            <div
              className="p-3.5 rounded"
              style={{ background: 'var(--gov-surface-alt)', border: '1px solid var(--gov-border)' }}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <FileText className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--gov-text-secondary)' }}>
                  Forensic Evidence
                </span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--gov-text-primary)' }}>
                {selectedSuspect.evidence || 'Candidate vessel matches corridor temporal and spatial criteria.'}
              </p>
              {selectedSuspect.matched_at && (
                <div className="mt-2 text-[10px] font-mono" style={{ color: 'var(--gov-text-muted)' }}>
                  Matched: {new Date(selectedSuspect.matched_at).toISOString().slice(0, 19).replace('T', ' ')} UTC
                </div>
              )}
            </div>

            {/* Explanatory disclaimer */}
            <p className="text-[10px] leading-normal italic px-1" style={{ color: 'var(--gov-text-muted)' }}>
              Weighted attribution is an investigative triage aid for human review, not an automated verdict. Factors remain separately auditable.
            </p>
          </div>
        ) : (
          <div className="p-6 text-center text-xs" style={{ color: 'var(--gov-text-muted)' }}>
            Select a suspect to view attribution details.
          </div>
        )}
      </section>
    </div>
  );
};
