// @ts-nocheck
import React from 'react';
import { APP_LOGO } from '../../data';
import {
  X,
  HelpCircle,
  Layers,
  Compass,
  Wind,
  Ship,
  FileText,
  Activity,
  ShieldCheck
} from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div
        className="w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl"
        style={{
          background: 'var(--gov-surface)',
          border: '1px solid var(--gov-border)',
          borderTop: '4px solid var(--gov-navy)',
          borderRadius: '2px'
        }}
      >
        {/* Header */}
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ background: 'var(--gov-surface-alt)', borderBottom: '1px solid var(--gov-border)' }}
        >
          <div className="flex items-center gap-3">
            <img src={APP_LOGO} alt="AquaTrace" className="w-6 h-6 object-contain" />
            <div>
              <span className="font-bold text-sm" style={{ color: 'var(--gov-navy)' }}>
                SpillTrace — Operator Manual
              </span>
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--gov-text-muted)' }}>
                Maritime Pollution Surveillance Portal · v2.0
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded transition-colors cursor-pointer"
            style={{ color: 'var(--gov-text-muted)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Saffron accent stripe */}
        <div style={{ height: '3px', background: 'linear-gradient(to right, var(--gov-saffron) 33%, #ffffff 33% 66%, var(--gov-green) 66%)' }} />

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm" style={{ color: 'var(--gov-text-secondary)' }}>

          {/* Section 1: Purpose */}
          <div className="space-y-2">
            <h3
              className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 pb-2"
              style={{ color: 'var(--gov-navy)', borderBottom: '2px solid var(--gov-border)' }}
            >
              <ShieldCheck className="w-4 h-4" style={{ color: 'var(--gov-green)' }} />
              1. System Purpose
            </h3>
            <p className="leading-relaxed text-xs" style={{ color: 'var(--gov-text-secondary)' }}>
              SpillTrace is an advanced satellite intelligence platform designed to ingest Synthetic Aperture Radar (SAR) imagery,
              identify marine surface anomalies (hydrocarbon oil slicks), hindcast hydrodynamic drift trajectories,
              and score prospective AIS vessel suspects for attribution.
              This system is operated under the authority of the Government of India maritime monitoring framework.
            </p>
          </div>

          {/* Section 2: Workflow Stages */}
          <div className="space-y-3">
            <h3
              className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 pb-2"
              style={{ color: 'var(--gov-navy)', borderBottom: '2px solid var(--gov-border)' }}
            >
              <Layers className="w-4 h-4" style={{ color: 'var(--gov-saffron)' }} />
              2. Core Workflow Pipeline
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { stage: 'Stage 1: Ingest', icon: <FileText className="w-3.5 h-3.5" />, text: 'Upload GeoTIFF, Sentinel SAFE packages or select pre-configured maritime regions to begin deep feature extraction.' },
                { stage: 'Stage 2: Detection', icon: <Layers className="w-3.5 h-3.5" />, text: 'Analyse radar backscatter dampening, VV/VH polarisations, and morphological parameters (area, bearing, minor/major axes).' },
                { stage: 'Stage 3: Drift Hindcast', icon: <Activity className="w-3.5 h-3.5" />, text: 'Run backward Lagrangian particle models (HYCOM ocean currents + GFS surface wind forcing) to calculate the origin release window.' },
                { stage: 'Stage 4: Attribution & Export', icon: <Ship className="w-3.5 h-3.5" />, text: 'Correlate historical AIS pings against the origin window. Inspect speed drops, heading alignments, and export certified PDF dossiers.' },
              ].map(item => (
                <div
                  key={item.stage}
                  className="p-3"
                  style={{
                    background: 'var(--gov-surface-alt)',
                    border: '1px solid var(--gov-border)',
                    borderLeft: '3px solid var(--gov-navy)',
                    borderRadius: '2px'
                  }}
                >
                  <span
                    className="font-bold text-xs flex items-center gap-1.5 mb-1"
                    style={{ color: 'var(--gov-navy)' }}
                  >
                    <span style={{ color: 'var(--gov-green)' }}>{item.icon}</span>
                    {item.stage}
                  </span>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--gov-text-secondary)' }}>{item.text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: Controls */}
          <div className="space-y-2">
            <h3
              className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 pb-2"
              style={{ color: 'var(--gov-navy)', borderBottom: '2px solid var(--gov-border)' }}
            >
              <Compass className="w-4 h-4" style={{ color: 'var(--gov-saffron)' }} />
              3. Tactical GIS Controls
            </h3>
            <ul className="space-y-2 text-xs" style={{ color: 'var(--gov-text-secondary)' }}>
              <li
                className="flex items-start gap-2 p-2 rounded"
                style={{ background: 'var(--gov-surface-alt)', border: '1px solid var(--gov-border)' }}
              >
                <span className="font-bold mt-0.5" style={{ color: 'var(--gov-navy)' }}>Map Canvas:</span>
                <span>Drag to pan; use + / − controls or scroll wheel to zoom.</span>
              </li>
              <li
                className="flex items-start gap-2 p-2 rounded"
                style={{ background: 'var(--gov-surface-alt)', border: '1px solid var(--gov-border)' }}
              >
                <span className="font-bold mt-0.5" style={{ color: 'var(--gov-navy)' }}>Layer Toggles:</span>
                <span>Switch between SAR Backscatter, Predicted Mask opacity, ocean currents, and AIS tracks using the GIS Layer Stack panel.</span>
              </li>
              <li
                className="flex items-start gap-2 p-2 rounded"
                style={{ background: 'var(--gov-surface-alt)', border: '1px solid var(--gov-border)' }}
              >
                <span className="font-bold mt-0.5" style={{ color: 'var(--gov-navy)' }}>Scrubber:</span>
                <span>Drag timeline handle from −72h to +24h to simulate historical backward drift and forward dispersion predictions.</span>
              </li>
            </ul>
          </div>

        </div>

        {/* Footer */}
        <div
          className="px-6 py-3 flex justify-between items-center"
          style={{ background: 'var(--gov-surface-alt)', borderTop: '1px solid var(--gov-border)' }}
        >
          <span className="text-[10px]" style={{ color: 'var(--gov-text-muted)' }}>
            Government of India — Maritime Surveillance Operations
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold transition-colors cursor-pointer"
            style={{
              background: 'var(--gov-green)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '2px'
            }}
          >
            Acknowledge & Close
          </button>
        </div>
      </div>
    </div>
  );
};
