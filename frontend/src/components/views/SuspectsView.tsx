import React, { useState, useEffect, useMemo } from 'react';
import { CorridorResponse, Suspect } from '../../types';
import { SceneMetadata } from '../../types';
import { DetectionResponse, rankSuspects } from '../../api/api';
import { projectPoints } from '../../utils/geoProjection';
import {
  ChevronRight,
  Ship,
  X,
  ArrowRight,
  ShieldAlert,
  Zap,
  AlertTriangle,
  Loader2,
  Activity,
} from 'lucide-react';

interface SuspectsViewProps {
  currentScene: SceneMetadata;
  onProceedToExport: () => void;
  searchQuery: string;
  contract1: DetectionResponse | null;
  corridor: CorridorResponse | null;
  onTopSuspectReady: (suspect: Suspect | null) => void;
  onGoToIngest: () => void;
}

const FACTOR_LABELS: { key: keyof Suspect['factors']; label: string }[] = [
  { key: 'heading_alignment', label: 'Heading Alignment' },
  { key: 'proximity', label: 'Spatial Proximity' },
  { key: 'temporal', label: 'Temporal Fit' },
  { key: 'speed_anomaly', label: 'Speed Anomaly' },
  { key: 'transponder_gap', label: 'Transponder Gap' },
];

