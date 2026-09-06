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
  detector: "threshold" | "unet";
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