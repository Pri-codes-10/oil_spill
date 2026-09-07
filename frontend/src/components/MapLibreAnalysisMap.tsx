import React, { useEffect, useRef, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import {
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
  FullscreenControl,
  Popup,
  LngLat,
  GeoJSONSource,
  setWorkerUrl
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { CorridorResponse, GisLayers, Suspect } from '../types';
import { DetectionResponse } from '../api/api';

// Configure official worker URL for Vite
try {
  setWorkerUrl(workerUrl);
} catch (err) {
  console.warn('MapLibre workerUrl setup warning:', err);
}

// ─── Basemap Styles ────────────────────────────────────────────────────────────
// Light: OpenFreeMap Liberty (clean, vibrant, free, no API key)
export const LIGHT_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
// Dark: CARTO Dark Matter (high-contrast tactical dark basemap, free, no API key)
export const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

// ─── Coordinate validation ─────────────────────────────────────────────────────
function isValidCoord(lat: number, lon: number): boolean {
  return (
    isFinite(lat) && isFinite(lon) &&
    lat >= -90 && lat <= 90 &&
    lon >= -180 && lon <= 180
  );
}

// ─── Empty GeoJSON helper ──────────────────────────────────────────────────────
const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

// ─── Build Contract-1 GeoJSON ─────────────────────────────────────────────────
function buildContract1GeoJSON(contract1: DetectionResponse | null): GeoJSON.FeatureCollection {
  if (!contract1) return EMPTY_FC;
  const features: GeoJSON.Feature[] = [];

  // Polygon — contract1.polygon is [[lon, lat], ...] GeoJSON order
  if (Array.isArray(contract1.polygon) && contract1.polygon.length > 0 && Array.isArray(contract1.polygon[0])) {
    const ring = contract1.polygon[0] as number[][];
    const validRing = ring.filter(pt => Array.isArray(pt) && pt.length >= 2 && isValidCoord(pt[1], pt[0]));
    if (validRing.length >= 3) {
      const closed = [...validRing];
      const first = closed[0];
      const last = closed[closed.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) closed.push(first);
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [closed] },
        properties: {
          area_km2: contract1.area_km2,
          major_axis_km: contract1.major_axis_km,
          minor_axis_km: contract1.minor_axis_km,
          orientation_deg: contract1.orientation_deg,
          confidence: contract1.confidence,
          detector: contract1.detector,
          observed_at: contract1.observed_at,
          type: 'polygon',
        },
      });
    }
  }

  // Centroid — contract1.centroid = [longitude, latitude]
  if (Array.isArray(contract1.centroid) && contract1.centroid.length >= 2) {
    const lon = Number(contract1.centroid[0]);
    const lat = Number(contract1.centroid[1]);
    if (isValidCoord(lat, lon)) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: {
          area_km2: contract1.area_km2,
          major_axis_km: contract1.major_axis_km,
          minor_axis_km: contract1.minor_axis_km,
          orientation_deg: contract1.orientation_deg,
          confidence: contract1.confidence,
          detector: contract1.detector,
          observed_at: contract1.observed_at,
          lat,
          lon,
          type: 'centroid',
        },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

// ─── Haversine distance in kilometers ───────────────────────────────────────────
function haversineDistanceKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ─── Generate geodesic circle coordinates (WGS-84) ───────────────────────────
function createGeoCircle(lon: number, lat: number, radiusKm: number, points: number = 64): number[][] {
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
    const ptLonRad = lonRad + Math.atan2(
      Math.sin(bearing) * Math.sin(d) * Math.cos(latRad),
      Math.cos(d) - Math.sin(latRad) * Math.sin(ptLatRad)
    );
    coords.push([
      (ptLonRad * 180) / Math.PI,
      (ptLatRad * 180) / Math.PI
    ]);
  }
  return coords;
}

// ─── Build Drift-Corridor GeoJSON ─────────────────────────────────────────────
function buildCorridorGeoJSON(
  corridor: CorridorResponse | null,
  contract1?: DetectionResponse | null
): {
  lines: GeoJSON.FeatureCollection;
  nodes: GeoJSON.FeatureCollection;
  circles: GeoJSON.FeatureCollection;
} {
  if (!corridor || !Array.isArray(corridor.corridor) || corridor.corridor.length === 0) {
    return { lines: EMPTY_FC, nodes: EMPTY_FC, circles: EMPTY_FC };
  }
  const validNodes = corridor.corridor.filter(n => isValidCoord(Number(n.lat), Number(n.lon)));
  if (validNodes.length === 0) {
    return { lines: EMPTY_FC, nodes: EMPTY_FC, circles: EMPTY_FC };
  }

  // 1. Determine origin estimate center:
  // Preference: contract1.centroid if available, otherwise first corridor node
  let originLon = Number(validNodes[0].lon);
  let originLat = Number(validNodes[0].lat);
  if (contract1 && Array.isArray(contract1.centroid) && contract1.centroid.length >= 2) {
    const cLon = Number(contract1.centroid[0]);
    const cLat = Number(contract1.centroid[1]);
    if (isValidCoord(cLat, cLon)) {
      originLon = cLon;
      originLat = cLat;
    }
  }

  // 2. Identify the last coordinate in the corridor
  const lastNode = validNodes[validNodes.length - 1];
  const lastLon = Number(lastNode.lon);
  const lastLat = Number(lastNode.lat);

  // 3. Compute distance from origin estimate to the last coordinate
  const distanceToLastKm = haversineDistanceKm(originLon, originLat, lastLon, lastLat);
  const radiusKm = Math.max(distanceToLastKm, Number(lastNode.radius_km) || 1, 0.5);

  // 4. Generate the single big circle around origin estimate extending till last coordinate
  const bigCircleRing = createGeoCircle(originLon, originLat, radiusKm, 96);
  const bigCircleFeature: GeoJSON.Feature = {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [bigCircleRing] },
    properties: {
      is_big_horizon: true,
      origin_lat: originLat,
      origin_lon: originLon,
      last_lat: lastLat,
      last_lon: lastLon,
      radius_km: radiusKm,
      last_hours_ago: lastNode.hours_ago,
      field_source: corridor.field_source || 'analytic',
      label: `Search Horizon (${radiusKm.toFixed(2)} km)`,
    },
  };

  const nodeFeatures: GeoJSON.Feature[] = validNodes.map((n) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [Number(n.lon), Number(n.lat)] },
    properties: {
      hours_ago: n.hours_ago,
      lat: Number(n.lat),
      lon: Number(n.lon),
      radius_km: Number(n.radius_km),
      label: `T-${n.hours_ago}h`,
    },
  }));

  return {
    lines: EMPTY_FC,
    nodes: { type: 'FeatureCollection', features: nodeFeatures },
    circles: { type: 'FeatureCollection', features: [bigCircleFeature] }
  };
}

