import React, { useState, useEffect } from 'react';
import { EnvironmentalInputs, SceneMetadata } from '../../types';
import { DEFAULT_ENVIRONMENT } from '../../data';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Sliders, 
  RefreshCw, 
  Ship,
  ArrowRight,
} from 'lucide-react';

interface DriftViewProps {
  currentScene: SceneMetadata;
  onProceedToSuspects: () => void;
}

export const DriftView: React.FC<DriftViewProps> = ({
  currentScene,
  onProceedToSuspects
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [scrubberTime, setScrubberTime] = useState<number>(50);
  const [envInputs, setEnvInputs] = useState<EnvironmentalInputs>(DEFAULT_ENVIRONMENT);
  const [isReRunning, setIsReRunning] = useState<boolean>(false);

  useEffect(() => {
    let interval: any;
    if (isPlaying) {
      interval = setInterval(() => {
        setScrubberTime(prev => {
          if (prev >= 100) return 0;
          return prev + (0.5 * playbackSpeed);
        });
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed]);

  const handleReRunModel = () => {
    setIsReRunning(true);
    setTimeout(() => setIsReRunning(false), 1200);
  };

  const getDisplayTime = (val: number) => {
    if (val <= 75) {
      const hoursBack = Math.round(((75 - val) / 75) * 72);
      if (hoursBack === 0) return 't=0 (14:22 UTC)';
      const h = Math.floor(hoursBack);
      return `T-${h}h (${(14 - (h % 24) + 24) % 24}:00 UTC)`;
    } else {
      const hoursForward = Math.round(((val - 75) / 25) * 24);
      return `T+${hoursForward}h (${(14 + (hoursForward % 24)) % 24}:00 UTC)`;
    }
  };

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

      {/* SVG drift trajectories */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1000 800" preserveAspectRatio="none">
        <defs>
          <filter id="glow-p" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="glow-s" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <linearGradient id="backward-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#57f1db" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#57f1db" stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id="forward-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF9933" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#FF9933" stopOpacity="0.1" />
          </linearGradient>
        </defs>

        <polygon points="450,440 180,680 280,750" fill="rgba(255,153,51,0.1)" stroke="#FF9933" strokeOpacity="0.35" strokeWidth="1" />
        <path d="M 700 200 Q 600 280 450 440" fill="none" stroke="url(#backward-grad)" strokeWidth="3.5" filter="url(#glow-p)" className="path-backward" />
        <path d="M 450 440 Q 300 560 200 680" fill="none" stroke="url(#forward-grad)" strokeWidth="3.5" filter="url(#glow-s)" className="path-forward" />

        <ellipse cx="450" cy="440" rx="85" ry="45" transform="rotate(-15 450 440)" fill="rgba(87,241,219,0.16)" stroke="#57f1db" strokeDasharray="4 4" strokeWidth="1.5" filter="url(#glow-p)" />
        <circle cx="450" cy="440" r="4.5" fill="#57f1db" filter="url(#glow-p)" />
        <circle cx="450" cy="440" r="14" fill="none" stroke="#57f1db" strokeWidth="1" opacity="0.6" />

        <circle cx="700" cy="200" r="3.5" fill="#57f1db" />
        <text x="712" y="198" fill="#3cddc7" fontFamily="IBM Plex Mono" fontSize="11" letterSpacing="1">T-72h</text>
        <circle cx="560" cy="340" r="3.5" fill="#57f1db" />
        <text x="572" y="338" fill="#3cddc7" fontFamily="IBM Plex Mono" fontSize="11" letterSpacing="1">T-24h</text>
        <circle cx="340" cy="520" r="3.5" fill="#FF9933" />
        <text x="352" y="518" fill="#FF9933" fontFamily="IBM Plex Mono" fontSize="11" letterSpacing="1">T+12h</text>
        <circle cx="200" cy="680" r="3.5" fill="#FF9933" />
        <text x="212" y="678" fill="#FF9933" fontFamily="IBM Plex Mono" fontSize="11" letterSpacing="1">T+24h</text>

        {(() => {
          let cx = 450; let cy = 440;
          if (scrubberTime <= 75) {
            const ratio = scrubberTime / 75;
            cx = 700 + (450 - 700) * ratio;
            cy = 200 + (440 - 200) * ratio;
          } else {
            const ratio = (scrubberTime - 75) / 25;
            cx = 450 + (200 - 450) * ratio;
            cy = 440 + (680 - 440) * ratio;
          }
          return (
            <g>
              <circle cx={cx} cy={cy} r="18" fill="rgba(87,241,219,0.2)" stroke="#57f1db" strokeWidth="1.5" strokeDasharray="3 3" />
              <circle cx={cx} cy={cy} r="4" fill="#ffffff" />
            </g>
          );
        })()}
      </svg>

      {/* Origin Window Tooltip */}
      <div
        className="absolute z-20 pointer-events-none"
        style={{ left: '45%', top: '55%', transform: 'translate(-50%, -130px)' }}
      >
        <div
          className="px-4 py-2 flex flex-col items-center"
          style={{
            background: 'rgba(255,255,255,0.92)',
            border: '1px solid var(--gov-navy)',
            borderTop: '3px solid var(--gov-navy)',
            borderRadius: '2px'
          }}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--gov-navy)' }}>Origin Window</span>
          <span className="font-mono text-xs font-semibold" style={{ color: 'var(--gov-text-primary)' }}>14:00–18:00 UTC</span>
        </div>
        <div className="w-[2px] h-8 mx-auto mt-0.5" style={{ background: 'var(--gov-navy)', opacity: 0.6 }} />
      </div>

      {/* AIS Vessel Track Labels */}
      <div
        className="absolute left-[65%] top-[34%] z-10 flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-all hover:scale-105"
        style={{
          background: 'rgba(255,255,255,0.92)',
          border: '1px solid var(--gov-navy)',
          borderLeft: '3px solid var(--gov-navy)',
          borderRadius: '2px'
        }}
        onClick={onProceedToSuspects}
        title="Click to view suspect profile"
      >
        <Ship className="w-3.5 h-3.5" style={{ color: 'var(--gov-navy)' }} />
        <span className="font-mono text-[11px] font-medium" style={{ color: 'var(--gov-navy)' }}>MT OCEAN GLORY (MMSI: 244...)</span>
      </div>

      <div
        className="absolute left-[30%] top-[72%] z-10 flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-all hover:scale-105"
        style={{
          background: 'rgba(255,255,255,0.92)',
          border: '1px solid var(--gov-saffron)',
          borderLeft: '3px solid var(--gov-saffron)',
          borderRadius: '2px'
        }}
        onClick={onProceedToSuspects}
      >
        <Ship className="w-3.5 h-3.5" style={{ color: 'var(--gov-saffron-dim)' }} />
        <span className="font-mono text-[11px] font-medium" style={{ color: 'var(--gov-saffron-dim)' }}>MV SEA BREEZE (MMSI: 352...)</span>
      </div>

      {/* Environmental Inputs Panel — white government card */}
      <div
        id="environmental-inputs-panel"
        className="absolute top-4 right-4 w-80 z-30 flex flex-col overflow-hidden shadow-lg"
        style={{
          background: '#ffffff',
          border: '1px solid var(--gov-border)',
          borderTop: '3px solid var(--gov-navy)',
          borderRadius: '2px'
        }}
      >
        <div
          className="px-4 py-2.5 flex items-center justify-between"
          style={{ background: '#EEF0F7', borderBottom: '1px solid var(--gov-border)' }}
        >
          <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--gov-navy)' }}>
            <Sliders className="w-3.5 h-3.5" style={{ color: 'var(--gov-saffron)' }} />
            Ocean Engine Parameters
          </span>
          <span className="tag tag-active text-[10px]">Active Run</span>
        </div>

        <div className="p-4 flex flex-col gap-0.5">
          {/* Current Model */}
          <div className="flex justify-between items-center py-2" style={{ borderBottom: '1px solid var(--gov-border)' }}>
            <span className="text-xs" style={{ color: 'var(--gov-text-secondary)' }}>Current Model</span>
            <select
              value={envInputs.currentModel}
              onChange={e => setEnvInputs({ ...envInputs, currentModel: e.target.value as any })}
              className="gov-select text-xs"
              style={{ color: 'var(--gov-navy)' }}
            >
              <option value="HYCOM">HYCOM (0.08° Global)</option>
              <option value="NEMO">NEMO (CMEMS)</option>
              <option value="COPERNICUS">COPERNICUS Marine</option>
            </select>
          </div>

          {/* Wind Model */}
          <div className="flex justify-between items-center py-2" style={{ borderBottom: '1px solid var(--gov-border)' }}>
            <span className="text-xs" style={{ color: 'var(--gov-text-secondary)' }}>Wind Model</span>
            <select
              value={envInputs.windModel}
              onChange={e => setEnvInputs({ ...envInputs, windModel: e.target.value as any })}
              className="gov-select text-xs"
              style={{ color: 'var(--gov-navy)' }}
            >
              <option value="GFS">GFS (0.25°)</option>
              <option value="ECMWF">ECMWF HRES</option>
              <option value="HRRR">HRRR High-Res</option>
            </select>
          </div>

          {/* Resolution */}
          <div className="flex justify-between items-center py-2" style={{ borderBottom: '1px solid var(--gov-border)' }}>
            <span className="text-xs" style={{ color: 'var(--gov-text-secondary)' }}>Spatial Resolution</span>
            <span className="font-mono text-xs font-medium" style={{ color: 'var(--gov-text-primary)' }}>{envInputs.resolution}</span>
          </div>

          {/* Leeway Coeff */}
          <div className="flex justify-between items-center py-2" style={{ borderBottom: '1px solid var(--gov-border)' }}>
            <span className="text-xs" style={{ color: 'var(--gov-text-secondary)' }}>Leeway Drag Coeff</span>
            <span className="font-mono text-xs font-semibold" style={{ color: 'var(--gov-navy)' }}>{envInputs.leewayCoeff}%</span>
          </div>

          {/* Re-run button */}
          <button
            id="re-run-model-btn"
            onClick={handleReRunModel}
            disabled={isReRunning}
            className="mt-2 w-full h-9 flex items-center justify-center gap-2 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
            style={{
              background: '#ffffff',
              border: '1.5px solid var(--gov-navy)',
              color: 'var(--gov-navy)',
              borderRadius: '2px'
            }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isReRunning ? 'animate-spin' : ''}`} />
            {isReRunning ? 'Recalculating Trajectory...' : 'Re-Run Drift Simulation'}
          </button>

          {/* Proceed to suspects */}
          <button
            onClick={onProceedToSuspects}
            className="w-full py-2.5 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer mt-1"
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
      <div
        id="drift-playback-bar"
        className="absolute bottom-4 left-4 right-4 z-30 flex flex-col shadow-lg p-3"
        style={{
          background: 'rgba(255,255,255,0.95)',
          border: '1px solid var(--gov-border)',
          borderTop: '2px solid var(--gov-navy)',
          borderRadius: '2px'
        }}
      >
        {/* Scrubber */}
        <div className="h-10 w-full relative px-6 mt-1">
          <div className="absolute top-1/2 -translate-y-1/2 left-6 right-6 h-1.5 rounded-full overflow-hidden" style={{ background: '#CBD5E0' }}>
            <div className="absolute left-0 top-0 h-full" style={{ width: '75%', background: 'var(--gov-navy)', opacity: 0.5 }} />
            <div className="absolute left-[75%] top-0 h-full w-1/4" style={{ background: 'var(--gov-saffron)', opacity: 0.5 }} />
          </div>

          {/* Markers */}
          <div className="absolute top-1/2 -translate-y-1/2 left-6 w-[2px] h-3" style={{ background: '#9CA3AF' }} />
          <div className="absolute top-7 left-4 font-mono text-[10px]" style={{ color: 'var(--gov-text-muted)' }}>-72h</div>

          <div className="absolute top-1/2 -translate-y-1/2 left-[75%] w-[2px] h-4 z-10" style={{ background: 'var(--gov-navy)' }} />
          <div className="absolute top-7 left-[calc(75%-10px)] font-mono text-[10px] font-bold" style={{ color: 'var(--gov-navy)' }}>t=0</div>

          <div className="absolute top-1/2 -translate-y-1/2 right-6 w-[2px] h-3" style={{ background: '#9CA3AF' }} />
          <div className="absolute top-7 right-4 font-mono text-[10px]" style={{ color: 'var(--gov-text-muted)' }}>+24h</div>

          {/* Scrubber handle */}
          <div
            className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center group cursor-pointer z-20"
            style={{ left: `calc(24px + (100% - 48px) * ${scrubberTime / 100})` }}
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
            <div className="w-4 h-4 rounded-full" style={{ background: 'var(--gov-navy)', border: '2px solid #ffffff', boxShadow: '0 1px 3px rgba(0,0,128,0.4)' }} />
          </div>

          <input
            type="range" min="0" max="100" value={scrubberTime}
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
                  background: isPlaying ? 'var(--gov-green)' : '#ffffff',
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
                style={{ background: '#ffffff', color: 'var(--gov-text-secondary)' }}
                title="Rewind to -72h"
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
                    background: playbackSpeed === spd ? 'var(--gov-navy)' : '#ffffff',
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
              <span style={{ color: 'var(--gov-text-secondary)' }}>Historical Hindcast (-72h)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: 'var(--gov-saffron)' }} />
              <span style={{ color: 'var(--gov-text-secondary)' }}>Future Dispersion (+24h)</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};
