import React, { useState } from 'react';
import { CorridorResponse, GisLayers, MorphologicalProperties, Suspect } from '../types';
import { DetectionResponse } from '../api/api';
import {
  Layers,
  Crosshair,
  Sliders,
  ExternalLink,
  Eye,
  Map,
  ArrowRight
} from 'lucide-react';

export interface GISLayerStackProps {
  gisLayers: GisLayers;
  setGisLayers: React.Dispatch<React.SetStateAction<GisLayers>>;
  contract1: DetectionResponse | null;
  corridor: CorridorResponse | null;
  topSuspect: Suspect | null;
  activeDetection?: MorphologicalProperties;
  onSelectDetection?: (detection?: MorphologicalProperties) => void;
  onNavigateToAnalysis?: () => void;
  className?: string;
  defaultCollapsed?: boolean;
}

export const GISLayerStack: React.FC<GISLayerStackProps> = ({
  gisLayers,
  setGisLayers,
  contract1,
  corridor,
  topSuspect,
  activeDetection,
  onSelectDetection,
  onNavigateToAnalysis,
  className = '',
  defaultCollapsed = false
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(defaultCollapsed);

  const handleInspectClick = () => {
    if (onSelectDetection) {
      onSelectDetection(activeDetection || (contract1 ? ({ id: (contract1 as any).detection_id || 'DET-001' } as any) : undefined));
    }
  };

  const LayerRow = ({
    label, checked, onChange, colorDot, icon, disabled, disabledReason
  }: {
    label: string; checked: boolean; onChange: (v: boolean) => void;
    colorDot?: string; icon?: React.ReactNode; disabled?: boolean; disabledReason?: string;
  }) => (
    <div
      className="flex items-center gap-2.5 px-2 py-1.5 rounded transition-colors"
      style={{ background: checked && !disabled ? 'var(--gov-navy-light)' : 'transparent', opacity: disabled ? 0.5 : 1 }}
      title={disabled ? disabledReason : undefined}
    >
      <label className={`flex items-center gap-2.5 w-full ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
        <input
          type="checkbox"
          checked={checked && !disabled}
          disabled={disabled}
          onChange={e => onChange(e.target.checked)}
          className="h-4 w-4 cursor-pointer disabled:cursor-not-allowed"
          style={{ accentColor: 'var(--gov-navy)' }}
        />
        {colorDot && <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: colorDot, border: '1px solid rgba(0,0,0,0.2)' }} />}
        {icon && icon}
        <span className="text-xs" style={{ color: 'var(--gov-text-primary)', fontFamily: 'var(--font-mono)' }}>
          {label}
        </span>
      </label>
    </div>
  );

  return (
    <div
      id="gis-layers-panel"
      className={`flex flex-col shadow-2xl transition-all duration-200 overflow-hidden ${
        isCollapsed ? 'w-44' : 'w-72'
      } ${className}`}
      style={{
        background: 'var(--gov-surface)',
        border: '1px solid var(--gov-border)',
        borderTop: '3px solid var(--gov-navy)',
        borderRadius: '2px'
      }}
    >
      {/* Panel Header */}
      <div
        className="px-3 py-2 flex justify-between items-center select-none"
        style={{ background: 'var(--gov-surface-alt)', borderBottom: '1px solid var(--gov-border)' }}
      >
        <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--gov-navy)' }}>
          <Layers className="w-3.5 h-3.5" style={{ color: 'var(--gov-saffron)' }} />
          GIS Layer Stack
        </span>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 rounded transition-colors cursor-pointer hover:opacity-80"
          style={{ color: 'var(--gov-text-muted)' }}
          title={isCollapsed ? "Expand Panel" : "Collapse Panel"}
        >
          {isCollapsed ? <Eye className="w-3.5 h-3.5" /> : <Sliders className="w-3.5 h-3.5" />}
        </button>
      </div>

      {!isCollapsed && (
        <div className="p-3 flex flex-col gap-1 max-h-[calc(100vh-280px)] overflow-y-auto">
          {/* Coordinate Analysis Navigation Button (only if passed) */}
          {onNavigateToAnalysis && (
            <button
              id="switch-to-analysis-btn"
              onClick={onNavigateToAnalysis}
              className="mb-2 w-full py-2 px-3 rounded flex items-center justify-between text-xs font-mono font-semibold transition-all cursor-pointer shadow-sm hover:opacity-95"
              style={{
                background: 'rgba(6, 182, 212, 0.12)',
                border: '1px solid rgba(6, 182, 212, 0.4)',
                color: 'var(--gov-text-primary)'
              }}
              title="Switch to MapLibre Coordinate Analysis View"
            >
              <span className="flex items-center gap-1.5 font-bold" style={{ color: '#0891b2' }}>
                <Map className="w-3.5 h-3.5" style={{ color: '#06b6d4' }} />
                Coordinate Analysis
              </span>
              <ArrowRight className="w-3.5 h-3.5" style={{ color: '#0891b2' }} />
            </button>
          )}

          {/* 1. MarineTraffic Live AIS Toggle */}
          <LayerRow
            label="MarineTraffic Live AIS"
            checked={gisLayers.marineTraffic !== false}
            onChange={v => setGisLayers({ ...gisLayers, marineTraffic: v })}
            colorDot="#3b82f6"
          />

          <div className="mt-1 pt-1 border-t text-[10px] font-bold uppercase tracking-wider" style={{ borderColor: 'var(--gov-border)', color: 'var(--gov-text-muted)' }}>
            Telemetry Overlays:
          </div>

          {/* 2. Predicted Mask (Detector) Toggle & Opacity Slider */}
          <div style={{ border: '1px solid var(--gov-navy)', borderRadius: '2px', background: 'var(--gov-navy-light)' }}>
            <LayerRow
              label="Predicted Mask (Detector)"
              checked={gisLayers.predictedMask}
              onChange={v => setGisLayers({ ...gisLayers, predictedMask: v })}
              colorDot="#06b6d4"
              disabled={!contract1}
              disabledReason="Run Ingest stage to produce Contract 1 polygon mask"
            />
            {gisLayers.predictedMask && (
              <div className="pl-9 pr-3 pb-2 flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider w-14" style={{ color: 'var(--gov-navy)' }}>Opacity</span>
                <input
                  type="range" min="0" max="100"
                  value={gisLayers.predictedMaskOpacity}
                  onChange={e => setGisLayers({ ...gisLayers, predictedMaskOpacity: Number(e.target.value) })}
                  className="flex-1 cursor-pointer"
                  style={{ accentColor: 'var(--gov-navy)' }}
                />
                <span className="text-xs font-mono w-8 text-right" style={{ color: 'var(--gov-navy)' }}>{gisLayers.predictedMaskOpacity}%</span>
              </div>
            )}
          </div>

          {/* 3. Confidence Heatmap Toggle (Disabled - No raster data) */}
          <LayerRow
            label="Confidence Heatmap"
            checked={false}
            onChange={() => {}}
            colorDot="#94a3b8"
            disabled={true}
            disabledReason="Unavailable — No confidence heatmap raster/grid data"
          />

          {/* 4. Drift Corridor Path Toggle */}
          <LayerRow
            label={`Drift Corridor Path (${corridor?.field_source ?? 'analytic'})`}
            checked={gisLayers.oceanCurrents}
            onChange={v => setGisLayers({ ...gisLayers, oceanCurrents: v })}
            colorDot="#f59e0b"
            disabled={!corridor}
            disabledReason="Run Drift analysis first to compute trajectory corridor"
          />

          {/* 5. Suspect Vessel Position Toggle */}
          <LayerRow
            label="Suspect Vessel Position"
            checked={gisLayers.aisTracks}
            onChange={v => setGisLayers({ ...gisLayers, aisTracks: v })}
            colorDot="#ef4444"
            disabled={!topSuspect}
            disabledReason="Run Suspect matching first to identify a top suspect"
          />

          {/* 6. Origin Estimate Toggle */}
          <LayerRow
            label="Origin Estimate"
            checked={gisLayers.originEstimate}
            onChange={v => setGisLayers({ ...gisLayers, originEstimate: v })}
            icon={<Crosshair className="w-3 h-3 shrink-0" style={{ color: '#C62828' }} />}
            disabled={!contract1}
            disabledReason="Run Ingest stage first to fetch Contract 1 detection origin"
          />

          {/* 7. Inspect Anomaly Button */}
          <button
            onClick={handleInspectClick}
            className="mt-2 w-full py-2 flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer shadow-md hover:opacity-90"
            style={{
              background: contract1 || activeDetection ? 'var(--gov-green)' : '#475569',
              color: '#ffffff',
              border: 'none',
              borderRadius: '2px'
            }}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Inspect Anomaly ({activeDetection?.id || (contract1 as any)?.detection_id || 'DET-001'})
          </button>
        </div>
      )}
    </div>
  );
};
