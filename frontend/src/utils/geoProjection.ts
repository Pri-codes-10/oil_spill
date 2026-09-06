export interface LatLon {
  lat: number;
  lon: number;
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
