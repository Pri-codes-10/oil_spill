import { AttributionResponse, CorridorResponse } from "../types";

const API_BASE_URL = "http://127.0.0.1:8000";

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
  detector: "threshold" | "unet" | "yolov8";
  overlay_image?: string;
}

export async function getMockDetection(): Promise<DetectionResponse> {
  const response = await fetch(`${API_BASE_URL}/api/ingest/mock`);

  if (!response.ok) {
    throw new Error(`Backend error: ${response.status}`);
  }

  return response.json();
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

  return response.json();
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

  return response.json();
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

  return response.json();
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

  return response.json();
}