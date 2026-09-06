import React from 'react';
import {
  X,
  UserCheck,
  Shield,
  Clock,
  Terminal,
  Award,
  Radio,
  CheckCircle2
} from 'lucide-react';

interface OperatorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OperatorModal: React.FC<OperatorModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div
        className="w-full max-w-md flex flex-col overflow-hidden shadow-2xl"
        style={{
          background: 'var(--gov-surface)',
          border: '1px solid var(--gov-border)',
          borderTop: '4px solid var(--gov-navy)',
          borderRadius: '2px'
        }}
      >
        {/* Header */}
        <div
          className="px-5 py-4 flex items-center justify-between"
          style={{ background: 'var(--gov-surface-alt)', borderBottom: '1px solid var(--gov-border)' }}
        >
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5" style={{ color: 'var(--gov-navy)' }} />
            <div>
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--gov-navy)' }}>
                System Operator Profile
              </span>
              <p className="text-[10px]" style={{ color: 'var(--gov-text-muted)' }}>Government of India — Maritime Operations</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 cursor-pointer"
            style={{ color: 'var(--gov-text-muted)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 text-xs">

          {/* Operator badge */}
          <div
            className="flex items-center gap-4 p-4"
            style={{
              background: 'var(--gov-navy)',
              borderRadius: '2px'
            }}
          >
            <div
              className="w-14 h-14 flex items-center justify-center font-bold text-xl shrink-0"
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: '2px solid rgba(255,255,255,0.4)',
                color: '#ffffff',
                borderRadius: '2px'
              }}
            >
              SO
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-white">Operator SO-4092</span>
              <span className="text-[11px] font-semibold" style={{ color: 'var(--gov-saffron)' }}>SAR Surveillance Division</span>
              <span
                className="text-[10px] font-mono mt-0.5 px-1.5 py-0.5 inline-block"
                style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', borderRadius: '1px' }}
              >
                Clearance: MARITIME_ALPHA_IV
              </span>
            </div>
          </div>

          {/* Field rows */}
          <div className="space-y-0" style={{ border: '1px solid var(--gov-border)', borderRadius: '2px', overflow: 'hidden' }}>
            {[
              {
                icon: <Clock className="w-3.5 h-3.5" />,
                label: 'Session Active',
                value: '04h 18m (Active)',
                valueColor: 'var(--gov-text-primary)'
              },
              {
                icon: <Radio className="w-3.5 h-3.5" />,
                label: 'Telemetry Node',
                value: 'COP-SENTINEL-EU-02',
                valueColor: 'var(--gov-navy)'
              },
              {
                icon: <Shield className="w-3.5 h-3.5" />,
                label: 'Cryptographic Key',
                value: 'ECDSA-P256 (VALID)',
                valueColor: 'var(--gov-text-primary)'
              },
              {
                icon: <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--gov-green)' }} />,
                label: 'Audit Status',
                value: 'Chain Verified',
                valueColor: 'var(--gov-green)'
              },
            ].map((row, idx) => (
              <div
                key={idx}
                className="flex justify-between py-2.5 px-4 font-mono"
                style={{
                  borderBottom: idx < 3 ? '1px solid var(--gov-border)' : 'none',
                  background: idx % 2 === 0 ? 'var(--gov-surface-alt)' : 'transparent'
                }}
              >
                <span className="flex items-center gap-1.5" style={{ color: 'var(--gov-text-secondary)' }}>
                  <span style={{ color: 'var(--gov-text-muted)' }}>{row.icon}</span>
                  {row.label}
                </span>
                <span className="font-semibold" style={{ color: row.valueColor }}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div
          className="px-5 py-3 flex justify-end"
          style={{ background: 'var(--gov-surface-alt)', borderTop: '1px solid var(--gov-border)' }}
        >
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold transition-colors cursor-pointer"
            style={{
              background: 'var(--gov-navy)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '2px'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