// ─── Build Suspect Vessel GeoJSON ─────────────────────────────────────────────
function buildSuspectGeoJSON(topSuspect: Suspect | null, corridor?: CorridorResponse | null): GeoJSON.FeatureCollection {
  if (!topSuspect) return EMPTY_FC;
  // Use [topSuspect.lon, topSuspect.lat], falling back to matched corridor node if not yet cached on suspect
  const rawLon = topSuspect.lon ?? (corridor?.corridor?.find(n => n.hours_ago === topSuspect.fits_hours_ago)?.lon);
  const rawLat = topSuspect.lat ?? (corridor?.corridor?.find(n => n.hours_ago === topSuspect.fits_hours_ago)?.lat);
  if (rawLon == null || rawLat == null) return EMPTY_FC;
  const lon = Number(rawLon);
  const lat = Number(rawLat);
  if (!isValidCoord(lat, lon)) return EMPTY_FC;
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: {
        name: topSuspect.name || 'Unknown Vessel',
        mmsi: topSuspect.mmsi,
        fits_hours_ago: topSuspect.fits_hours_ago,
        matched_at: topSuspect.matched_at,
        score: topSuspect.score,
        rank: topSuspect.rank,
        lat,
        lon,
        type: 'suspect'
      },
    }],
  };
}

// ─── Build Origin GeoJSON ─────────────────────────────────────────────────────
function buildOriginGeoJSON(contract1: DetectionResponse | null): GeoJSON.FeatureCollection {
  if (!contract1 || !Array.isArray(contract1.centroid) || contract1.centroid.length < 2) return EMPTY_FC;
  const lon = Number(contract1.centroid[0]);
  const lat = Number(contract1.centroid[1]);
  if (!isValidCoord(lat, lon)) return EMPTY_FC;
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: { lat, lon, type: 'origin' }
    }],
  };
}

// ─── Compute fitBounds ────────────────────────────────────────────────────────
function computeBounds(
  contract1: DetectionResponse | null,
  corridor: CorridorResponse | null,
  topSuspect: Suspect | null,
): [[number, number], [number, number]] | null {
  const pts: [number, number][] = [];
  if (contract1) {
    if (Array.isArray(contract1.centroid) && contract1.centroid.length >= 2) {
      const lon = Number(contract1.centroid[0]);
      const lat = Number(contract1.centroid[1]);
      if (isValidCoord(lat, lon)) pts.push([lon, lat]);
    }
    if (Array.isArray(contract1.polygon) && contract1.polygon.length > 0) {
      (contract1.polygon[0] as number[][]).forEach(pt => {
        if (Array.isArray(pt) && pt.length >= 2) {
          const lon = Number(pt[0]);
          const lat = Number(pt[1]);
          if (isValidCoord(lat, lon)) pts.push([lon, lat]);
        }
      });
    }
  }
  if (corridor && Array.isArray(corridor.corridor) && corridor.corridor.length > 0) {
    const validNodes = corridor.corridor.filter(n => isValidCoord(Number(n.lat), Number(n.lon)));
    if (validNodes.length > 0) {
      let originLon = Number(validNodes[0].lon);
      let originLat = Number(validNodes[0].lat);
      if (contract1 && Array.isArray(contract1.centroid) && contract1.centroid.length >= 2) {
        const cLon = Number(contract1.centroid[0]);
        const cLat = Number(contract1.centroid[1]);
        if (isValidCoord(cLat, cLon)) {
          originLon = cLon;
          originLat = cLat;
        }
      }

      const lastNode = validNodes[validNodes.length - 1];
      const lastLon = Number(lastNode.lon);
      const lastLat = Number(lastNode.lat);
      const radiusKm = Math.max(haversineDistanceKm(originLon, originLat, lastLon, lastLat), Number(lastNode.radius_km) || 1, 0.5);

      const dLat = radiusKm / 110.574;
      const cosLat = Math.cos((originLat * Math.PI) / 180);
      const dLon = radiusKm / (111.320 * (Math.abs(cosLat) < 0.0001 ? 1 : Math.abs(cosLat)));

      pts.push([originLon - dLon, originLat - dLat]);
      pts.push([originLon + dLon, originLat + dLat]);

      validNodes.forEach(n => {
        pts.push([Number(n.lon), Number(n.lat)]);
      });
    }
  }
  if (topSuspect) {
    const rawLon = topSuspect.lon ?? (corridor?.corridor?.find(n => n.hours_ago === topSuspect.fits_hours_ago)?.lon);
    const rawLat = topSuspect.lat ?? (corridor?.corridor?.find(n => n.hours_ago === topSuspect.fits_hours_ago)?.lat);
    if (rawLon != null && rawLat != null) {
      const lon = Number(rawLon);
      const lat = Number(rawLat);
      if (isValidCoord(lat, lon)) pts.push([lon, lat]);
    }
  }
  if (pts.length === 0) return null;
  const lons = pts.map(p => p[0]);
  const lats = pts.map(p => p[1]);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  // If bounds collapse to a single point, provide a minimal delta
  if (minLon === maxLon && minLat === maxLat) {
    return [[minLon - 0.05, minLat - 0.05], [maxLon + 0.05, maxLat + 0.05]];
  }
  return [[minLon, minLat], [maxLon, maxLat]];
}

// ─── Layer / Source IDs ───────────────────────────────────────────────────────
const LAYER = {
  c1Fill: 'contract1-fill',
  c1Line: 'contract1-line',
  c1CentroidHalo: 'contract1-centroid-halo',
  c1Centroid: 'contract1-centroid',
  corridorCirclesFill: 'drift-corridor-circles-fill',
  corridorCirclesLine: 'drift-corridor-circles-line',
  corridorLine: 'drift-corridor-line',
  corridorNodes: 'drift-nodes',
  corridorLabels: 'drift-labels',
  suspectHalo: 'suspect-vessel-halo',
  suspect: 'suspect-vessel',
  suspectLabel: 'suspect-vessel-label',
  originRing: 'origin-ring',
  origin: 'origin-marker',
  originLabel: 'origin-label',
} as const;

const SOURCE = {
  contract1: 'contract1-source',
  corridorCircles: 'drift-corridor-circles-source',
  corridorLines: 'drift-corridor-source',
  corridorNodes: 'drift-node-source',
  suspect: 'suspect-vessel-source',
  origin: 'origin-estimate-source',
} as const;

// ─── Props ────────────────────────────────────────────────────────────────────
export interface FeatureClickInfo {
  lat: number;
  lon: number;
  title: string;
  subtitle?: string;
  badge?: string;
  badgeColor?: string;
  properties: Record<string, string | number>;
}

export interface MapLibreAnalysisMapProps {
  contract1: DetectionResponse | null;
  corridor: CorridorResponse | null;
  topSuspect: Suspect | null;
  gisLayers: GisLayers;
  theme: 'light' | 'dark';
  isVisible?: boolean;
  onHoverCoord?: (coords: { lat: number; lon: number } | null) => void;
  onClickCoord?: (coords: { lat: number; lon: number } | null) => void;
  onFeatureClick?: (info: FeatureClickInfo) => void;
}

