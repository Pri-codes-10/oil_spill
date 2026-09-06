import React, { useState, useEffect, useMemo } from 'react';
import { CorridorResponse, SceneMetadata } from '../../types';
import { DetectionResponse, getCorridor } from '../../api/api';
import { projectPoints } from '../../utils/geoProjection';
import {
  Play,
  Pause,
  RotateCcw,
  RefreshCw,
  ArrowRight,
  AlertTriangle,
  Loader2,
  UploadCloud,
} from 'lucide-react';

interface DriftViewProps {
  currentScene: SceneMetadata;
  contract1: DetectionResponse | null;
  onCorridorReady: (corridor: CorridorResponse) => void;
  onProceedToSuspects: () => void;
  onGoToIngest: () => void;
}

export const DriftView: React.FC<DriftViewProps> = ({
  currentScene,
  contract1,
  onCorridorReady,
  onProceedToSuspects,
  onGoToIngest
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [scrubberTime, setScrubberTime] = useState<number>(0);
  const [corridor, setCorridor] = useState<CorridorResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCorridor = async (c1: DetectionResponse) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getCorridor(c1, 'analytic');
      setCorridor(result);
      onCorridorReady(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach the backend.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (contract1) {
      void fetchCorridor(contract1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract1]);

  const maxHoursAgo = corridor ? corridor.corridor[corridor.corridor.length - 1].hours_ago : 72;

  useEffect(() => {
    let interval: any;
    if (isPlaying && corridor) {
      interval = setInterval(() => {
        setScrubberTime(prev => {
          const next = prev + (0.5 * playbackSpeed);
          return next >= maxHoursAgo ? 0 : next;
        });
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed, corridor, maxHoursAgo]);

  const projector = useMemo(() => {
    if (!corridor || !contract1) return null;
    const points = [
      { lat: contract1.centroid[1], lon: contract1.centroid[0] },
      ...corridor.corridor.map(n => ({ lat: n.lat, lon: n.lon })),
    ];
    return projectPoints(points);
  }, [corridor, contract1]);

  // hours_ago runs 0 (observed) -> max (oldest); scrubberTime is hours_ago directly.
  const markerPos = useMemo(() => {
    if (!corridor || !contract1 || !projector) return null;
    const originPoint = projector({ lat: contract1.centroid[1], lon: contract1.centroid[0] });
    const nodes = corridor.corridor;

    if (scrubberTime <= 0) return originPoint;
    if (scrubberTime >= nodes[nodes.length - 1].hours_ago) {
      const last = nodes[nodes.length - 1];
      return projector({ lat: last.lat, lon: last.lon });
    }

    // Find the two bracketing nodes (nodes are ascending by hours_ago; origin is hours_ago=0).
    let prev = { hours_ago: 0, lat: contract1.centroid[1], lon: contract1.centroid[0] };
    let next = nodes[0];
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].hours_ago >= scrubberTime) {
        next = nodes[i];
        prev = i === 0 ? prev : nodes[i - 1];
        break;
      }
    }
    const span = next.hours_ago - prev.hours_ago;
    const ratio = span > 0 ? (scrubberTime - prev.hours_ago) / span : 0;
    const lat = prev.lat + (next.lat - prev.lat) * ratio;
    const lon = prev.lon + (next.lon - prev.lon) * ratio;
    return projector({ lat, lon });
  }, [corridor, contract1, projector, scrubberTime]);

  const nearestNode = useMemo(() => {
    if (!corridor) return null;
    return corridor.corridor.reduce((best, n) =>
      Math.abs(n.hours_ago - scrubberTime) < Math.abs(best.hours_ago - scrubberTime) ? n : best,
      corridor.corridor[0]
    );
  }, [corridor, scrubberTime]);

  const getDisplayTime = (hoursAgo: number) => {
    if (hoursAgo <= 0.05) return 't=0 (observed)';
    return `T-${hoursAgo.toFixed(1)}h`;
  };

  if (!contract1) {
    return (
      <div className="flex-1 relative w-full h-[calc(100vh-72px)] bg-[#0B0E11] flex items-center justify-center select-none">
        <div
          className="flex flex-col items-center gap-4 p-8 max-w-md text-center"
          style={{ background: 'var(--gov-surface)', border: '1px solid var(--gov-border)', borderTop: '3px solid var(--gov-navy)', borderRadius: '2px' }}
        >
          <UploadCloud className="w-8 h-8" style={{ color: 'var(--gov-saffron)' }} />
          <h2 className="text-sm font-bold" style={{ color: 'var(--gov-navy)' }}>No Detection Loaded</h2>
          <p className="text-xs" style={{ color: 'var(--gov-text-secondary)' }}>
            Run scene ingestion first to produce a detected slick polygon before the drift hindcast can run.
          </p>
          <button
            onClick={onGoToIngest}
            className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer"
            style={{ background: 'var(--gov-green)', color: '#ffffff', border: 'none', borderRadius: '2px' }}
          >
            Go to Ingestion
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative w-full h-[calc(100vh-72px)] bg-[#0B0E11] overflow-hidden select-none">

      {/* Dark drift canvas (oceanic simulation — dark is correct here) */}
      <div
        className="absolute inset-0 w-full h-full bg-[#0B0E11]"
        style={{
          backgroundImage: `
            radial-gradient(circle at 45% 55%, rgba(0,0,128,0.1) 0%, transparent 65%),
            linear-gradient(rgba(60,74,70,0.15) 1px, transparent 1px),
            linear-gradient(90deg, rgba(60,74,70,0.15) 1px, transparent 1px)
          `,
          backgroundSize: '100% 100%, 40px 40px, 40px 40px'
        }}
      >
        <img
          src={currentScene.mapImageUrl}
          alt="Satellite drift canvas"
          className="absolute inset-0 w-full h-full object-cover opacity-30 mix-blend-luminosity pointer-events-none"
        />
      </div>

      {/* Loading / error overlays */}
      {isLoading && (
        <div className="absolute inset-0 z-40 flex items-center justify-center" style={{ background: 'rgba(11,14,17,0.7)' }}>
          <div className="flex items-center gap-2.5 px-5 py-3 shadow-lg" style={{ background: 'var(--gov-surface)', borderRadius: '2px' }}>
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--gov-navy)' }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--gov-navy)' }}>Running backward hindcast...</span>
          </div>
        </div>
      )}

      {error && !isLoading && (
        <div className="absolute top-4 left-4 z-40 flex items-center gap-2.5 px-4 py-2.5 max-w-md shadow-lg" style={{ background: 'var(--gov-warning-bg)', border: '1px solid var(--gov-saffron)', borderRadius: '2px' }}>
          <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: 'var(--gov-saffron-dim)' }} />
          <span className="text-xs" style={{ color: 'var(--gov-text-primary)' }}>{error}</span>
          <button
            onClick={() => contract1 && fetchCorridor(contract1)}
            className="ml-1 px-2 py-1 text-[10px] font-semibold uppercase shrink-0 cursor-pointer"
            style={{ background: 'var(--gov-navy)', color: '#ffffff', borderRadius: '2px' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* SVG drift trajectory — real corridor nodes */}
      {corridor && projector && contract1 && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1000 800" preserveAspectRatio="none">
          <defs>
            <filter id="glow-p" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <linearGradient id="backward-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#57f1db" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#57f1db" stopOpacity="0.95" />
            </linearGradient>
          </defs>

          {(() => {
            const origin = projector({ lat: contract1.centroid[1], lon: contract1.centroid[0] });
            const nodePoints = corridor.corridor.map(n => projector({ lat: n.lat, lon: n.lon }));
            const pathD = [origin, ...nodePoints]
              .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
              .join(' ');
            const maxRadius = Math.max(...corridor.corridor.map(n => n.radius_km));

            return (
              <g>
                <path d={pathD} fill="none" stroke="url(#backward-grad)" strokeWidth="3" filter="url(#glow-p)" />

                {/* Observed slick position (t=0) */}
                <circle cx={origin.x} cy={origin.y} r="5" fill="#ffffff" stroke="#57f1db" strokeWidth="2" />
                <text x={origin.x + 12} y={origin.y - 8} fill="#57f1db" fontFamily="IBM Plex Mono" fontSize="11" letterSpacing="1">t=0 (observed)</text>

                {/* Corridor nodes — dot size scales with radius_km (growing uncertainty) */}
                {corridor.corridor.map((node, idx) => {
                  const p = nodePoints[idx];
                  const dotR = 3 + (node.radius_km / maxRadius) * 12;
                  return (
                    <g key={node.hours_ago}>
                      <circle cx={p.x} cy={p.y} r={dotR} fill="rgba(87,241,219,0.15)" stroke="#57f1db" strokeDasharray="4 4" strokeWidth="1.5" />
                      <circle cx={p.x} cy={p.y} r="3" fill="#57f1db" />
                      <text x={p.x + 10} y={p.y - 6} fill="#3cddc7" fontFamily="IBM Plex Mono" fontSize="10.5" letterSpacing="1">
                        T-{node.hours_ago}h (±{node.radius_km.toFixed(1)}km)
                      </text>
                    </g>
                  );
                })}

                {/* Scrubbing marker, interpolated along the real corridor */}
                {markerPos && (
                  <g>
                    <circle cx={markerPos.x} cy={markerPos.y} r="16" fill="rgba(87,241,219,0.2)" stroke="#57f1db" strokeWidth="1.5" strokeDasharray="3 3" />
                    <circle cx={markerPos.x} cy={markerPos.y} r="4" fill="#ffffff" />
                  </g>
                )}
              </g>
            );
          })()}
        </svg>
      )}

      {/* Origin Window Tooltip */}
      {nearestNode && (
        <div
          className="absolute z-20 pointer-events-none"
          style={{ left: '50%', top: '20px', transform: 'translate(-50%, 0)' }}
        >
          <div
            className="px-4 py-2 flex flex-col items-center shadow-lg"
            style={{
              background: 'var(--gov-surface)',
              border: '1px solid var(--gov-navy)',
              borderTop: '3px solid var(--gov-navy)',
              borderRadius: '2px'
            }}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--gov-navy)' }}>Nearest Origin Node</span>
            <span className="font-mono text-xs font-semibold" style={{ color: 'var(--gov-text-primary)' }}>
              T-{nearestNode.hours_ago}h · radius ±{nearestNode.radius_km.toFixed(1)} km
            </span>
          </div>
        </div>
      )}

      {/* Corridor Info Panel — white government card */}
      <div
        id="corridor-info-panel"
        className="absolute top-4 right-4 w-80 z-30 flex flex-col overflow-hidden shadow-lg"
        style={{
          background: 'var(--gov-surface)',
          border: '1px solid var(--gov-border)',
          borderTop: '3px solid var(--gov-navy)',
          borderRadius: '2px'
        }}
      >
        <div
          className="px-4 py-2.5 flex items-center justify-between"
          style={{ background: 'var(--gov-surface-alt)', borderBottom: '1px solid var(--gov-border)' }}
        >
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--gov-navy)' }}>
            Backward Hindcast
          </span>
          <span className={`tag text-[10px] ${corridor?.field_source === 'cmems_era5' ? 'tag-active' : 'tag-amber'}`}>
            {corridor ? (corridor.field_source === 'cmems_era5' ? 'CMEMS + ERA5' : 'Analytic Field') : '—'}
          </span>
        </div>

        <div className="p-4 flex flex-col gap-0.5">
          <div className="flex justify-between items-center py-2" style={{ borderBottom: '1px solid var(--gov-border)' }}>
            <span className="text-xs" style={{ color: 'var(--gov-text-secondary)' }}>Observed At</span>
            <span className="font-mono text-xs font-medium" style={{ color: 'var(--gov-text-primary)' }}>
              {corridor ? new Date(corridor.observed_at).toISOString().slice(11, 19) + ' UTC' : '—'}
            </span>
          </div>

          <div className="flex justify-between items-center py-2" style={{ borderBottom: '1px solid var(--gov-border)' }}>
            <span className="text-xs" style={{ color: 'var(--gov-text-secondary)' }}>Corridor Nodes</span>
            <span className="font-mono text-xs font-semibold" style={{ color: 'var(--gov-navy)' }}>
              {corridor ? corridor.corridor.length : 0}
            </span>
          </div>

          <div className="flex justify-between items-center py-2" style={{ borderBottom: '1px solid var(--gov-border)' }}>
            <span className="text-xs" style={{ color: 'var(--gov-text-secondary)' }}>Max Lookback</span>
            <span className="font-mono text-xs font-semibold" style={{ color: 'var(--gov-navy)' }}>
              {corridor ? Math.max(...corridor.corridor.map(n => n.hours_ago)) : 0}h
            </span>
          </div>

          {corridor?.field_source === 'analytic' && (
            <div className="flex items-start gap-2 mt-2 p-2.5" style={{ background: 'var(--gov-warning-bg)', border: '1px solid var(--gov-saffron)', borderRadius: '2px' }}>
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: 'var(--gov-saffron-dim)' }} />
              <span className="text-[11px] leading-snug" style={{ color: 'var(--gov-text-secondary)' }}>
                Running on an analytic velocity field, not real ocean data. CMEMS/ERA5 readers are wired and swap in as a config change once credentials are configured.
              </span>
            </div>
          )}

          {/* Re-run button */}
          <button
            id="re-run-model-btn"
            onClick={() => contract1 && fetchCorridor(contract1)}
            disabled={isLoading}
            className="mt-2 w-full h-9 flex items-center justify-center gap-2 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
            style={{
              background: 'var(--gov-surface)',
              border: '1.5px solid var(--gov-navy)',
              color: 'var(--gov-navy)',
              borderRadius: '2px'
            }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Recalculating...' : 'Re-Run Drift Hindcast'}
          </button>

          {/* Proceed to suspects */}
          <button
            onClick={onProceedToSuspects}
            disabled={!corridor}
            className="w-full py-2.5 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer mt-1 disabled:opacity-50"
            style={{
              background: 'var(--gov-green)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '2px'
            }}
          >
            <span>Match Suspect Vessels</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Playback Bar — white government panel */}
      {corridor && (
        <div
          id="drift-playback-bar"
          className="absolute bottom-4 left-4 right-4 z-30 flex flex-col shadow-lg p-3"
          style={{
            background: 'var(--gov-surface)',
            border: '1px solid var(--gov-border)',
            borderTop: '2px solid var(--gov-navy)',
            borderRadius: '2px'
          }}
        >
          {/* Scrubber */}
          <div className="h-10 w-full relative px-6 mt-1">
            <div className="absolute top-1/2 -translate-y-1/2 left-6 right-6 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--gov-border)' }}>
              <div className="absolute left-0 top-0 h-full w-full" style={{ background: 'var(--gov-navy)', opacity: 0.5 }} />
            </div>

            {/* Markers */}
            <div className="absolute top-1/2 -translate-y-1/2 left-6 w-[2px] h-3" style={{ background: 'var(--gov-navy)' }} />
            <div className="absolute top-7 left-4 font-mono text-[10px] font-bold" style={{ color: 'var(--gov-navy)' }}>t=0</div>

            <div className="absolute top-1/2 -translate-y-1/2 right-6 w-[2px] h-3" style={{ background: '#9CA3AF' }} />
            <div className="absolute top-7 right-4 font-mono text-[10px]" style={{ color: 'var(--gov-text-muted)' }}>-{maxHoursAgo}h</div>

            {/* Scrubber handle */}
            <div
              className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center group cursor-pointer z-20"
              style={{ left: `calc(24px + (100% - 48px) * ${scrubberTime / maxHoursAgo})` }}
            >
              <div
                className="absolute -top-8 px-2.5 py-0.5 font-mono text-[11px] whitespace-nowrap shadow-md"
                style={{
                  background: 'var(--gov-navy)',
                  color: '#ffffff',
                  borderRadius: '2px'
                }}
              >
                {getDisplayTime(scrubberTime)}
              </div>
              <div className="w-4 h-4 rounded-full" style={{ background: 'var(--gov-navy)', border: '2px solid var(--gov-surface)', boxShadow: '0 1px 3px rgba(0,0,128,0.4)' }} />
            </div>

            <input
              type="range" min="0" max={maxHoursAgo} step="0.1" value={scrubberTime}
              onChange={e => setScrubberTime(Number(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-30"
            />
          </div>

          {/* Playback controls + legend */}
          <div className="flex items-center justify-between px-4 mt-2">
            {/* Controls */}
            <div className="flex items-center gap-4">
              <div
                className="flex items-center rounded overflow-hidden"
                style={{ border: '1px solid var(--gov-border)' }}
              >
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="w-9 h-9 flex items-center justify-center transition-colors cursor-pointer"
                  style={{
                    background: isPlaying ? 'var(--gov-green)' : 'var(--gov-surface-alt)',
                    color: isPlaying ? '#ffffff' : 'var(--gov-text-secondary)',
                    borderRight: '1px solid var(--gov-border)'
                  }}
                  title={isPlaying ? 'Pause simulation' : 'Play simulation'}
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setScrubberTime(0)}
                  className="w-9 h-9 flex items-center justify-center transition-colors cursor-pointer"
                  style={{ background: 'var(--gov-surface-alt)', color: 'var(--gov-text-secondary)' }}
                  title="Rewind to t=0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Speed */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase" style={{ color: 'var(--gov-text-muted)' }}>Speed:</span>
                {[1, 2, 5, 10].map(spd => (
                  <button
                    key={spd}
                    onClick={() => setPlaybackSpeed(spd)}
                    className="px-2 py-0.5 text-xs font-mono font-semibold transition-colors cursor-pointer"
                    style={{
                      background: playbackSpeed === spd ? 'var(--gov-navy)' : 'var(--gov-surface-alt)',
                      color: playbackSpeed === spd ? '#ffffff' : 'var(--gov-text-secondary)',
                      border: '1px solid var(--gov-border)',
                      borderRadius: '2px'
                    }}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-5 font-mono text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: 'var(--gov-navy)' }} />
                <span style={{ color: 'var(--gov-text-secondary)' }}>Backward Hindcast Corridor</span>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
