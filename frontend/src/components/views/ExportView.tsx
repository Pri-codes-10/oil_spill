import React, { useState } from 'react';
import { MorphologicalProperties, SceneMetadata, VesselSuspect } from '../../types';
import { 
  FileText, 
  Download, 
  Copy, 
  Check, 
  Eye, 
  Database, 
  ShieldCheck, 
  Lock, 
  ExternalLink,
  CheckCircle2,
  FileSpreadsheet,
  FileCode,
  Share2,
  BadgeAlert,
  ChevronRight
} from 'lucide-react';

interface ExportViewProps {
  currentScene: SceneMetadata;
  detection: MorphologicalProperties;
  topSuspect: VesselSuspect;
  onOpenReportPreview: () => void;
}

export const ExportView: React.FC<ExportViewProps> = ({
  currentScene,
  detection,
  topSuspect,
  onOpenReportPreview
}) => {
  const [copiedRef, setCopiedRef] = useState<boolean>(false);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  const incidentRefId = 'OPS-2023-1024-XRAY';

  const copyToClipboard = () => {
    navigator.clipboard.writeText(incidentRefId);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2000);
  };

  const handleDownloadGeoJSON = () => {
    const geojsonData = {
      type: "FeatureCollection",
      crs: { type: "name", properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" } },
      features: [
        {
          type: "Feature",
          properties: {
            id: detection.id || "DET-001", title: detection.title,
            classification: detection.classification, slick_type: detection.slickType,
            confidence: detection.confidence, status: detection.status,
            area_km2: detection.areaKm2, perimeter_km: detection.perimeterKm,
            major_axis_km: detection.majorAxisKm, minor_axis_km: detection.minorAxisKm,
            bearing_deg: detection.bearingDeg, estimated_volume_m3: detection.estimatedVolumeM3,
            estimated_volume_bbl: detection.estimatedVolumeBbl, mean_thickness_um: detection.thicknessUm,
            contrast_ratio_db: detection.contrastRatioDb, marangoni_damping: detection.dampingRatio,
            sensor: currentScene.satellite, acquisition_utc: currentScene.acquisition
          },
          geometry: {
            type: "Polygon",
            coordinates: [[[currentScene.lon - 0.02, currentScene.lat - 0.01],[currentScene.lon + 0.01, currentScene.lat - 0.02],[currentScene.lon + 0.03, currentScene.lat + 0.01],[currentScene.lon - 0.01, currentScene.lat + 0.02],[currentScene.lon - 0.02, currentScene.lat - 0.01]]]
          }
        },
        {
          type: "Feature",
          properties: { suspect: topSuspect.name, mmsi: topSuspect.mmsi, score: topSuspect.score, flag: topSuspect.flag },
          geometry: { type: "Point", coordinates: [currentScene.lon, currentScene.lat] }
        }
      ]
    };
    const blob = new Blob([JSON.stringify(geojsonData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `maritime_incident_${incidentRefId}.geojson`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloadSuccess('GeoJSON exported successfully');
    setTimeout(() => setDownloadSuccess(null), 3000);
  };

  const handleDownloadCSV = () => {
    const csvRows = [
      ["Metric", "Value", "Notes"],
      ["Incident Reference", incidentRefId, "Chain of custody verified"],
      ["Scene ID", currentScene.id, currentScene.name],
      ["Sensor", currentScene.satellite, currentScene.mode],
      ["Acquisition Time", currentScene.acquisition, "UTC timestamp"],
      ["Coordinates", currentScene.coordinates, "WGS84"],
      ["Target Detection ID", detection.id, detection.title],
      ["Detected Slick Area", `${detection.areaKm2} km2`, "SAR backscatter dampening"],
      ["Estimated Volume (m3)", `${detection.estimatedVolumeM3} m3`, `${detection.estimatedVolumeBbl} bbl`],
      ["Mean Layer Thickness", `${detection.thicknessUm} µm`, "Marangoni wave damping index"],
      ["SAR Contrast Ratio", `${detection.contrastRatioDb} dB`, `Backscatter min: ${detection.backscatterMinDb} dB`],
      ["Classification", detection.classification, `${detection.confidence}% confidence (${detection.status})`],
      ["Estimated Age", detection.estimatedAge, "Hindcast derived"],
      ["Primary Suspect", topSuspect.name, `MMSI: ${topSuspect.mmsi}`],
      ["Attribution Score", `${topSuspect.score}%`, "Proximity, timing, heading, speed"],
      ["Speed Anomaly", "5.4 kt (T-14h)", "Observed speed drop during release window"]
    ];
    const csvContent = csvRows.map(e => e.map(cell => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `incident_telemetry_${incidentRefId}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloadSuccess('CSV dataset exported successfully');
    setTimeout(() => setDownloadSuccess(null), 3000);
  };

  return (
    <div
      className="flex-1 flex flex-col h-[calc(100vh-72px)] overflow-y-auto p-6 lg:p-8"
      style={{ background: 'var(--gov-bg)' }}
    >
      <div className="max-w-6xl mx-auto w-full flex flex-col gap-6">

        {/* Breadcrumb + heading */}
        <div>
          <div className="flex items-center gap-1.5 text-xs mb-3" style={{ color: 'var(--gov-text-muted)' }}>
            <span>AquaTrace Portal</span>
            <ChevronRight className="w-3 h-3" />
            <span style={{ color: 'var(--gov-navy)', fontWeight: 600 }}>Case Export</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5" style={{ borderBottom: '2px solid var(--gov-navy)' }}>
            <div className="pl-4" style={{ borderLeft: '4px solid var(--gov-green)' }}>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--gov-green)' }}>
                <ShieldCheck className="w-4 h-4" />
                Forensic Artifacts & Evidence Export
              </div>
              <h1 className="text-xl font-bold" style={{ color: 'var(--gov-navy)' }}>
                Case Conclusion & Intelligence Package
              </h1>
              <p className="text-sm mt-1" style={{ color: 'var(--gov-text-secondary)' }}>
                Export verified satellite intelligence packages, GIS telemetry artifacts, and sealed legal incident dossiers.
              </p>
            </div>
            <span className="tag tag-active text-xs shrink-0">Chain of Custody Active</span>
          </div>
        </div>

        {/* Success toast */}
        {downloadSuccess && (
          <div className="gov-alert-success">
            <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--gov-green)' }} />
            <span>{downloadSuccess}</span>
          </div>
        )}

        {/* 3 Export Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Card 1: PDF Report */}
          <div
            className="p-6 flex flex-col justify-between"
            style={{
              background: 'var(--gov-surface)',
              border: '1px solid var(--gov-border)',
              borderTop: '3px solid var(--gov-navy)',
              borderRadius: '2px'
            }}
          >
            <div className="flex flex-col gap-3">
              <div
                className="w-12 h-12 flex items-center justify-center"
                style={{ background: 'var(--gov-navy-light)', border: '1px solid var(--gov-navy)', borderRadius: '2px' }}
              >
                <FileText className="w-6 h-6" style={{ color: 'var(--gov-navy)' }} />
              </div>
              <div>
                <h3 className="text-base font-bold" style={{ color: 'var(--gov-navy)' }}>
                  Official Case Report (PDF)
                </h3>
                <p className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--gov-text-secondary)' }}>
                  Full forensic case dossier including SAR detection telemetry, numerical hindcast trajectories, and AIS match logs.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 mt-6">
              <button
                id="preview-report-btn"
                onClick={onOpenReportPreview}
                className="w-full py-2.5 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer"
                style={{ background: 'var(--gov-navy)', color: '#ffffff', border: 'none', borderRadius: '2px' }}
              >
                <Eye className="w-4 h-4" />
                <span>Preview Report</span>
              </button>
              <button
                onClick={onOpenReportPreview}
                className="w-full py-2.5 flex items-center justify-center gap-2 text-xs font-semibold transition-colors cursor-pointer"
                style={{
                  background: 'var(--gov-surface)', color: 'var(--gov-navy)',
                  border: '1.5px solid var(--gov-navy)', borderRadius: '2px'
                }}
              >
                <Download className="w-4 h-4" />
                <span>Download PDF Dossier</span>
              </button>
            </div>
          </div>

          {/* Card 2: GIS Data */}
          <div
            className="p-6 flex flex-col justify-between"
            style={{
              background: 'var(--gov-surface)',
              border: '1px solid var(--gov-border)',
              borderTop: '3px solid var(--gov-green)',
              borderRadius: '2px'
            }}
          >
            <div className="flex flex-col gap-3">
              <div
                className="w-12 h-12 flex items-center justify-center"
                style={{ background: 'var(--gov-green-light)', border: '1px solid var(--gov-green)', borderRadius: '2px' }}
              >
                <Database className="w-6 h-6" style={{ color: 'var(--gov-green)' }} />
              </div>
              <div>
                <h3 className="text-base font-bold" style={{ color: 'var(--gov-navy)' }}>
                  GIS Vector Datasets
                </h3>
                <p className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--gov-text-secondary)' }}>
                  Raw polygon boundary vectors, hindcast dispersion ellipses, and vessel track waypoints for QGIS / ArcGIS.
                </p>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                id="export-geojson-btn"
                onClick={handleDownloadGeoJSON}
                className="flex-1 py-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer"
                style={{
                  background: 'var(--gov-green)', color: '#ffffff',
                  border: 'none', borderRadius: '2px'
                }}
              >
                <FileCode className="w-4 h-4" /><span>GeoJSON</span>
              </button>
              <button
                id="export-csv-btn"
                onClick={handleDownloadCSV}
                className="flex-1 py-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer"
                style={{
                  background: 'var(--gov-surface)', color: 'var(--gov-green)',
                  border: '1.5px solid var(--gov-green)', borderRadius: '2px'
                }}
              >
                <FileSpreadsheet className="w-4 h-4" /><span>CSV Table</span>
              </button>
            </div>
          </div>

          {/* Card 3: Chain-of-custody */}
          <div
            className="p-6 flex flex-col justify-between"
            style={{
              background: 'var(--gov-surface)',
              border: '1px solid var(--gov-border)',
              borderTop: '3px solid var(--gov-saffron)',
              borderRadius: '2px'
            }}
          >
            <div className="flex flex-col gap-3">
              <div
                className="w-12 h-12 flex items-center justify-center"
                style={{ background: 'var(--gov-warning-bg)', border: '1px solid var(--gov-saffron)', borderRadius: '2px' }}
              >
                <Lock className="w-6 h-6" style={{ color: 'var(--gov-saffron-dim)' }} />
              </div>
              <div>
                <h3 className="text-base font-bold" style={{ color: 'var(--gov-navy)' }}>
                  Chain-of-Custody Token
                </h3>
                <p className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--gov-text-secondary)' }}>
                  Cryptographic forensic token and immutable reference verified for maritime regulatory authorities (EMSA / IMO).
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-col gap-2">
              <div
                className="flex items-center justify-between px-3 py-2"
                style={{ background: 'var(--gov-surface-alt)', border: '1px solid var(--gov-border)', borderRadius: '2px' }}
              >
                <span className="font-mono text-xs font-bold tracking-wider" style={{ color: 'var(--gov-navy)' }}>
                  {incidentRefId}
                </span>
                <button
                  onClick={copyToClipboard}
                  className="p-1 rounded cursor-pointer transition-colors"
                  style={{ color: 'var(--gov-text-muted)' }}
                  title="Copy Reference"
                >
                  {copiedRef ? <Check className="w-4 h-4" style={{ color: 'var(--gov-green)' }} /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex items-center justify-between text-[11px] px-1 font-medium" style={{ color: 'var(--gov-text-muted)' }}>
                <span>Authentication:</span>
                <span className="flex items-center gap-1 font-semibold" style={{ color: 'var(--gov-green)' }}>
                  <ShieldCheck className="w-3.5 h-3.5" /> Sealed & Verified
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Audit Table */}
        <div
          style={{ background: 'var(--gov-surface)', border: '1px solid var(--gov-border)', borderRadius: '2px', overflow: 'hidden' }}
        >
          {/* Table header */}
          <div
            className="px-5 py-3 flex justify-between items-center"
            style={{ background: 'var(--gov-surface-alt)', borderBottom: '2px solid var(--gov-navy)' }}
          >
            <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--gov-navy)' }}>
              <FileSpreadsheet className="w-4 h-4" style={{ color: 'var(--gov-saffron)' }} />
              Operational Audit Record
            </span>
            <span className="font-mono text-xs" style={{ color: 'var(--gov-text-muted)' }}>
              Logged: {new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC
            </span>
          </div>

          {/* Table rows */}
          <div className="divide-y" style={{ divideColor: 'var(--gov-border)' }}>
            {[
              { label: 'Scene Reference', value: `${currentScene.name} (${currentScene.satellite})`, highlight: false },
              { label: 'Target Anomaly', value: `${detection.id}: ${detection.title} · ${detection.areaKm2} km² (${detection.estimatedVolumeM3} m³ est. volume, ${detection.confidence}% Confidence)`, highlight: true },
              { label: 'Hindcast Drift Window', value: '14:00–18:00 UTC (T-14h to T-10h)', color: 'var(--gov-navy)', highlight: false },
              { label: 'Attributed Vessel', value: `${topSuspect.name} (MMSI ${topSuspect.mmsi}, ${topSuspect.flag})`, color: 'var(--gov-saffron-dim)', highlight: true },
              { label: 'Attribution Score', value: `${topSuspect.score}% Match (Proximity 98%, Timing 92%)`, color: 'var(--gov-green)', highlight: false },
              { label: 'System Operator', value: 'SO-4092 (Automated Sentinel Core)', highlight: true },
            ].map((row, idx) => (
              <div
                key={idx}
                className="grid grid-cols-1 sm:grid-cols-3 px-5 py-3 text-xs"
                style={{ background: row.highlight ? 'var(--gov-surface-alt)' : 'transparent' }}
              >
                <span className="font-semibold" style={{ color: 'var(--gov-text-secondary)' }}>{row.label}</span>
                <span className="sm:col-span-2 font-mono" style={{ color: row.color || 'var(--gov-text-primary)' }}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};