export interface MapLibreAnalysisMapHandle {
  fitAll: () => void;
  zoomToCentroid: () => void;
  zoomToCorridor: () => void;
  zoomToSuspect: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
export const MapLibreAnalysisMap = React.forwardRef<MapLibreAnalysisMapHandle, MapLibreAnalysisMapProps>(({
  contract1,
  corridor,
  topSuspect,
  gisLayers,
  theme,
  isVisible = true,
  onHoverCoord,
  onClickCoord,
  onFeatureClick,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapLoadedRef = useRef<boolean>(false);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const currentThemeRef = useRef<'light' | 'dark'>(theme);
  const userInteractedRef = useRef<boolean>(false);

  // Keep latest refs so callbacks always access fresh state without tearing down map
  const contract1Ref = useRef(contract1);
  const corridorRef = useRef(corridor);
  const topSuspectRef = useRef(topSuspect);
  const gisLayersRef = useRef(gisLayers);
  const themeRef = useRef(theme);
  const onFeatureClickRef = useRef(onFeatureClick);
  const onHoverCoordRef = useRef(onHoverCoord);
  const onClickCoordRef = useRef(onClickCoord);

  contract1Ref.current = contract1;
  corridorRef.current = corridor;
  topSuspectRef.current = topSuspect;
  gisLayersRef.current = gisLayers;
  themeRef.current = theme;
  onFeatureClickRef.current = onFeatureClick;
  onHoverCoordRef.current = onHoverCoord;
  onClickCoordRef.current = onClickCoord;

  // ── Show Popup Helper ────────────────────────────────────────────────────────
  const showPopup = useCallback((lngLat: maplibregl.LngLat, html: string) => {
    const map = mapRef.current;
    if (!map) return;
    if (popupRef.current) popupRef.current.remove();
    popupRef.current = new maplibregl.Popup({ closeOnClick: true, maxWidth: '340px' })
      .setLngLat(lngLat)
      .setHTML(html)
      .addTo(map);
  }, []);

  // ── Setup / Re-setup Sources, Layers, & Event Listeners ─────────────────────
  // Must be idempotent: MapLibre removes all custom sources and layers when style changes.
  const setupSourcesAndLayers = useCallback((map: maplibregl.Map) => {
    const isDark = themeRef.current === 'dark';
    const c1Data = buildContract1GeoJSON(contract1Ref.current);
    const corrData = buildCorridorGeoJSON(corridorRef.current, contract1Ref.current);
    const suspData = buildSuspectGeoJSON(topSuspectRef.current, corridorRef.current);
    const origData = buildOriginGeoJSON(contract1Ref.current);

    // 1. Ensure Sources
    if (!map.getSource(SOURCE.contract1)) {
      map.addSource(SOURCE.contract1, { type: 'geojson', data: c1Data });
    } else {
      (map.getSource(SOURCE.contract1) as maplibregl.GeoJSONSource).setData(c1Data);
    }

    if (!map.getSource(SOURCE.corridorCircles)) {
      map.addSource(SOURCE.corridorCircles, { type: 'geojson', data: corrData.circles });
    } else {
      (map.getSource(SOURCE.corridorCircles) as maplibregl.GeoJSONSource).setData(corrData.circles);
    }

    if (!map.getSource(SOURCE.corridorLines)) {
      map.addSource(SOURCE.corridorLines, { type: 'geojson', data: corrData.lines });
    } else {
      (map.getSource(SOURCE.corridorLines) as maplibregl.GeoJSONSource).setData(corrData.lines);
    }

    if (!map.getSource(SOURCE.corridorNodes)) {
      map.addSource(SOURCE.corridorNodes, { type: 'geojson', data: corrData.nodes });
    } else {
      (map.getSource(SOURCE.corridorNodes) as maplibregl.GeoJSONSource).setData(corrData.nodes);
    }

    if (!map.getSource(SOURCE.suspect)) {
      map.addSource(SOURCE.suspect, { type: 'geojson', data: suspData });
    } else {
      (map.getSource(SOURCE.suspect) as maplibregl.GeoJSONSource).setData(suspData);
    }

    if (!map.getSource(SOURCE.origin)) {
      map.addSource(SOURCE.origin, { type: 'geojson', data: origData });
    } else {
      (map.getSource(SOURCE.origin) as maplibregl.GeoJSONSource).setData(origData);
    }

    // 2. Add Analysis Layers (Contract 1, Contract 2, Suspect, Origin)
    // Contract 1: Spill Fill & Outline
    const initialOpacity = (gisLayersRef.current.predictedMaskOpacity ?? 85) / 100;
    if (!map.getLayer(LAYER.c1Fill)) {
      map.addLayer({
        id: LAYER.c1Fill,
        type: 'fill',
        source: SOURCE.contract1,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: {
          'fill-color': isDark ? '#06b6d4' : '#0284c7',
          'fill-opacity': initialOpacity,
        },
        layout: { visibility: 'none' }
      });
      console.log("[ANALYSIS MAP] Contract 1 polygon added");
    }

    if (!map.getLayer(LAYER.c1Line)) {
      map.addLayer({
        id: LAYER.c1Line,
        type: 'line',
        source: SOURCE.contract1,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: {
          'line-color': isDark ? '#22d3ee' : '#0369a1',
          'line-width': 2.8,
          'line-opacity': Math.min(1, initialOpacity + 0.15),
        },
        layout: { visibility: 'none' }
      });
    }

    // Contract 1 Centroid Halo & Center Dot
    if (!map.getLayer(LAYER.c1CentroidHalo)) {
      map.addLayer({
        id: LAYER.c1CentroidHalo,
        type: 'circle',
        source: SOURCE.contract1,
        filter: ['==', ['get', 'type'], 'centroid'],
        paint: {
          'circle-radius': 24,
          'circle-color': isDark ? 'rgba(6,182,212,0.25)' : 'rgba(2,132,199,0.22)',
          'circle-stroke-color': isDark ? '#22d3ee' : '#0284c7',
          'circle-stroke-width': 2,
          'circle-opacity': 0.85,
          'circle-stroke-opacity': 0.9,
        },
        layout: { visibility: 'none' }
      });
    }

    if (!map.getLayer(LAYER.c1Centroid)) {
      map.addLayer({
        id: LAYER.c1Centroid,
        type: 'circle',
        source: SOURCE.contract1,
        filter: ['==', ['get', 'type'], 'centroid'],
        paint: {
          'circle-radius': 7.5,
          'circle-color': '#ffffff',
          'circle-stroke-color': isDark ? '#0891b2' : '#0369a1',
          'circle-stroke-width': 3.5,
          'circle-opacity': 1,
          'circle-stroke-opacity': 1,
        },
        layout: { visibility: 'none' }
      });
    }

    // Contract 2: Drift Corridor Circular Radii (Corresponds to backend radius_km)
    if (!map.getLayer(LAYER.corridorCirclesFill)) {
      map.addLayer({
        id: LAYER.corridorCirclesFill,
        type: 'fill',
        source: SOURCE.corridorCircles,
        paint: {
          'fill-color': '#f59e0b',
          'fill-opacity': isDark ? 0.22 : 0.18,
        },
        layout: { visibility: 'none' }
      });
    }

    if (!map.getLayer(LAYER.corridorCirclesLine)) {
      map.addLayer({
        id: LAYER.corridorCirclesLine,
        type: 'line',
        source: SOURCE.corridorCircles,
        paint: {
          'line-color': isDark ? '#fbbf24' : '#d97706',
          'line-width': 2,
          'line-dasharray': [4, 3],
          'line-opacity': 0.9,
        },
        layout: { visibility: 'none' }
      });
    }

    // Contract 2: Drift Nodes
    if (!map.getLayer(LAYER.corridorNodes)) {
      map.addLayer({
        id: LAYER.corridorNodes,
        type: 'circle',
        source: SOURCE.corridorNodes,
        paint: {
          'circle-radius': 8,
          'circle-color': '#f59e0b',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2.5,
          'circle-opacity': 1,
          'circle-stroke-opacity': 1,
        },
        layout: { visibility: 'none' }
      });
    }

    // Contract 2: Drift Node Time Labels (Dynamic T-Xh)
    if (!map.getLayer(LAYER.corridorLabels)) {
      map.addLayer({
        id: LAYER.corridorLabels,
        type: 'symbol',
        source: SOURCE.corridorNodes,
        layout: {
          'text-field': ['concat', 'T-', ['to-string', ['get', 'hours_ago']], 'h'],
          'text-size': 12,
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-offset': [0, -1.8],
          'text-anchor': 'bottom',
          'text-allow-overlap': true,
          visibility: 'none',
        },
        paint: {
          'text-color': isDark ? '#fde68a' : '#92400e',
          'text-halo-color': isDark ? '#090e17' : '#ffffff',
          'text-halo-width': 2.5,
        }
      });
    }

    // Suspect Vessel Halo, Center Marker & Label
    if (!map.getLayer(LAYER.suspectHalo)) {
      map.addLayer({
        id: LAYER.suspectHalo,
        type: 'circle',
        source: SOURCE.suspect,
        paint: {
          'circle-radius': 24,
          'circle-color': 'rgba(239, 68, 68, 0.22)',
          'circle-stroke-color': '#ef4444',
          'circle-stroke-width': 2,
          'circle-opacity': 0.85,
          'circle-stroke-opacity': 0.9,
        },
        layout: { visibility: 'none' }
      });
    }

    if (!map.getLayer(LAYER.suspect)) {
      map.addLayer({
        id: LAYER.suspect,
        type: 'circle',
        source: SOURCE.suspect,
        paint: {
          'circle-radius': 10.5,
          'circle-color': '#ef4444',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 3,
          'circle-opacity': 1,
          'circle-stroke-opacity': 1,
        },
        layout: { visibility: 'none' }
      });
    }

    if (!map.getLayer(LAYER.suspectLabel)) {
      map.addLayer({
        id: LAYER.suspectLabel,
        type: 'symbol',
        source: SOURCE.suspect,
        layout: {
          'text-field': ['concat', '🚢 ', ['get', 'name']],
          'text-size': 12,
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-offset': [0, 1.8],
          'text-anchor': 'top',
          'text-allow-overlap': true,
          visibility: 'none',
        },
        paint: {
          'text-color': isDark ? '#fca5a5' : '#b91c1c',
          'text-halo-color': isDark ? '#090e17' : '#ffffff',
          'text-halo-width': 2.5,
        }
      });
    }

    // Origin Marker, Outer Ring & Label
    if (!map.getLayer(LAYER.originRing)) {
      map.addLayer({
        id: LAYER.originRing,
        type: 'circle',
        source: SOURCE.origin,
        paint: {
          'circle-radius': 26,
          'circle-color': 'rgba(220, 38, 38, 0.15)',
          'circle-stroke-color': '#dc2626',
          'circle-stroke-width': 2.2,
          'circle-stroke-opacity': 0.85,
        },
        layout: { visibility: 'none' }
      });
    }

    if (!map.getLayer(LAYER.origin)) {
      map.addLayer({
        id: LAYER.origin,
        type: 'circle',
        source: SOURCE.origin,
        paint: {
          'circle-radius': 7.5,
          'circle-color': '#dc2626',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2.5,
          'circle-opacity': 1,
          'circle-stroke-opacity': 1,
        },
        layout: { visibility: 'none' }
      });
    }

    if (!map.getLayer(LAYER.originLabel)) {
      map.addLayer({
        id: LAYER.originLabel,
        type: 'symbol',
        source: SOURCE.origin,
        layout: {
          'text-field': 'ORIGIN ESTIMATE',
          'text-size': 11,
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-offset': [0, -2.0],
          'text-anchor': 'bottom',
          'text-allow-overlap': true,
          visibility: 'none',
        },
        paint: {
          'text-color': isDark ? '#fca5a5' : '#b91c1c',
          'text-halo-color': isDark ? '#090e17' : '#ffffff',
          'text-halo-width': 2.5,
        }
      });
    }

    // 3. Restore visibility states from current gisLayers
    const layers = gisLayersRef.current;
    const c1Visible = layers.predictedMask && !!contract1Ref.current;
    [LAYER.c1Fill, LAYER.c1Line, LAYER.c1CentroidHalo, LAYER.c1Centroid].forEach(id => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', c1Visible ? 'visible' : 'none');
    });

    const corrVisible = layers.oceanCurrents && !!corridorRef.current;
    [LAYER.corridorCirclesFill, LAYER.corridorCirclesLine, LAYER.corridorNodes, LAYER.corridorLabels].forEach(id => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', corrVisible ? 'visible' : 'none');
    });

    const suspVisible = layers.aisTracks && !!topSuspectRef.current;
    [LAYER.suspect, LAYER.suspectHalo, LAYER.suspectLabel].forEach(id => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', suspVisible ? 'visible' : 'none');
    });

    const origVisible = layers.originEstimate && !!contract1Ref.current;
    [LAYER.origin, LAYER.originRing, LAYER.originLabel].forEach(id => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', origVisible ? 'visible' : 'none');
    });

    // 4. Restore opacities on Predicted Mask (Contract 1 fill + outline)
    const opacity = (layers.predictedMaskOpacity ?? 85) / 100;
    if (map.getLayer(LAYER.c1Fill)) map.setPaintProperty(LAYER.c1Fill, 'fill-opacity', opacity);
    if (map.getLayer(LAYER.c1Line)) map.setPaintProperty(LAYER.c1Line, 'line-opacity', Math.min(1, opacity + 0.15));
    if (map.getLayer(LAYER.c1Centroid)) map.setPaintProperty(LAYER.c1Centroid, 'circle-opacity', 1);
    if (map.getLayer(LAYER.c1CentroidHalo)) map.setPaintProperty(LAYER.c1CentroidHalo, 'circle-opacity', Math.min(0.85, opacity * 0.7));
    if (map.getLayer(LAYER.corridorCirclesFill)) map.setPaintProperty(LAYER.corridorCirclesFill, 'fill-opacity', isDark ? 0.22 : 0.18);
    if (map.getLayer(LAYER.corridorCirclesLine)) map.setPaintProperty(LAYER.corridorCirclesLine, 'line-opacity', 0.9);
    if (map.getLayer(LAYER.corridorNodes)) map.setPaintProperty(LAYER.corridorNodes, 'circle-opacity', 1);
    if (map.getLayer(LAYER.suspect)) map.setPaintProperty(LAYER.suspect, 'circle-opacity', 1);

    // 5. Interactive clicks & popups
    const popupBg = isDark ? '#090e17' : '#ffffff';
    const popupText = isDark ? '#f1f5f9' : '#0f172a';
    const popupBorder = isDark ? '#223048' : '#cbd5e1';
    const popupMuted = isDark ? '#94a3b8' : '#64748b';

    // C1 Centroid click
    map.on('click', LAYER.c1Centroid, (e) => {
      (e.originalEvent as any)._handledByFeature = true;
      const feat = e.features?.[0];
      if (!feat) return;
      const p = feat.properties as Record<string, any>;
      const lat = Number(p.lat);
      const lon = Number(p.lon);
      onClickCoordRef.current?.({ lat, lon });
      onFeatureClickRef.current?.({
        lat,
        lon,
        title: 'Contract 1: Spill Centroid',
        subtitle: `Confidence: ${(Number(p.confidence) * 100).toFixed(1)}%`,
        badge: 'C1 SPILL',
        badgeColor: '#06b6d4',
        properties: {
          'Latitude': `${lat.toFixed(6)}°`,
          'Longitude': `${lon.toFixed(6)}°`,
          'Area': `${Number(p.area_km2).toFixed(4)} km²`,
          'Major Axis': `${Number(p.major_axis_km).toFixed(3)} km`,
          'Minor Axis': `${Number(p.minor_axis_km).toFixed(3)} km`,
          'Orientation': `${Number(p.orientation_deg).toFixed(1)}°`,
          'Confidence': `${(Number(p.confidence) * 100).toFixed(1)}%`,
          'Detector': String(p.detector || 'SAR UNet'),
        }
      });
      showPopup(e.lngLat, `
        <div style="font-family:IBM Plex Mono,monospace;font-size:11px;color:${popupText};background:${popupBg};padding:14px;border-radius:8px;border:1px solid #06b6d4;min-width:250px;box-shadow:0 8px 24px rgba(0,0,0,0.35)">
          <div style="color:#0891b2;font-weight:bold;font-size:12px;margin-bottom:8px;border-bottom:1px solid ${popupBorder};padding-bottom:6px;letter-spacing:0.04em">Detected Centroid</div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:${popupMuted}">Longitude:</span><strong>${lon}</strong></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="color:${popupMuted}">Latitude:</span><strong>${lat}</strong></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:${popupMuted}">Area:</span><span>${Number(p.area_km2).toFixed(4)} km²</span></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:${popupMuted}">Major Axis:</span><span>${Number(p.major_axis_km).toFixed(3)} km</span></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:${popupMuted}">Minor Axis:</span><span>${Number(p.minor_axis_km).toFixed(3)} km</span></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:${popupMuted}">Orientation:</span><span>${Number(p.orientation_deg).toFixed(1)}°</span></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:${popupMuted}">Confidence:</span><span style="color:#10b981;font-weight:bold">${(Number(p.confidence) * 100).toFixed(1)}%</span></div>
          <div style="display:flex;justify-content:space-between"><span style="color:${popupMuted}">Detector:</span><span>${String(p.detector || '—')}</span></div>
        </div>
      `);
    });

    // C1 Polygon Fill & Line click
    const handleC1SpillClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      (e.originalEvent as any)._handledByFeature = true;
      const feat = e.features?.[0];
      if (!feat) return;
      const p = feat.properties as Record<string, any>;
      const lat = Number(contract1Ref.current?.centroid?.[1] ?? e.lngLat.lat);
      const lon = Number(contract1Ref.current?.centroid?.[0] ?? e.lngLat.lng);
      onClickCoordRef.current?.({ lat, lon });
      onFeatureClickRef.current?.({
        lat,
        lon,
        title: 'Contract 1: Detected Spill',
        subtitle: `Confidence: ${(Number(p.confidence || 0) * 100).toFixed(1)}%`,
        badge: 'C1 SPILL',
        badgeColor: '#06b6d4',
        properties: {
          'Latitude': `${lat.toFixed(6)}°`,
          'Longitude': `${lon.toFixed(6)}°`,
          'Area': `${Number(p.area_km2 || 0).toFixed(4)} km²`,
          'Major Axis': `${Number(p.major_axis_km || 0).toFixed(3)} km`,
          'Minor Axis': `${Number(p.minor_axis_km || 0).toFixed(3)} km`,
          'Orientation': `${Number(p.orientation_deg || 0).toFixed(1)}°`,
          'Confidence': `${(Number(p.confidence || 0) * 100).toFixed(1)}%`,
          'Detector': String(p.detector || '—'),
        }
      });
      showPopup(e.lngLat, `
        <div style="font-family:IBM Plex Mono,monospace;font-size:11px;color:${popupText};background:${popupBg};padding:14px;border-radius:8px;border:1px solid #06b6d4;min-width:250px;box-shadow:0 8px 24px rgba(0,0,0,0.35)">
          <div style="color:#0891b2;font-weight:bold;font-size:12px;margin-bottom:8px;border-bottom:1px solid ${popupBorder};padding-bottom:6px;letter-spacing:0.04em">CONTRACT 1 — DETECTED SPILL</div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:${popupMuted}">Latitude:</span><strong>${lat}</strong></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:${popupMuted}">Longitude:</span><strong>${lon}</strong></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:${popupMuted}">Area:</span><span>${Number(p.area_km2 || 0).toFixed(4)} km²</span></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:${popupMuted}">Major Axis:</span><span>${Number(p.major_axis_km || 0).toFixed(3)} km</span></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:${popupMuted}">Minor Axis:</span><span>${Number(p.minor_axis_km || 0).toFixed(3)} km</span></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:${popupMuted}">Orientation:</span><span>${Number(p.orientation_deg || 0).toFixed(1)}°</span></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:${popupMuted}">Confidence:</span><span style="color:#10b981;font-weight:bold">${(Number(p.confidence || 0) * 100).toFixed(1)}%</span></div>
          <div style="display:flex;justify-content:space-between"><span style="color:${popupMuted}">Detector:</span><span>${String(p.detector || '—')}</span></div>
        </div>
      `);
    };

