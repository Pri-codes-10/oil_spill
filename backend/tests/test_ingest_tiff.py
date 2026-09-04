"""Verification of the ingest pipeline against a GeoTIFF measurement band."""

from pathlib import Path

import numpy as np
import rasterio
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
    assert result["detector"] == "threshold"
    assert result["area_km2"] > 0
    assert result["confidence"] > 0


def test_detect_scene_reports_incomplete_safe(tmp_path):
    safe_dir = tmp_path / SAFE_NAME
    safe_dir.mkdir()

    try:
        pipeline.detect_scene(safe_dir)
    except FileNotFoundError as exc:
        assert "no VV measurement TIFF" in str(exc)
    else:
        raise AssertionError("an incomplete SAFE product should fail clearly")