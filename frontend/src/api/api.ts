import { AttributionResponse, CorridorResponse, MorphologicalProperties } from "../types";

export const API_BASE_URL = "http://127.0.0.1:8000";

export interface DetectionResponse {
  observed_at: string;
  crs: string;
  polygon: number[][][];
  area_km2: number;
  major_axis_km: number;
  minor_axis_km: number;
  orientation_deg: number;
  centroid: [number, number];
  confidence: number;
  detector: "threshold" | "unet" | "yolov8" | string;
  overlay_image?: string;
}

export function createDetectionFromContract1(
  c1: DetectionResponse,
  scene: { name: string; id: string }
): MorphologicalProperties {
  const confidencePercent = Math.round(c1.confidence * 100);
  const centroidStr = `${c1.centroid[1].toFixed(4)}°N, ${c1.centroid[0].toFixed(4)}°E`;

  return {
    id: 'DET-001',
    title: `${scene.name} Slick Anomaly`,
    areaKm2: c1.area_km2,
    majorAxisKm: c1.major_axis_km,
    minorAxisKm: c1.minor_axis_km,
    bearingDeg: Math.round(c1.orientation_deg),
    centroid: centroidStr,
    confidence: confidencePercent,
    status: confidencePercent >= 70 ? 'CONFIRMED' : 'SUSPECT',
    classification: confidencePercent >= 70 ? 'CONFIRMED OIL SLICK' : 'SUSPECT ANOMALY',
    classificationDescription: `Backend ${c1.detector} detector identified dark formation at ${c1.observed_at}. Area: ${c1.area_km2} km², major axis: ${c1.major_axis_km} km.`,
    detector: c1.detector,
    observedAt: c1.observed_at,
    crs: c1.crs,
    perimeterKm: undefined,
    estimatedAge: undefined,
    gsd: undefined,
    slickType: undefined,
    contrastRatioDb: undefined,
    dampingRatio: undefined,
    edgeGradient: undefined,
    thicknessUm: undefined,
    estimatedVolumeM3: undefined,
    estimatedVolumeBbl: undefined,
    backscatterMinDb: undefined,
    backscatterMeanDb: undefined,
    oceanBackgroundDb: undefined,
  };
}

export async function getMockDetection(): Promise<DetectionResponse> {
  const response = await fetch(`${API_BASE_URL}/api/ingest/mock`);

  if (!response.ok) {
    throw new Error(`Backend error: ${response.status}`);
  }

  return response.json();
}

function logContract1(raw: any) {
  console.log("CONTRACT 1 RAW RESPONSE", raw);
  console.log("observed_at:", raw?.observed_at);
  console.log("centroid:", raw?.centroid);
  console.log("polygon:", raw?.polygon);
  console.log("area_km2:", raw?.area_km2);
  console.log("major_axis_km:", raw?.major_axis_km);
  console.log("minor_axis_km:", raw?.minor_axis_km);
  console.log("orientation_deg:", raw?.orientation_deg);
  console.log("confidence:", raw?.confidence);
  console.log("detector:", raw?.detector);
}

function logContract2(raw: any) {
  console.log("CONTRACT 2 RAW RESPONSE", raw);
  console.log("corridor:", raw?.corridor);
  if (Array.isArray(raw?.corridor)) {
    raw.corridor.forEach((node: any, idx: number) => {
      console.log(`Corridor Node ${idx + 1}:`, {
        hours_ago: node.hours_ago,
        lat: node.lat,
        lon: node.lon,
        radius_km: node.radius_km
      });
    });
  }
}

function logAttribution(raw: any) {
  console.log("ATTRIBUTION / AIS RAW RESPONSE", raw);
  console.log("suspects:", raw?.suspects);
  if (Array.isArray(raw?.suspects)) {
    raw.suspects.forEach((vessel: any, idx: number) => {
      console.log(`Raw Suspect Vessel ${idx + 1}:`, vessel);
    });
  }
}

export async function detectScene(
  scenePath = "synthetic"
): Promise<DetectionResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/ingest/detect`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scene_path: scenePath,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      errorText || `Backend error: ${response.status}`
    );
  }

  const data = await response.json();
  logContract1(data);
  return data;
}

export async function uploadScene(file: File): Promise<DetectionResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/ingest/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Backend error: ${response.status}`);
  }

  const data = await response.json();
  logContract1(data);
  return data;
}

export async function getCorridor(
  contract1: DetectionResponse,
  fieldSource: "analytic" | "cmems_era5" = "analytic"
): Promise<CorridorResponse> {
  const response = await fetch(`${API_BASE_URL}/api/drift/corridor`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contract1,
      field_source: fieldSource,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Backend error: ${response.status}`);
  }

  const data = await response.json();
  logContract2(data);
  return data;
}

export async function rankSuspects(
  contract2: CorridorResponse,
  slickBearingDeg: number
): Promise<AttributionResponse> {
  const response = await fetch(`${API_BASE_URL}/api/attribution/rank`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contract2,
      slick_bearing_deg: slickBearingDeg,
      use_synthetic_ais: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Backend error: ${response.status}`);
  }

  const data = await response.json();
  logAttribution(data);
  return data;
}