    map.on('click', LAYER.c1Fill, handleC1SpillClick);
    map.on('click', LAYER.c1Line, handleC1SpillClick);

    // Corridor big search horizon circle & nodes click
    const handleCorridorClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      (e.originalEvent as any)._handledByFeature = true;
      const feat = e.features?.[0];
      if (!feat) return;
      const p = feat.properties as Record<string, any>;

      if (p.is_big_horizon) {
        const originLat = Number(p.origin_lat);
        const originLon = Number(p.origin_lon);
        const lastLat = Number(p.last_lat);
        const lastLon = Number(p.last_lon);
        const radiusKm = Number(p.radius_km);
        const lastHours = p.last_hours_ago;

        onClickCoordRef.current?.({ lat: originLat, lon: originLon });
        onFeatureClickRef.current?.({
          lat: originLat,
          lon: originLon,
          title: `DRIFT SEARCH HORIZON`,
          subtitle: `Radius: ${radiusKm.toFixed(2)} km (extends to T-${lastHours}h)`,
          badge: 'DRIFT HORIZON',
          badgeColor: '#f59e0b',
          properties: {
            'Origin Lat': `${originLat.toFixed(6)}°`,
            'Origin Lon': `${originLon.toFixed(6)}°`,
            'Horizon Radius': `${radiusKm.toFixed(2)} km`,
            'Terminal Coord': `[${lastLon.toFixed(5)}, ${lastLat.toFixed(5)}]`,
            'Time Horizon': `T-${lastHours}h`,
            'Field Model': String(p.field_source || 'Analytic'),
          }
        });

        showPopup(e.lngLat, `
          <div style="font-family:'IBM Plex Mono',monospace,sans-serif;font-size:11px;color:${popupText};background:${popupBg};padding:14px;border-radius:8px;border:1.5px solid #f59e0b;min-width:230px;box-shadow:0 8px 24px rgba(0,0,0,0.35);line-height:1.4">
            <div style="color:#f59e0b;font-weight:700;font-size:12px;margin-bottom:10px;border-bottom:1px solid ${popupBorder};padding-bottom:6px;letter-spacing:0.04em">Drift Search Horizon</div>
            <div style="margin-bottom:6px">
              <div style="color:${popupMuted};font-size:10px;text-transform:uppercase;letter-spacing:0.04em">Horizon Radius:</div>
              <div style="font-weight:700;font-size:13px;color:${isDark ? '#fde68a' : '#b45309'}">${radiusKm.toFixed(2)} km</div>
            </div>
            <div style="margin-bottom:6px">
              <div style="color:${popupMuted};font-size:10px;text-transform:uppercase;letter-spacing:0.04em">Origin Center:</div>
              <div style="font-weight:600;font-size:11px">[${originLon.toFixed(5)}, ${originLat.toFixed(5)}]</div>
            </div>
            <div style="margin-bottom:6px">
              <div style="color:${popupMuted};font-size:10px;text-transform:uppercase;letter-spacing:0.04em">Terminal Node (T-${lastHours}h):</div>
              <div style="font-weight:600;font-size:11px">[${lastLon.toFixed(5)}, ${lastLat.toFixed(5)}]</div>
            </div>
            <div>
              <div style="color:${popupMuted};font-size:10px;text-transform:uppercase;letter-spacing:0.04em">Field Model:</div>
              <div style="font-weight:600;font-size:11px;color:${isDark ? '#e2e8f0' : '#1e293b'}">${p.field_source || 'Analytic'}</div>
            </div>
          </div>
        `);
        return;
      }

