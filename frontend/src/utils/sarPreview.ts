import { fromBlob } from 'geotiff';

/**
 * Generates a browser-renderable preview URL for uploaded SAR products.
 * Handles JPG, JPEG, PNG via object URL, and decodes TIFF/TIF files using GeoTIFF into a canvas data URL.
 */
export async function generateSarPreview(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const isTiff = ext === 'tif' || ext === 'tiff';

  // For standard browser-supported image formats
  if (!isTiff && (file.type.startsWith('image/') || ext === 'jpg' || ext === 'jpeg' || ext === 'png')) {
    return URL.createObjectURL(file);
  }

  // For TIFF / GeoTIFF formats: decode rasters and render to canvas
  try {
    const tiff = await fromBlob(file);
    const image = await tiff.getImage();
    const width = image.getWidth();
    const height = image.getHeight();

    // Scale to a maximum dimension of 2048 to prevent UI memory pressure
    const maxDim = 2048;
    const scale = Math.min(1, maxDim / Math.max(width, height));
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    let rasters: any;
    let canvasW = targetW;
    let canvasH = targetH;
    try {
      rasters = await image.readRasters({
        width: targetW,
        height: targetH,
      });
    } catch {
      // Fallback to native read if downsampled reading without overviews fails
      rasters = await image.readRasters();
      canvasW = width;
      canvasH = height;
    }

    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to create 2D canvas context for TIFF raster rendering');
    }

    const imgData = ctx.createImageData(canvasW, canvasH);
    const data = imgData.data;

    // Single-band radar backscatter (grayscale SAR product)
    if (rasters.length === 1 || !rasters[1]) {
      const band = rasters[0] as unknown as ArrayLike<number>;
      let min = Infinity;
      let max = -Infinity;
      const len = band.length;

      // Sample values to compute contrast stretch min/max
      for (let i = 0; i < len; i += 2) {
        const v = band[i];
        if (Number.isFinite(v)) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }

      if (!Number.isFinite(min)) min = 0;
      if (!Number.isFinite(max) || max === min) max = min + 1;
      const range = max - min;

      for (let i = 0; i < len; i++) {
        const v = band[i];
        const val = Number.isFinite(v)
          ? Math.min(255, Math.max(0, Math.round(((v - min) / range) * 255)))
          : 0;
        const idx = i * 4;
        data[idx] = val;     // Red
        data[idx + 1] = val; // Green
        data[idx + 2] = val; // Blue
        data[idx + 3] = 255; // Alpha
      }
    } else {
      // Multi-band (e.g. RGB or dual-pol)
      const rBand = rasters[0] as unknown as ArrayLike<number>;
      const gBand = rasters[1] as unknown as ArrayLike<number>;
      const bBand = rasters[2] ? (rasters[2] as unknown as ArrayLike<number>) : gBand;
      const len = rBand.length;

      for (let i = 0; i < len; i++) {
        const idx = i * 4;
        data[idx] = Math.min(255, Math.max(0, Math.round(Number(rBand[i]) || 0)));
        data[idx + 1] = Math.min(255, Math.max(0, Math.round(Number(gBand[i]) || 0)));
        data[idx + 2] = Math.min(255, Math.max(0, Math.round(Number(bBand[i]) || 0)));
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.error('[SAR PREVIEW] Error decoding TIFF with GeoTIFF:', err);
    throw err;
  }
}
