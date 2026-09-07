export type ActiveTab = 'ingest' | 'map' | 'analysis' | 'detection' | 'drift' | 'suspects' | 'export';


export interface MorphologicalProperties {
  id: string;
  title: string;
  areaKm2: number;
  perimeterKm?: number | string;
  majorAxisKm: number;
  minorAxisKm: number;
  bearingDeg: number;
  centroid: string;
  confidence: number;
  estimatedAge?: string;
  classification?: string;
  classificationDescription?: string;
  gsd?: string;
  slickType?: string;
  status?: string;
  contrastRatioDb?: number | string;
  dampingRatio?: number | string;
  edgeGradient?: number | string;
  thicknessUm?: number | string;
  estimatedVolumeM3?: number | string;
  estimatedVolumeBbl?: number | string;
  backscatterMinDb?: number | string;
  backscatterMeanDb?: number | string;
  oceanBackgroundDb?: number | string;
  detector?: string;
  observedAt?: string;
  crs?: string;
}

export interface SceneMetadata {
  id: string;
  backendScenePath?: string;
  name: string;
  satellite: string;
  acquisition: string;
  orbit: string;
  mode: string;
  polarisations: string;
  coordinates: string;
  lat: number;
  lon: number;
  locationName: string;
  thumbnailUrl: string;
  mapImageUrl: string;
  detectionImageUrl: string;
  detections?: MorphologicalProperties[];
}

export interface GisLayers {
  marineTraffic?: boolean;
  sarBackscatter: boolean;
  predictedMask: boolean;
  predictedMaskOpacity: number;
  confidenceHeatmap: boolean;
  oceanCurrents: boolean;
  aisTracks: boolean;
  originEstimate: boolean;
}

export interface VesselSuspect {
  id: string;
  rank: number;
  name: string;
  mmsi: string;
  flag: string;
  type: string;
  score: number;
  proximityScore: number;
  headingMatchScore: number;
  timingScore: number;
  speedProfileScore: number;
  aisStatus: 'NO GAP' | 'GAP DETECTED (3.2h)' | 'INTERMITTENT';
  speedHistory: { time: string; knots: number; isAnomaly?: boolean }[];
  pings: { time: string; active: boolean; isGap?: boolean }[];
  trackPoints: { x: number; y: number }[];
  details: {
    imo: string;
    callsign: string;
    destination: string;
    eta: string;
    draught: string;
    length: string;
  };
}

export interface EnvironmentalInputs {
  currentModel: 'HYCOM' | 'NEMO' | 'COPERNICUS';
  windModel: 'GFS' | 'ECMWF' | 'HRRR';
  resolution: string;
  leewayCoeff: number;
  waterTemp: string;
  waveHeight: string;
}

export interface OperationNotification {
  id: string;
  title: string;
  message: string;
  time: string;
  type: 'alert' | 'info' | 'success';
  unread: boolean;
}

export interface CorridorNode {
  hours_ago: number;
  lat: number;
  lon: number;
  radius_km: number;
}

export interface CorridorResponse {
  observed_at: string;
  corridor: CorridorNode[];
  field_source: 'analytic' | 'cmems_era5';
}

export interface SuspectFactors {
  heading_alignment: number;
  proximity: number;
  temporal: number;
  speed_anomaly: number;
  transponder_gap: number;
}

export interface Suspect {
  mmsi: number;
  name: string;
  score: number;
  factors: SuspectFactors;
  weights: SuspectFactors;
  fits_hours_ago: number;
  distance_km: number;
  matched_at: string;
  evidence: string;
  rank: number;
  lat?: number;
  lon?: number;
  latitude?: number;
  longitude?: number;
  position?: { lat: number; lon: number };
}

export interface AttributionResponse {
  ais_source: string;
  suspects: Suspect[];
}
