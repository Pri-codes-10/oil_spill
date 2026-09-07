"""Verification of the ingest pipeline against a GeoTIFF measurement band."""

from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.transform import from_origin

from app.ingest import pipeline, reader


SAFE_NAME = "S1A_IW_GRDH_1SSV_20170205T124945_20170205T124959_015149_018C75_5E96.SAFE"


def test_detect_scene_reads_and_processes_vv_tiff(tmp_path):
    safe_dir = tmp_path / SAFE_NAME
    measurement_dir = safe_dir / "measurement"
    measurement_dir.mkdir(parents=True)
    tiff_path = measurement_dir / "s1a-iw-grd-vv-20170205t124945-20170205t124959-015149-018c75-001.tiff"

    data = np.full((512, 512), 4, dtype="uint16")
    data[250:262, 120:390] = 1
    transform = from_origin(33.0, 32.6, 0.0001, 0.0001)

    with rasterio.open(
        tiff_path,
        "w",
        driver="GTiff",
        height=data.shape[0],
        width=data.shape[1],
        count=1,
        dtype=data.dtype,
        crs="EPSG:4326",
        transform=transform,
    ) as dataset:
        dataset.write(data, 1)

    band, actual_transform, crs = reader.open_grd_band(tiff_path)

    assert band.dtype == np.float32
    assert band.shape == data.shape
    assert actual_transform == transform
    assert crs.to_string() == "EPSG:4326"
    assert reader.to_db(band[250, 120]) == 0.0

    result = pipeline.detect_scene(Path(safe_dir))

    assert result["observed_at"] == "2017-02-05T12:49:45Z"
    assert result["crs"] == "EPSG:4326"
    assert result["detector"] in {"threshold", "yolov8"}
    assert result["area_km2"] > 0
    assert result["confidence"] > 0


def test_amplitude_dn_is_converted_to_db():
    """Raw GRD amplitude DN is a magnitude — it must still go through to_db()."""
    amplitude = np.full((64, 64), 4.0, dtype="float32")

    assert not reader.is_db_scale(amplitude)
    assert reader.to_db_if_needed(amplitude)[0, 0] == reader.to_db(amplitude)[0, 0]


def test_calibrated_db_is_not_converted_twice():
    """Products shipping calibrated Sigma0 in dB must pass through untouched.

    Guards the bug where a -34 dB water pixel became +31 dB, landing far
    outside config's SAR_DB_MIN/SAR_DB_MAX and wrecking detection.
    """
    sigma0_db = np.full((64, 64), -34.0, dtype="float32")

    assert reader.is_db_scale(sigma0_db)
    assert np.array_equal(reader.to_db_if_needed(sigma0_db), sigma0_db)


def test_dual_pol_tiff_uses_real_vh_band(tmp_path):
    """Band 2 must reach the detector rather than being replaced by a VV copy."""
    tiff_path = tmp_path / "dual-pol-sigma0.tif"
    vv = np.full((256, 256), -22.0, dtype="float32")
    vh = np.full((256, 256), -31.0, dtype="float32")

    with rasterio.open(
        tiff_path, "w", driver="GTiff",
        height=256, width=256, count=2, dtype="float32",
        crs="EPSG:4326", transform=from_origin(33.0, 32.6, 0.0001, 0.0001),
    ) as dataset:
        dataset.write(vv, 1)
        dataset.write(vh, 2)

    assert reader.band_count(tiff_path) == 2

    band2, _, _ = reader.open_grd_band(tiff_path, band=2)
    assert np.allclose(band2, vh)


def test_detect_scene_reports_incomplete_safe(tmp_path):
    safe_dir = tmp_path / SAFE_NAME
    safe_dir.mkdir()

    try:
        pipeline.detect_scene(safe_dir)
    except FileNotFoundError as exc:
        assert "no VV measurement TIFF" in str(exc)
    else:
        raise AssertionError("an incomplete SAFE product should fail clearly")


def test_detect_scene_reads_jpg_image(tmp_path):
    image = np.full((512, 512), 220, dtype=np.uint8)
    image[220:300, 100:420] = 20
    jpg_path = tmp_path / "oil-spill-test.jpg"
    Image.fromarray(image, mode="L").save(jpg_path, quality=100)

    result = pipeline.detect_scene(jpg_path)

    assert result["area_km2"] > 0
    assert result["detector"] in {"threshold", "yolov8"}
    assert result["overlay_image"].startswith("data:image/png;base64,")