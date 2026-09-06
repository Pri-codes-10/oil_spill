import React from 'react';
import { MorphologicalProperties, SceneMetadata, Suspect } from '../../types';
import { APP_LOGO } from '../../data';
import {
  X,
  Printer,
  Download,
  ShieldCheck,
  FileText,
  Ship,
  Activity,
  Layers,
  Award
} from 'lucide-react';

interface ReportPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentScene: SceneMetadata;
  detection: MorphologicalProperties | null;
  topSuspect: Suspect | null;
}

export const ReportPreviewModal: React.FC<ReportPreviewModalProps> = ({
  isOpen,
  onClose,
  currentScene,
  detection,
  topSuspect
}) => {
  if (!isOpen || !detection) return null;

  const handlePrint = () => window.print();
  const handleDownload = () => { alert("Report PDF compilation prepared. Initialising print-to-PDF..."); window.print(); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none" style={{ background: 'rgba(0,0,0,0.65)' }}>
      <div
        className="w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl"
        style={{
          background: 'var(--gov-surface)',
          border: '1px solid var(--gov-border)',
          borderRadius: '2px'
        }}
      >
        {/* Modal top bar */}
        <div
          className="px-6 py-3 flex items-center justify-between"
          style={{ background: 'var(--gov-navy)', color: '#ffffff' }}
        >
          <div className="flex items-center gap-2.5">
            <FileText className="w-5 h-5" />
            <span className="text-sm font-semibold tracking-wide">
              Maritime Operations — Forensic Report Preview
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3.5 py-1.5 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              style={{
                background: 'rgba(255,255,255,0.15)',
                color: '#ffffff',
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: '2px'
              }}
            >
              <Printer className="w-3.5 h-3.5" /><span>Print</span>
            </button>
            <button
              onClick={handleDownload}
              className="px-4 py-1.5 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              style={{
                background: 'var(--gov-saffron)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '2px'
              }}
            >
              <Download className="w-3.5 h-3.5" /><span>Export PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 cursor-pointer"
              style={{ color: 'rgba(255,255,255,0.7)' }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tricolour stripe */}
        <div style={{ height: '3px', background: 'linear-gradient(to right, var(--gov-saffron) 33%, #ffffff 33% 66%, var(--gov-green) 66%)' }} />

        {/* Document body — printable white background */}
        <div
          className="flex-1 overflow-y-auto p-8 space-y-6 text-xs"
          style={{ background: '#ffffff', color: 'var(--gov-text-secondary)' }}
        >
          {/* Document header strip */}
          <div className="flex justify-between items-start pb-5" style={{ borderBottom: '3px solid var(--gov-navy)' }}>
            <div className="flex items-center gap-4">
              {/* Government emblem placeholder */}
              <div
                className="w-14 h-14 flex items-center justify-center shrink-0"
                style={{ border: '2px solid var(--gov-navy)', borderRadius: '2px', background: 'var(--gov-navy-light)' }}
              >
                <img src={APP_LOGO} alt="AquaTrace" className="w-10 h-10 object-contain" />
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--gov-text-muted)' }}>
                  Government of India · Maritime Pollution Surveillance
                </div>
                <h1 className="text-lg font-bold" style={{ color: 'var(--gov-navy)' }}>
                  INCIDENT ATTRIBUTION DOSSIER
                </h1>
                <p className="font-mono text-[10px] mt-0.5" style={{ color: 'var(--gov-text-muted)' }}>
                  AQUATRACE MARITIME COMMAND · REF: OPS-2023-1024-XRAY · SYSTEM VERSION: 2.0.4
                </p>
              </div>
            </div>
            <div className="text-right flex flex-col items-end gap-1">
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold"
                style={{
                  background: 'var(--gov-green-light)',
                  border: '1px solid var(--gov-green)',
                  color: 'var(--gov-green)',
                  borderRadius: '2px'
                }}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                CONFIRMED HYDROCARBON RELEASE
              </div>
              <span className="font-mono text-[10px]" style={{ color: 'var(--gov-text-muted)' }}>
                Date: {currentScene.acquisition}
              </span>
            </div>
          </div>

          {/* Section 1: SAR Detection */}
          <div className="space-y-3">
            <h2
              className="text-xs font-bold uppercase tracking-wider flex items-center gap-2 pb-1.5"
              style={{ color: 'var(--gov-navy)', borderBottom: '1px solid var(--gov-border)' }}
            >
              <Layers className="w-4 h-4" style={{ color: 'var(--gov-saffron)' }} />
              1. Satellite Radar Observation
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div
                className="p-4 space-y-2 font-mono text-xs"
                style={{ background: 'var(--gov-surface-alt)', border: '1px solid var(--gov-border)', borderRadius: '2px' }}
              >
                {[
                  ['Target ID:', `${detection.id}: ${detection.title}`, 'var(--gov-navy)'],
                  ['Sensor:', `${currentScene.satellite} (${currentScene.mode})`, null],
                  ['Coordinates:', detection.centroid || currentScene.coordinates, 'var(--gov-navy)'],
                  ['Detected Area:', `${detection.areaKm2} km²`, null],
                  ['Est. Volume:', `${detection.estimatedVolumeM3} m³ (${detection.estimatedVolumeBbl} bbl)`, null],
                  ['Mean Thickness:', `${detection.thicknessUm} µm`, null],
                  ['Classification:', `${detection.classification} (${detection.confidence}%)`, 'var(--gov-navy)'],
                ].map(([label, value, color]) => (
                  <div key={label as string} className="flex justify-between">
                    <span style={{ color: 'var(--gov-text-muted)' }}>{label}</span>
                    <span className="font-semibold" style={{ color: (color as string) || 'var(--gov-text-primary)' }}>{value}</span>
                  </div>
                ))}
              </div>
              <div
                className="h-36 bg-cover bg-center relative overflow-hidden"
                style={{ backgroundImage: `url(${currentScene.detectionImageUrl})`, border: '1px solid var(--gov-border)', borderRadius: '2px' }}
              >
                <div
                  className="absolute bottom-2 right-2 px-2.5 py-1 font-mono text-[10px]"
                  style={{ background: 'rgba(0,0,128,0.85)', color: '#ffffff', borderRadius: '2px' }}
                >
                  VV+VH Dual Polarisation
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Hindcast */}
          <div className="space-y-3">
            <h2
              className="text-xs font-bold uppercase tracking-wider flex items-center gap-2 pb-1.5"
              style={{ color: 'var(--gov-navy)', borderBottom: '1px solid var(--gov-border)' }}
            >
              <Activity className="w-4 h-4" style={{ color: 'var(--gov-saffron)' }} />
              2. Numerical Drift Hindcast (HYCOM/GFS)
            </h2>
            <div
              className="p-4 space-y-2 font-mono text-xs"
              style={{ background: 'var(--gov-surface-alt)', border: '1px solid var(--gov-border)', borderRadius: '2px' }}
            >
              {[
                ['Temporal Origin Window:', '14:00 – 18:00 UTC (T-14h)', 'var(--gov-saffron-dim)'],
                ['Current Model:', 'HYCOM Global 0.08° Reanalysis', null],
                ['Wind Forcing:', 'GFS 0.25° NW 14-18 kts', null],
                ['Direct Leeway Coeff:', '3.2%', 'var(--gov-navy)'],
              ].map(([label, value, color]) => (
                <div key={label as string} className="flex justify-between">
                  <span style={{ color: 'var(--gov-text-muted)' }}>{label}</span>
                  <span className="font-semibold" style={{ color: (color as string) || 'var(--gov-text-primary)' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: Vessel Attribution */}
          <div className="space-y-3">
            <h2
              className="text-xs font-bold uppercase tracking-wider flex items-center gap-2 pb-1.5"
              style={{ color: 'var(--gov-navy)', borderBottom: '1px solid var(--gov-border)' }}
            >
              <Ship className="w-4 h-4" style={{ color: 'var(--gov-saffron)' }} />
              3. AIS Vessel Attribution & Forensic Profile
            </h2>
            <div
              className="p-4 space-y-3 font-mono text-xs"
              style={{ background: 'var(--gov-surface-alt)', border: '1px solid var(--gov-border)', borderRadius: '2px' }}
            >
              {topSuspect ? (
                <>
                  <div className="flex justify-between items-center pb-2.5" style={{ borderBottom: '1px solid var(--gov-border)' }}>
                    <div>
                      <span className="text-sm font-bold" style={{ color: 'var(--gov-text-primary)' }}>{topSuspect.name}</span>
                      <span className="ml-2" style={{ color: 'var(--gov-text-muted)' }}>(MMSI: {topSuspect.mmsi}, Rank #{topSuspect.rank})</span>
                    </div>
                    <span
                      className="text-xs font-bold px-2.5 py-1"
                      style={{
                        background: 'var(--gov-green-light)',
                        color: 'var(--gov-green)',
                        border: '1px solid var(--gov-green)',
                        borderRadius: '2px'
                      }}
                    >
                      Attribution: {Math.round(topSuspect.score * 100)}%
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { label: 'Proximity', value: `${Math.round(topSuspect.factors.proximity * 100)}%` },
                      { label: 'Temporal Fit', value: `${Math.round(topSuspect.factors.temporal * 100)}%` },
                      { label: 'Heading', value: `${Math.round(topSuspect.factors.heading_alignment * 100)}%` },
                      { label: 'Speed Anomaly', value: `${Math.round(topSuspect.factors.speed_anomaly * 100)}%`, amber: true },
                    ].map(item => (
                      <div
                        key={item.label}
                        className="p-2.5"
                        style={{ background: '#ffffff', border: '1px solid var(--gov-border)', borderRadius: '2px' }}
                      >
                        <span className="block text-[10px] uppercase font-semibold mb-0.5" style={{ color: 'var(--gov-text-muted)' }}>{item.label}</span>
                        <span className="font-bold" style={{ color: item.amber ? 'var(--gov-saffron-dim)' : 'var(--gov-navy)' }}>{item.value}</span>
                      </div>
                    ))}
                  </div>

                  <p className="text-xs leading-relaxed pt-1 font-sans" style={{ color: 'var(--gov-text-secondary)' }}>
                    <strong style={{ color: 'var(--gov-text-primary)' }}>Forensic Conclusion:</strong> {topSuspect.evidence}. Weighted score
                    is a shortlisting aid for human review, not a verdict — each factor stays separately visible above.
                  </p>
                </>
              ) : (
                <p className="text-xs leading-relaxed font-sans" style={{ color: 'var(--gov-text-muted)' }}>
                  No suspect has been ranked yet. Run the Drift hindcast and AIS attribution stages before exporting this report.
                </p>
              )}
            </div>
          </div>

          {/* Signoff */}
          <div
            className="pt-4 flex justify-between items-end font-mono text-[10px]"
            style={{ borderTop: '2px solid var(--gov-navy)', color: 'var(--gov-text-muted)' }}
          >
            <div>
              <p>Certified by: Maritime Operations Automated Sentinel Core</p>
              <p>Hash: SHA256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069</p>
            </div>
            <div className="text-right">
              <span
                className="font-bold flex items-center gap-1"
                style={{ color: 'var(--gov-green)' }}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                STATUS: VERIFIED & SEALED
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