export const SuspectsView: React.FC<SuspectsViewProps> = ({
  currentScene,
  onProceedToExport,
  searchQuery,
  contract1,
  corridor,
  onTopSuspectReady,
  onGoToIngest
}) => {
  const [suspects, setSuspects] = useState<Suspect[]>([]);
  const [aisSource, setAisSource] = useState<string | null>(null);
  const [selectedSuspect, setSelectedSuspect] = useState<Suspect | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(true);
  const [showMatrixPopover, setShowMatrixPopover] = useState<boolean>(true);

  const fetchSuspects = async (c1: DetectionResponse, c2: CorridorResponse) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await rankSuspects(c2, c1.orientation_deg);
      setSuspects(result.suspects);
      setAisSource(result.ais_source);
      setSelectedSuspect(result.suspects[0] ?? null);
      onTopSuspectReady(result.suspects[0] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach the backend.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (contract1 && corridor) {
      void fetchSuspects(contract1, corridor);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract1, corridor]);

  const filteredSuspects = suspects.filter(v => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      v.name.toLowerCase().includes(q) ||
      String(v.mmsi).includes(q)
    );
  });

  const projector = useMemo(() => {
    if (!corridor || !contract1) return null;
    const points = [
      { lat: contract1.centroid[1], lon: contract1.centroid[0] },
      ...corridor.corridor.map(n => ({ lat: n.lat, lon: n.lon })),
    ];
    return projectPoints(points);
  }, [corridor, contract1]);

  if (!contract1 || !corridor) {
    return (
      <div className="flex-1 flex h-[calc(100vh-72px)] w-full items-center justify-center select-none" style={{ background: 'var(--gov-bg)' }}>
        <div
          className="flex flex-col items-center gap-4 p-8 max-w-md text-center"
          style={{ background: 'var(--gov-surface)', border: '1px solid var(--gov-border)', borderTop: '3px solid var(--gov-navy)', borderRadius: '2px' }}
        >
          <Activity className="w-8 h-8" style={{ color: 'var(--gov-saffron)' }} />
          <h2 className="text-sm font-bold" style={{ color: 'var(--gov-navy)' }}>No Corridor Yet</h2>
          <p className="text-xs" style={{ color: 'var(--gov-text-secondary)' }}>
            Run the drift hindcast first to produce a space-time corridor before AIS attribution can run.
          </p>
          <button
            onClick={onGoToIngest}
            className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer"
            style={{ background: 'var(--gov-green)', color: '#ffffff', border: 'none', borderRadius: '2px' }}
          >
            Go to Drift Analysis
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex-1 flex h-[calc(100vh-72px)] w-full overflow-hidden select-none"
      style={{ background: 'var(--gov-bg)' }}
    >

      {/* Left Column: Vessel List */}
      <section
        id="suspects-list-panel"
        className="w-full sm:w-[380px] h-full flex flex-col shrink-0 z-20"
        style={{ background: 'var(--gov-surface)', borderRight: '1px solid var(--gov-border)' }}
      >
        {/* Panel header */}
        <div
          className="p-4 flex flex-col gap-3"
          style={{ background: 'var(--gov-surface-alt)', borderBottom: '3px solid var(--gov-navy)' }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--gov-navy)' }}>
              <ShieldAlert className="w-3.5 h-3.5" style={{ color: 'var(--gov-saffron)' }} />
              Attribution Ranking
            </span>
            <span className="tag tag-active text-[10px]">
              {isLoading ? 'Scoring...' : `${filteredSuspects.length} Suspects`}
            </span>
          </div>
          {aisSource && (
            <span className={`tag text-[10px] w-fit ${aisSource === 'synthetic' ? 'tag-amber' : 'tag-active'}`}>
              AIS Source: {aisSource}
            </span>
          )}
        </div>

        {/* Loading / error */}
        {isLoading && (
          <div className="flex items-center gap-2.5 p-4 text-xs" style={{ color: 'var(--gov-text-secondary)' }}>
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--gov-navy)' }} />
            Scoring AIS traffic against the corridor...
          </div>
        )}
        {error && !isLoading && (
          <div className="flex items-start gap-2.5 p-4" style={{ background: 'var(--gov-warning-bg)', borderBottom: '1px solid var(--gov-saffron)' }}>
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--gov-saffron-dim)' }} />
            <div className="flex flex-col gap-1.5">
              <span className="text-xs" style={{ color: 'var(--gov-text-primary)' }}>{error}</span>
              <button
                onClick={() => contract1 && corridor && fetchSuspects(contract1, corridor)}
                className="w-fit px-2 py-1 text-[10px] font-semibold uppercase cursor-pointer"
                style={{ background: 'var(--gov-navy)', color: '#ffffff', borderRadius: '2px' }}
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Vessel list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filteredSuspects.map((vessel) => {
            const isSelected = selectedSuspect?.mmsi === vessel.mmsi;
            const scorePct = Math.round(vessel.score * 100);
            const scoreColor = scorePct >= 80
              ? 'var(--gov-green)'
              : scorePct >= 60
                ? 'var(--gov-saffron-dim)'
                : 'var(--gov-text-muted)';

            return (
              <div
                key={vessel.mmsi}
                id={`vessel-card-${vessel.mmsi}`}
                onClick={() => { setSelectedSuspect(vessel); setIsProfileOpen(true); }}
                className="p-3.5 cursor-pointer transition-colors"
                style={{
                  background: isSelected ? 'var(--gov-navy-light)' : 'var(--gov-surface-alt)',
                  border: isSelected ? '1px solid var(--gov-navy)' : '1px solid var(--gov-border)',
                  borderLeft: isSelected ? '3px solid var(--gov-navy)' : '1px solid var(--gov-border)',
                  borderRadius: '2px'
                }}
              >
                <div className="flex justify-between items-start mb-1.5">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--gov-text-primary)' }}>
                      <Ship className="w-4 h-4" style={{ color: isSelected ? 'var(--gov-navy)' : 'var(--gov-text-muted)' }} />
                      {vessel.name}
                    </span>
                    <span className="font-mono text-xs" style={{ color: 'var(--gov-text-muted)' }}>
                      MMSI: {vessel.mmsi}
                    </span>
                  </div>
                  <div
                    className="font-mono text-xs px-2 py-0.5 font-bold"
                    style={{
                      background: vessel.rank === 1 ? 'var(--gov-green)' : 'var(--gov-surface)',
                      color: vessel.rank === 1 ? '#ffffff' : 'var(--gov-text-secondary)',
                      border: `1px solid ${vessel.rank === 1 ? 'var(--gov-green)' : 'var(--gov-border)'}`,
                      borderRadius: '2px'
                    }}
                  >
                    #{vessel.rank}
                  </div>
                </div>

                <div className="flex gap-4 text-[10px] font-semibold uppercase mb-2.5" style={{ color: 'var(--gov-text-muted)' }}>
                  <span>FITS: T-{vessel.fits_hours_ago}h</span>
                  <span>DIST: {vessel.distance_km.toFixed(1)}km</span>
                </div>

                {/* Score bar */}
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold w-8 text-right" style={{ color: scoreColor }}>
                    {scorePct}%
                  </span>
                  <div className="flex-1 h-2 rounded-sm overflow-hidden" style={{ background: 'var(--gov-border)' }}>
                    <div
                      className="h-full transition-all duration-300"
                      style={{ width: `${scorePct}%`, background: scoreColor, borderRadius: '1px' }}
                    />
                  </div>
                </div>
              </div>
            );
          })}

          {!isLoading && !error && filteredSuspects.length === 0 && (
            <div className="p-6 text-center text-xs" style={{ color: 'var(--gov-text-muted)' }}>
              No suspects matched the search query.
            </div>
          )}
        </div>

        {/* Export action */}
        <div
          className="p-4"
          style={{ borderTop: '1px solid var(--gov-border)', background: 'var(--gov-surface-alt)' }}
        >
          <button
            onClick={onProceedToExport}
            className="w-full py-3 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer"
            style={{
              background: 'var(--gov-green)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '3px'
            }}
          >
            <span>Export Evidence Package</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Right Column: Map + Bottom Drawer */}
      <section className="flex-1 relative flex flex-col h-full overflow-hidden" style={{ background: 'var(--gov-bg)' }}>

        {/* Map area */}
        <div
          className="flex-1 relative bg-cover bg-center overflow-hidden"
          style={{ backgroundImage: `url(${currentScene.mapImageUrl})` }}
        >
          <div className="absolute inset-0 bg-gray-900/30 mix-blend-multiply pointer-events-none" />
          <div
            className="absolute inset-0 opacity-15 pointer-events-none"
            style={{
              backgroundImage: 'linear-gradient(rgba(0,0,128,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,128,0.08) 1px, transparent 1px)',
              backgroundSize: '50px 50px'
            }}
          />

          {/* SVG corridor + selected suspect marker — real geometry only */}
          {projector && (
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1000 800" preserveAspectRatio="none">
              {(() => {
                const origin = projector({ lat: contract1.centroid[1], lon: contract1.centroid[0] });
                const nodePoints = corridor.corridor.map(n => projector({ lat: n.lat, lon: n.lon }));
                const pathD = [origin, ...nodePoints]
                  .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
                  .join(' ');

                return (
                  <g>
                    <path d={pathD} fill="none" stroke="var(--gov-navy)" strokeDasharray="4 4" strokeWidth="2" opacity="0.7" />

                    {/* Slick origin */}
                    <ellipse cx={origin.x} cy={origin.y} rx="35" ry="18" fill="var(--gov-navy-light)" stroke="var(--gov-navy)" strokeWidth="1.5" strokeDasharray="3 3" />
                    <circle cx={origin.x} cy={origin.y} r="3" fill="var(--gov-navy)" />
                    <text x={origin.x + 15} y={origin.y + 5} fill="var(--gov-navy)" fontFamily="IBM Plex Mono" fontSize="11" fontWeight="600">ESTIMATED ORIGIN (t=0)</text>

                    {/* Corridor nodes */}
                    {corridor.corridor.map((node, idx) => {
                      const p = nodePoints[idx];
                      const isMatched = selectedSuspect?.fits_hours_ago === node.hours_ago;
                      return (
                        <g key={node.hours_ago}>
                          <circle cx={p.x} cy={p.y} r="3.5" fill={isMatched ? 'var(--gov-saffron)' : 'var(--gov-text-muted)'} />
                          {isMatched && (
                            <>
                              <circle cx={p.x} cy={p.y} r="14" fill="none" stroke="var(--gov-saffron)" strokeWidth="1.5" opacity="0.6" />
                              <text x={p.x + 12} y={p.y - 8} fill="var(--gov-saffron)" fontFamily="IBM Plex Mono" fontSize="12" fontWeight="700">
                                {selectedSuspect.name} (T-{node.hours_ago}h)
                              </text>
                            </>
                          )}
                        </g>
                      );
                    })}
                  </g>
                );
              })()}
            </svg>
          )}

          {/* Attribution Matrix Card */}
          {showMatrixPopover && selectedSuspect && (
            <div
              id="attribution-matrix-popover"
              className="absolute top-4 right-4 w-80 p-4 z-30 shadow-lg"
              style={{
                background: 'var(--gov-surface)',
                border: '1px solid var(--gov-border)',
                borderTop: '3px solid var(--gov-navy)',
                borderRadius: '2px'
              }}
            >
              <div
                className="flex justify-between items-center mb-3 pb-2.5"
                style={{ borderBottom: '1px solid var(--gov-border)' }}
              >
                <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--gov-navy)' }}>
                  <Zap className="w-3.5 h-3.5" style={{ color: 'var(--gov-saffron)' }} />
                  Attribution Matrix
                </span>
                <span className="tag tag-active text-xs font-bold font-mono">
                  {Math.round(selectedSuspect.score * 100)}% Match
                </span>
              </div>

              <div className="space-y-3">
                {FACTOR_LABELS.map(({ key, label }) => {
                  const value = Math.round(selectedSuspect.factors[key] * 100);
                  return (
                    <div key={key}>
                      <div className="flex justify-between font-mono text-xs mb-1" style={{ color: 'var(--gov-text-secondary)' }}>
                        <span>{label}</span>
                        <span className="font-semibold" style={{ color: 'var(--gov-navy)' }}>{value}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-sm overflow-hidden" style={{ background: 'var(--gov-border)' }}>
                        <div className="h-full" style={{ width: `${value}%`, background: 'var(--gov-navy)', borderRadius: '1px' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Vessel Profile Drawer */}
        {isProfileOpen && selectedSuspect && (
          <div
            id="vessel-profile-drawer"
            className="h-52 shrink-0 flex flex-col z-30 shadow-lg"
            style={{ background: 'var(--gov-surface)', borderTop: '3px solid var(--gov-navy)' }}
          >
            {/* Drawer header */}
            <div
              className="px-5 py-2.5 flex justify-between items-center"
              style={{ background: 'var(--gov-surface-alt)', borderBottom: '1px solid var(--gov-border)' }}
            >
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold uppercase tracking-wide flex items-center gap-2" style={{ color: 'var(--gov-navy)' }}>
                  <Ship className="w-4 h-4" style={{ color: 'var(--gov-saffron)' }} />
                  Vessel Profile: {selectedSuspect.name}
                </span>
                <span className="font-mono text-xs font-medium" style={{ color: 'var(--gov-navy)' }}>
                  MMSI: {selectedSuspect.mmsi}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs hidden md:inline font-mono" style={{ color: 'var(--gov-text-muted)' }}>
                  Matched: {new Date(selectedSuspect.matched_at).toISOString().slice(0, 19).replace('T', ' ')} UTC
                </span>
                <button
                  onClick={() => setIsProfileOpen(false)}
                  className="p-1 rounded cursor-pointer"
                  style={{ color: 'var(--gov-text-muted)' }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Drawer content — real explainability: evidence sentence + factor bars */}
            <div className="flex-1 flex flex-col md:flex-row p-4 gap-4 overflow-hidden">
              <div
                className="flex-1 flex flex-col justify-center p-4"
                style={{ border: '1px solid var(--gov-border)', borderRadius: '2px', background: 'var(--gov-surface-alt)' }}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--gov-text-secondary)' }}>
                  Forensic Evidence
                </span>
                <p className="text-sm font-medium leading-relaxed" style={{ color: 'var(--gov-text-primary)' }}>
                  {selectedSuspect.evidence}
                </p>
                <p className="text-xs mt-2" style={{ color: 'var(--gov-text-muted)' }}>
                  Weighted score is a shortlisting aid for human review, not a verdict — each factor stays separately visible above.
                </p>
              </div>

              <div
                className="flex-1 flex flex-col p-4 gap-2"
                style={{ border: '1px solid var(--gov-border)', borderRadius: '2px', background: 'var(--gov-surface-alt)' }}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--gov-text-secondary)' }}>
                  Factor Breakdown (Weighted)
                </span>
                {FACTOR_LABELS.map(({ key, label }) => (
                  <div key={key} className="flex justify-between font-mono text-[11px]" style={{ color: 'var(--gov-text-secondary)' }}>
                    <span>{label}</span>
                    <span className="font-semibold" style={{ color: 'var(--gov-navy)' }}>
                      {Math.round(selectedSuspect.factors[key] * 100)}% × {selectedSuspect.weights[key]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

    </div>
  );
};
