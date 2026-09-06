export interface LatLon {
  lat: number;
  lon: number;
}

// Detection centroids are stored as display strings, e.g. "58.3421°N, 2.1190°E"
// or "9.1420°N, 79.7210°W" (see IngestView's real-backend assignment and
// data.ts's demo fixtures) — parse back to signed decimal degrees.
export function parseCentroidString(centroid: string): LatLon | null {
  const match = centroid.match(/(-?\d+\.?\d*)\s*°?\s*([NS])\s*,\s*(-?\d+\.?\d*)\s*°?\s*([EW])/i);
  if (!match) return null;
  const [, latStr, latDir, lonStr, lonDir] = match;
  let lat = parseFloat(latStr);
  let lon = parseFloat(lonStr);
  if (latDir.toUpperCase() === 'S') lat = -lat;
  if (lonDir.toUpperCase() === 'W') lon = -lon;
  return { lat, lon };
}

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Builds a projector from a set of lat/lon points onto an SVG viewBox.
 * Fits the bounding box of the given points into [padding, size - padding],
 * flipping y since latitude increases north but SVG y increases downward.
 */
export function projectPoints(
  points: LatLon[],
  width = 1000,
  height = 800,
  padding = 120
): (p: LatLon) => Point2D {
  if (points.length === 0) {
    return () => ({ x: width / 2, y: height / 2 });
  }

  let minLat = Math.min(...points.map((p) => p.lat));
  let maxLat = Math.max(...points.map((p) => p.lat));
  let minLon = Math.min(...points.map((p) => p.lon));
  let maxLon = Math.max(...points.map((p) => p.lon));

  // Degenerate bounding box (single point, or all points identical) --
  // give it a small span so the projection doesn't divide by zero.
  if (maxLat - minLat < 1e-6) {
    minLat -= 0.05;
    maxLat += 0.05;
  }
  if (maxLon - minLon < 1e-6) {
    minLon -= 0.05;
    maxLon += 0.05;
  }

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  return (p: LatLon) => {
    const xRatio = (p.lon - minLon) / (maxLon - minLon);
    const yRatio = (p.lat - minLat) / (maxLat - minLat);
    return {
      x: padding + xRatio * innerWidth,
      y: padding + (1 - yRatio) * innerHeight,
    };
  };
}