      const lat = Number(p.lat);
      const lon = Number(p.lon);
      const hoursAgo = p.hours_ago;
      const radiusKm = Number(p.radius_km);

      onClickCoordRef.current?.({ lat, lon });
      onFeatureClickRef.current?.({
        lat,
        lon,
        title: `DRIFT NODE`,
        subtitle: `Time: T-${hoursAgo}h`,
        badge: 'CORRIDOR',
        badgeColor: '#f59e0b',
        properties: {
          'Time': `T-${hoursAgo}h`,
          'Latitude': `${lat.toFixed(6)}°`,
          'Longitude': `${lon.toFixed(6)}°`,
        }
      });

      showPopup(e.lngLat, `
        <div style="font-family:'IBM Plex Mono',monospace,sans-serif;font-size:11px;color:${popupText};background:${popupBg};padding:14px;border-radius:8px;border:1.5px solid #f59e0b;min-width:210px;box-shadow:0 8px 24px rgba(0,0,0,0.35);line-height:1.4">
          <div style="color:#f59e0b;font-weight:700;font-size:12px;margin-bottom:10px;border-bottom:1px solid ${popupBorder};padding-bottom:6px;letter-spacing:0.04em">Drift Node</div>
          <div style="margin-bottom:6px">
            <div style="color:${popupMuted};font-size:10px;text-transform:uppercase;letter-spacing:0.04em">Time:</div>
            <div style="font-weight:700;font-size:12px;color:${isDark ? '#fde68a' : '#b45309'}">T-${hoursAgo}h</div>
          </div>
          <div style="margin-bottom:6px">
            <div style="color:${popupMuted};font-size:10px;text-transform:uppercase;letter-spacing:0.04em">Latitude:</div>
            <div style="font-weight:600;font-size:11px">${lat}</div>
          </div>
          <div style="margin-bottom:6px">
            <div style="color:${popupMuted};font-size:10px;text-transform:uppercase;letter-spacing:0.04em">Longitude:</div>
            <div style="font-weight:600;font-size:11px">${lon}</div>
          </div>
        </div>
      `);
    };

    map.on('click', LAYER.corridorNodes, handleCorridorClick);
    map.on('click', LAYER.corridorCirclesFill, handleCorridorClick);
    map.on('click', LAYER.corridorCirclesLine, handleCorridorClick);

    // Suspect click handler
    const handleSuspectClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      (e.originalEvent as any)._handledByFeature = true;
      const feat = e.features?.[0];
      if (!feat) return;
      const p = feat.properties as Record<string, any>;
      const lat = Number(p.lat);
      const lon = Number(p.lon);
      const vesselName = String(p.name || 'Unknown Vessel');
      const mmsi = String(p.mmsi || '—');
      const matchedNode = p.fits_hours_ago != null ? `T-${p.fits_hours_ago}h` : '—';

      onClickCoordRef.current?.({ lat, lon });
      onFeatureClickRef.current?.({
        lat,
        lon,
        title: 'AIS / TOP SUSPECT VESSEL',
        subtitle: `${vesselName} (MMSI: ${mmsi})`,
        badge: 'SUSPECT',
        badgeColor: '#ef4444',
        properties: {
          'Vessel Name': vesselName,
          'MMSI': mmsi,
          'Latitude': `${lat.toFixed(6)}°`,
          'Longitude': `${lon.toFixed(6)}°`,
          'Matched Node': matchedNode,
        }
      });

      showPopup(e.lngLat, `
        <div style="font-family:'IBM Plex Mono',monospace,sans-serif;font-size:11px;color:${popupText};background:${popupBg};padding:14px 16px;border-radius:8px;border:1.5px solid #ef4444;min-width:230px;box-shadow:0 8px 24px rgba(0,0,0,0.35);line-height:1.4">
          <div style="color:#ef4444;font-weight:700;font-size:12px;margin-bottom:10px;border-bottom:1px solid ${popupBorder};padding-bottom:6px;letter-spacing:0.05em">AIS / TOP SUSPECT VESSEL</div>
          <div style="margin-bottom:6px">
            <div style="color:${popupMuted};font-size:10px;text-transform:uppercase;letter-spacing:0.04em">Vessel Name:</div>
            <strong style="font-size:12px;color:${isDark ? '#fca5a5' : '#b91c1c'}">${vesselName}</strong>
          </div>
          <div style="margin-bottom:6px">
            <div style="color:${popupMuted};font-size:10px;text-transform:uppercase;letter-spacing:0.04em">MMSI:</div>
            <strong style="font-size:11px">${mmsi}</strong>
          </div>
          <div style="margin-bottom:6px">
            <div style="color:${popupMuted};font-size:10px;text-transform:uppercase;letter-spacing:0.04em">Latitude:</div>
            <strong style="font-size:11px">${lat.toFixed(6)}°</strong>
          </div>
          <div style="margin-bottom:6px">
            <div style="color:${popupMuted};font-size:10px;text-transform:uppercase;letter-spacing:0.04em">Longitude:</div>
            <strong style="font-size:11px">${lon.toFixed(6)}°</strong>
          </div>
          <div>
            <div style="color:${popupMuted};font-size:10px;text-transform:uppercase;letter-spacing:0.04em">Matched Node:</div>
            <strong style="font-size:11px;color:#0891b2">${matchedNode}</strong>
          </div>
        </div>
      `);
    };

    map.on('click', LAYER.suspect, handleSuspectClick);
    map.on('click', LAYER.suspectHalo, handleSuspectClick);
    map.on('click', LAYER.suspectLabel, handleSuspectClick);

    // Origin click handler
    const handleOriginClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      (e.originalEvent as any)._handledByFeature = true;
      const feat = e.features?.[0];
      if (!feat) return;
      const p = feat.properties as Record<string, any>;
      const lat = Number(p.lat);
      const lon = Number(p.lon);

      onClickCoordRef.current?.({ lat, lon });
      onFeatureClickRef.current?.({
        lat,
        lon,
        title: 'ORIGIN ESTIMATE',
        subtitle: `Latitude: ${lat.toFixed(6)}°, Longitude: ${lon.toFixed(6)}°`,
        badge: 'ORIGIN',
        badgeColor: '#dc2626',
        properties: {
          'Latitude': `${lat.toFixed(6)}°`,
          'Longitude': `${lon.toFixed(6)}°`,
        }
      });
      showPopup(e.lngLat, `
        <div style="font-family:'IBM Plex Mono',monospace,sans-serif;font-size:11px;color:${popupText};background:${popupBg};padding:14px 16px;border-radius:8px;border:1.5px solid #dc2626;min-width:200px;box-shadow:0 8px 24px rgba(0,0,0,0.35);line-height:1.4">
          <div style="color:#dc2626;font-weight:700;font-size:12px;margin-bottom:10px;border-bottom:1px solid ${popupBorder};padding-bottom:6px;letter-spacing:0.05em">ORIGIN ESTIMATE</div>
          <div style="margin-bottom:6px">
            <div style="color:${popupMuted};font-size:10px;text-transform:uppercase;letter-spacing:0.04em">Latitude:</div>
            <strong style="font-size:11px">${lat.toFixed(6)}°</strong>
          </div>
          <div>
            <div style="color:${popupMuted};font-size:10px;text-transform:uppercase;letter-spacing:0.04em">Longitude:</div>
            <strong style="font-size:11px">${lon.toFixed(6)}°</strong>
          </div>
        </div>
      `);
    };

    map.on('click', LAYER.origin, handleOriginClick);
    map.on('click', LAYER.originRing, handleOriginClick);
    map.on('click', LAYER.originLabel, handleOriginClick);

    // Cursor pointer on interactive layers
    [LAYER.c1Fill, LAYER.c1Centroid, LAYER.corridorCirclesFill, LAYER.corridorCirclesLine, LAYER.corridorNodes, LAYER.suspect, LAYER.suspectHalo, LAYER.suspectLabel, LAYER.origin, LAYER.originRing, LAYER.originLabel].forEach(id => {
      map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
    });
  }, [showPopup]);

  // ── Imperative API via ref ───────────────────────────────────────────────────
  React.useImperativeHandle(ref, () => ({
    fitAll: () => {
      const map = mapRef.current;
      if (!map || !mapLoadedRef.current) return;
      userInteractedRef.current = false;
      const bounds = computeBounds(contract1Ref.current, corridorRef.current, topSuspectRef.current);
      if (bounds) {
        map.fitBounds(bounds, { padding: 90, maxZoom: 11, duration: 800 });
      }
    },
    zoomToCentroid: () => {
      const map = mapRef.current;
      if (!map || !contract1Ref.current || !Array.isArray(contract1Ref.current.centroid)) return;
      const lon = Number(contract1Ref.current.centroid[0]);
      const lat = Number(contract1Ref.current.centroid[1]);
      if (isValidCoord(lat, lon)) {
        map.flyTo({ center: [lon, lat], zoom: 9, duration: 800 });
      }
    },
    zoomToCorridor: () => {
      const map = mapRef.current;
      if (!map || !corridorRef.current) return;
      const bounds = computeBounds(null, corridorRef.current, null);
      if (bounds) map.fitBounds(bounds, { padding: 80, maxZoom: 10, duration: 800 });
    },
    zoomToSuspect: () => {
      const map = mapRef.current;
      if (!map || !topSuspectRef.current) return;
      const s = topSuspectRef.current;
      const rawLon = s.lon ?? (corridorRef.current?.corridor?.find(n => n.hours_ago === s.fits_hours_ago)?.lon);
      const rawLat = s.lat ?? (corridorRef.current?.corridor?.find(n => n.hours_ago === s.fits_hours_ago)?.lat);
      if (rawLon != null && rawLat != null) {
        const lon = Number(rawLon);
        const lat = Number(rawLat);
        if (isValidCoord(lat, lon)) {
          map.flyTo({ center: [lon, lat], zoom: 10, duration: 800 });
        }
      }
    }
  }), []);

  // ── Initialize MapLibre ONCE ──────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialStyle = theme === 'dark' ? DARK_STYLE : LIGHT_STYLE;
    currentThemeRef.current = theme;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: initialStyle,
      center: [0, 20],
      zoom: 2,
      attributionControl: false,
    });
    mapRef.current = map;
    console.log("[ANALYSIS MAP] MapLibre initialized");

    map.on("error", (event) => {
      console.error("[ANALYSIS MAP] MapLibre error:", event);
    });

    // Controls: Navigation, Scale, Fullscreen
    map.addControl(new NavigationControl({ showCompass: true }), 'top-right');
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-right');
    map.addControl(new FullscreenControl(), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    // Mousemove coordinate tracking — read actual MapLibre geographic coordinates
    map.on('mousemove', (e) => {
      const lon = e.lngLat.lng;
      const lat = e.lngLat.lat;
      onHoverCoordRef.current?.({ lat, lon });
    });

    map.on('mouseout', () => {
      onHoverCoordRef.current?.(null);
    });

    // General map click — show small coordinate inspector popup on empty map
    map.on('click', (e) => {
      if ((e.originalEvent as any)?._handledByFeature) {
        return;
      }
      const lat = e.lngLat.lat;
      const lon = e.lngLat.lng;

      onClickCoordRef.current?.({ lat, lon });

      onFeatureClickRef.current?.({
        lat,
        lon,
        title: 'COORDINATE INSPECTOR',
        subtitle: 'Map Location',
        badge: 'MAP',
        badgeColor: '#0891b2',
        properties: {
          'Latitude': `${lat.toFixed(6)}°`,
          'Longitude': `${lon.toFixed(6)}°`,
        }
      });

      const isDark = themeRef.current === 'dark';
      const popupBg = isDark ? '#090e17' : '#ffffff';
      const popupText = isDark ? '#f1f5f9' : '#0f172a';
      const popupBorder = isDark ? '#223048' : '#cbd5e1';
      const popupMuted = isDark ? '#94a3b8' : '#64748b';

      showPopup(e.lngLat, `
        <div style="font-family:'IBM Plex Mono',monospace,sans-serif;font-size:11px;color:${popupText};background:${popupBg};padding:12px 14px;border-radius:8px;border:1.5px solid #0891b2;min-width:180px;box-shadow:0 8px 24px rgba(0,0,0,0.35);line-height:1.5">
          <div style="color:#0891b2;font-weight:700;font-size:11px;margin-bottom:8px;border-bottom:1px solid ${popupBorder};padding-bottom:4px;letter-spacing:0.04em">COORDINATE INSPECTOR</div>
          <div style="margin-bottom:5px;display:flex;justify-content:space-between">
            <span style="color:${popupMuted}">Latitude:</span>
            <strong style="color:${popupText}">${lat.toFixed(6)}°</strong>
          </div>
          <div style="display:flex;justify-content:space-between">
            <span style="color:${popupMuted}">Longitude:</span>
            <strong style="color:${popupText}">${lon.toFixed(6)}°</strong>
          </div>
        </div>
      `);
    });

    // Track user manual pan/zoom interaction to avoid auto-moving camera on subsequent suspect updates
    map.on('dragstart', () => {
      userInteractedRef.current = true;
    });
    map.on('zoomstart', (e) => {
      if (e.originalEvent) {
        userInteractedRef.current = true;
      }
    });

    map.on('load', () => {
      mapLoadedRef.current = true;
      setupSourcesAndLayers(map);

      // Auto fit to data on initial load
      const bounds = computeBounds(contract1Ref.current, corridorRef.current, topSuspectRef.current);
      if (bounds) {
        map.fitBounds(bounds, { padding: 90, maxZoom: 10, duration: 900 });
      }
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        mapLoadedRef.current = false;
      }
    };
  }, [setupSourcesAndLayers, onHoverCoord, onClickCoord]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Theme Switch: Preserves Camera, Data, Sources & Layers ───────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    if (theme === currentThemeRef.current) return;

    currentThemeRef.current = theme;
    const targetStyle = theme === 'dark' ? DARK_STYLE : LIGHT_STYLE;

    // Preserve geographic camera position
    const center = map.getCenter();
    const zoom = map.getZoom();
    const bearing = map.getBearing();
    const pitch = map.getPitch();

    // Switch style
    map.setStyle(targetStyle);

    // After style has loaded, re-ensure all custom sources and layers exist
    map.once('style.load', () => {
      setupSourcesAndLayers(map);
      // Restore camera
      map.jumpTo({ center, zoom, bearing, pitch });
    });
  }, [theme, setupSourcesAndLayers]);

  // ── Resize when view becomes visible ─────────────────────────────────────────
  useEffect(() => {
    if (isVisible && mapRef.current) {
      setTimeout(() => mapRef.current?.resize(), 100);
    }
  }, [isVisible]);

  // ── Reactive data updates — Contract 1 ───────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    const src = map.getSource(SOURCE.contract1) as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(buildContract1GeoJSON(contract1));
    const originSrc = map.getSource(SOURCE.origin) as maplibregl.GeoJSONSource | undefined;
    if (originSrc) originSrc.setData(buildOriginGeoJSON(contract1));

    // Also update drift horizon circle if corridor exists, as its center depends on origin estimate
    if (corridorRef.current) {
      const { circles } = buildCorridorGeoJSON(corridorRef.current, contract1);
      const circleSrc = map.getSource(SOURCE.corridorCircles) as maplibregl.GeoJSONSource | undefined;
      if (circleSrc) circleSrc.setData(circles);
    }

    if (contract1) {
      console.log("[ANALYSIS MAP] Fitting map to detection bounds");
      const bounds = computeBounds(contract1, corridor, topSuspect);
      if (bounds) map.fitBounds(bounds, { padding: 80, maxZoom: 10, duration: 800 });
    }
  }, [contract1]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reactive data updates — Corridor ─────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    const { lines, nodes, circles } = buildCorridorGeoJSON(corridor, contract1);
    const circleSrc = map.getSource(SOURCE.corridorCircles) as maplibregl.GeoJSONSource | undefined;
    const lineSrc = map.getSource(SOURCE.corridorLines) as maplibregl.GeoJSONSource | undefined;
    const nodeSrc = map.getSource(SOURCE.corridorNodes) as maplibregl.GeoJSONSource | undefined;
    if (circleSrc) circleSrc.setData(circles);
    if (lineSrc) lineSrc.setData(lines);
    if (nodeSrc) nodeSrc.setData(nodes);

    if (corridor) {
      console.log("[ANALYSIS MAP] Contract 2 corridor received:", corridor);
      console.log("[ANALYSIS MAP] Fitting map to detection bounds");
      const bounds = computeBounds(contract1, corridor, topSuspect);
      if (bounds) map.fitBounds(bounds, { padding: 80, maxZoom: 10, duration: 800 });
    }
  }, [corridor]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reactive data updates — Suspect ──────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    const src = map.getSource(SOURCE.suspect) as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(buildSuspectGeoJSON(topSuspect, corridor));

    if (topSuspect) {
      console.log("[ANALYSIS MAP] Top suspect received:", topSuspect);
    }
    // Include the suspect vessel in fit-to-data only when appropriate:
    // Do not move camera if user has manually panned or zoomed the map
    if (topSuspect && !userInteractedRef.current) {
      console.log("[ANALYSIS MAP] Fitting map to detection bounds");
      const bounds = computeBounds(contract1, corridor, topSuspect);
      if (bounds) map.fitBounds(bounds, { padding: 80, maxZoom: 10, duration: 800 });
    }
  }, [topSuspect]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Layer visibility — Contract 1 ────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    const v = gisLayers.predictedMask && !!contract1;
    [LAYER.c1Fill, LAYER.c1Line, LAYER.c1Centroid, LAYER.c1CentroidHalo].forEach(id => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', v ? 'visible' : 'none');
    });
  }, [gisLayers.predictedMask, contract1]);

  // ── Layer visibility — Corridor ───────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    const v = gisLayers.oceanCurrents && !!corridor;
    [LAYER.corridorCirclesFill, LAYER.corridorCirclesLine, LAYER.corridorNodes, LAYER.corridorLabels].forEach(id => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', v ? 'visible' : 'none');
    });
  }, [gisLayers.oceanCurrents, corridor]);

  // ── Layer visibility — Suspect ────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    const v = gisLayers.aisTracks && !!topSuspect;
    [LAYER.suspect, LAYER.suspectHalo, LAYER.suspectLabel].forEach(id => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', v ? 'visible' : 'none');
    });
  }, [gisLayers.aisTracks, topSuspect]);

  // ── Layer visibility — Origin ─────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    const v = gisLayers.originEstimate && !!contract1;
    [LAYER.origin, LAYER.originRing, LAYER.originLabel].forEach(id => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', v ? 'visible' : 'none');
    });
  }, [gisLayers.originEstimate, contract1]);

  // ── Opacity — Predicted Mask (Contract 1 fill + outline) ─────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    const opacity = (gisLayers.predictedMaskOpacity ?? 85) / 100;
    // Actually change MapLibre paint properties so the layer visibly changes transparency
    if (map.getLayer(LAYER.c1Fill)) {
      map.setPaintProperty(LAYER.c1Fill, 'fill-opacity', opacity);
    }
    if (map.getLayer(LAYER.c1Line)) {
      map.setPaintProperty(LAYER.c1Line, 'line-opacity', Math.min(1, opacity + 0.15));
    }
    if (map.getLayer(LAYER.c1CentroidHalo)) {
      map.setPaintProperty(LAYER.c1CentroidHalo, 'circle-opacity', Math.min(0.85, opacity * 0.7));
      map.setPaintProperty(LAYER.c1CentroidHalo, 'circle-stroke-opacity', Math.min(0.9, opacity));
    }
  }, [gisLayers.predictedMaskOpacity]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative"
      style={{ minHeight: '300px' }}
    />
  );
});

MapLibreAnalysisMap.displayName = 'MapLibreAnalysisMap';
