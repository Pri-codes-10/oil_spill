import React, { useState } from 'react';
import { SceneMetadata, VesselSuspect } from '../../types';
import { SUSPECT_VESSELS } from '../../data';
import { 
  Filter, 
  ChevronRight, 
  Ship, 
  X, 
  AlertTriangle, 
  ShieldAlert, 
  Clock, 
  Compass, 
  ArrowRight,
  TrendingDown,
  ShieldCheck,
  Zap
} from 'lucide-react';

interface SuspectsViewProps {
  currentScene: SceneMetadata;
  onProceedToExport: () => void;
  searchQuery: string;
}

export const SuspectsView: React.FC<SuspectsViewProps> = ({
  currentScene,
  onProceedToExport,
  searchQuery
}) => {
  const [selectedSuspect, setSelectedSuspect] = useState<VesselSuspect>(SUSPECT_VESSELS[0]);
  const [filterStage, setFilterStage] = useState<'all' | 'time' | 'box' | 'scored'>('scored');
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(true);
  const [showMatrixPopover, setShowMatrixPopover] = useState<boolean>(true);

  const filteredVessels = SUSPECT_VESSELS.filter(v => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      v.name.toLowerCase().includes(q) ||
      v.mmsi.toLowerCase().includes(q) ||
      v.flag.toLowerCase().includes(q) ||
      v.type.toLowerCase().includes(q)
    );
  });

  const filterOptions = [
    { id: 'all', label: 'All (2,340)' },
    { id: 'time', label: 'Time (410)' },
    { id: 'box', label: 'Box (38)' },
    { id: 'scored', label: 'Scored (12)' },
  ] as const;

  return (
    <div
      className="flex-1 flex h-[calc(100vh-72px)] w-full overflow-hidden select-none"
      style={{ background: 'var(--gov-bg)' }}
    >

      {/* Left Column: Vessel List */}
      <section
        id="suspects-list-panel"
        className="w-full sm:w-[380px] h-full flex flex-col shrink-0 z-20"
        style={{ background: '#ffffff', borderRight: '1px solid var(--gov-border)' }}
      >
        {/* Panel header */}
        <div
          className="p-4 flex flex-col gap-3"
          style={{ background: '#EEF0F7', borderBottom: '3px solid var(--gov-navy)' }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--gov-navy)' }}>
              <Filter className="w-3.5 h-3.5" style={{ color: 'var(--gov-saffron)' }} />
              Attribution Funnel
            </span>
            <span className="tag tag-active text-[10px]">Ranked AIS Match</span>
          </div>

          {/* Filter pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {filterOptions.map((opt, idx) => (
              <React.Fragment key={opt.id}>
                <button
                  onClick={() => setFilterStage(opt.id)}
                  className="px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer"
                  style={{
                    background: filterStage === opt.id ? 'var(--gov-navy)' : '#ffffff',
                    color: filterStage === opt.id ? '#ffffff' : 'var(--gov-text-secondary)',
                    border: '1px solid var(--gov-border)',
                    borderRadius: '2px'
                  }}
                >
                  {opt.label}
                </button>
                {idx < filterOptions.length - 1 && (
                  <ChevronRight className="w-3 h-3" style={{ color: 'var(--gov-border-strong)' }} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Vessel list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filteredVessels.map((vessel) => {
            const isSelected = selectedSuspect.id === vessel.id;
            const scoreColor = vessel.score >= 80
              ? 'var(--gov-green)'
              : vessel.score >= 60
                ? 'var(--gov-saffron-dim)'
                : 'var(--gov-text-muted)';

            return (
              <div
                key={vessel.id}
                id={`vessel-card-${vessel.id}`}
                onClick={() => { setSelectedSuspect(vessel); setIsProfileOpen(true); }}
                className="p-3.5 cursor-pointer transition-colors"
                style={{
                  background: isSelected ? 'var(--gov-navy-light)' : '#F5F6F8',
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
                      background: vessel.rank === 1 ? 'var(--gov-green)' : '#ffffff',
                      color: vessel.rank === 1 ? '#ffffff' : 'var(--gov-text-secondary)',
                      border: `1px solid ${vessel.rank === 1 ? 'var(--gov-green)' : 'var(--gov-border)'}`,
                      borderRadius: '2px'
                    }}
                  >
                    #{vessel.rank}
                  </div>
                </div>

                <div className="flex gap-4 text-[10px] font-semibold uppercase mb-2.5" style={{ color: 'var(--gov-text-muted)' }}>
                  <span>FLAG: {vessel.flag}</span>
                  <span>TYPE: {vessel.type}</span>
                </div>

                {/* Score bar */}
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold w-8 text-right" style={{ color: scoreColor }}>
                    {vessel.score}%
                  </span>
                  <div className="flex-1 h-2 rounded-sm overflow-hidden" style={{ background: '#E2E8F0' }}>
                    <div
                      className="h-full transition-all duration-300"
                      style={{ width: `${vessel.score}%`, background: scoreColor, borderRadius: '1px' }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Export action */}
        <div
          className="p-4"
          style={{ borderTop: '1px solid var(--gov-border)', background: '#F5F6F8' }}
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

          {/* SVG vessel tracks */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1000 800" preserveAspectRatio="none">
            <path d="M 100 300 Q 200 250 300 400 T 500 350" fill="none" stroke="#9CA3AF" strokeDasharray="4 4" strokeWidth="1.5" opacity="0.6" />
            <path d="M 180 180 Q 320 280 480 340 T 780 460" fill="none" stroke="#9CA3AF" strokeDasharray="4 4" strokeWidth="1.5" opacity="0.6" />

            {/* Slick origin */}
            <ellipse cx="510" cy="400" rx="35" ry="18" fill="rgba(0,0,128,0.12)" stroke="#000080" strokeWidth="1.5" strokeDasharray="3 3" />
            <circle cx="510" cy="400" r="3" fill="#000080" />
            <text x="525" y="405" fill="#000080" fontFamily="IBM Plex Mono" fontSize="11" fontWeight="600">ESTIMATED ORIGIN</text>

            {/* Active vessel track */}
            <path d="M 250 150 Q 400 300 510 400 T 800 450" fill="none" stroke="#000080" strokeWidth="3.5" className="map-glow" />
            <circle cx="250" cy="150" r="3.5" fill="#000080" />
            <circle cx="400" cy="300" r="3.5" fill="#000080" />
            <circle cx="510" cy="400" r="5" fill="#FF9933" stroke="#ffffff" strokeWidth="1.5" />
            <circle cx="650" cy="425" r="3.5" fill="#000080" />
            <circle cx="800" cy="450" r="6" fill="#138808" className="animate-ping" />
            <circle cx="800" cy="450" r="5" fill="#138808" />
            <circle cx="800" cy="450" r="14" fill="none" stroke="#138808" strokeWidth="1.5" opacity="0.6" />
            <text x="818" y="455" fill="#138808" fontFamily="IBM Plex Mono" fontSize="12" fontWeight="700">
              {selectedSuspect.name} (LIVE FIX)
            </text>
          </svg>

          {/* Attribution Matrix Card */}
          {showMatrixPopover && (
            <div
              id="attribution-matrix-popover"
              className="absolute top-4 right-4 w-80 p-4 z-30 shadow-lg"
              style={{
                background: '#ffffff',
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
                  {selectedSuspect.score}% Match
                </span>
              </div>

              <div className="space-y-3">
                {[
                  { label: 'Spatial Proximity', value: selectedSuspect.proximityScore, color: 'var(--gov-navy)' },
                  { label: 'Course & Heading Match', value: selectedSuspect.headingMatchScore, color: 'var(--gov-navy)' },
                  { label: 'Temporal Window Sync', value: selectedSuspect.timingScore, color: 'var(--gov-navy)' },
                  { label: 'Speed Profile Delta', value: selectedSuspect.speedProfileScore, color: 'var(--gov-saffron-dim)' },
                ].map(row => (
                  <div key={row.label}>
                    <div className="flex justify-between font-mono text-xs mb-1" style={{ color: 'var(--gov-text-secondary)' }}>
                      <span>{row.label}</span>
                      <span className="font-semibold" style={{ color: row.color }}>{row.value}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-sm overflow-hidden" style={{ background: '#E2E8F0' }}>
                      <div className="h-full" style={{ width: `${row.value}%`, background: row.color, borderRadius: '1px' }} />
                    </div>
                  </div>
                ))}

                <div
                  className="pt-2 flex justify-between items-center"
                  style={{ borderTop: '1px solid var(--gov-border)' }}
                >
                  <span className="text-[10px] font-semibold uppercase" style={{ color: 'var(--gov-text-muted)' }}>AIS Integrity</span>
                  <span className={`tag ${selectedSuspect.aisStatus === 'NO GAP' ? 'tag-active' : 'tag-amber'} text-[10px]`}>
                    {selectedSuspect.aisStatus}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Vessel Profile Drawer */}
        {isProfileOpen && (
          <div
            id="vessel-profile-drawer"
            className="h-60 shrink-0 flex flex-col z-30 shadow-lg"
            style={{ background: '#ffffff', borderTop: '3px solid var(--gov-navy)' }}
          >
            {/* Drawer header */}
            <div
              className="px-5 py-2.5 flex justify-between items-center"
              style={{ background: '#EEF0F7', borderBottom: '1px solid var(--gov-border)' }}
            >
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold uppercase tracking-wide flex items-center gap-2" style={{ color: 'var(--gov-navy)' }}>
                  <Ship className="w-4 h-4" style={{ color: 'var(--gov-saffron)' }} />
                  Vessel Profile: {selectedSuspect.name}
                </span>
                <span className="font-mono text-xs font-medium" style={{ color: 'var(--gov-navy)' }}>
                  (IMO: {selectedSuspect.details.imo} | Callsign: {selectedSuspect.details.callsign})
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs hidden md:inline font-mono" style={{ color: 'var(--gov-text-muted)' }}>
                  Dest: {selectedSuspect.details.destination}
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

            {/* Drawer content */}
            <div className="flex-1 flex flex-col md:flex-row p-3 gap-3 overflow-hidden">

              {/* Speed Chart */}
              <div
                className="flex-1 flex flex-col h-full p-3"
                style={{ border: '1px solid var(--gov-border)', borderRadius: '2px', background: '#F5F6F8' }}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--gov-text-secondary)' }}>
                    Speed Profile (Knots / 24h)
                  </span>
                  <span className="font-mono text-[10px] flex items-center gap-1 font-semibold" style={{ color: 'var(--gov-saffron-dim)' }}>
                    <TrendingDown className="w-3 h-3" /> Anomaly at T-14h
                  </span>
                </div>

                <div className="flex-1 relative flex items-end justify-between px-4 pb-2" style={{ borderBottom: '1px solid var(--gov-border)', borderLeft: '1px solid var(--gov-border)' }}>
                  <div className="absolute left-1 top-0 bottom-2 flex flex-col justify-between font-mono text-[8px]" style={{ color: 'var(--gov-text-muted)' }}>
                    <span>20kt</span><span>10kt</span><span>0kt</span>
                  </div>
                  {selectedSuspect.speedHistory.map((item, idx) => (
                    <div key={idx} className="flex flex-col items-center gap-1 group relative">
                      <div
                        className="absolute -top-7 opacity-0 group-hover:opacity-100 px-2 py-0.5 font-mono text-[10px] whitespace-nowrap pointer-events-none z-20 shadow"
                        style={{
                          background: '#ffffff',
                          border: '1px solid var(--gov-border)',
                          color: 'var(--gov-text-primary)',
                          borderRadius: '2px'
                        }}
                      >
                        {item.time}: {item.knots} kt
                      </div>
                      <div
                        className="w-4 rounded-t-sm transition-all"
                        style={{
                          height: `${(item.knots / 20) * 100}%`,
                          background: item.isAnomaly ? 'var(--gov-saffron)' : 'var(--gov-navy)',
                          opacity: item.isAnomaly ? 1 : 0.5
                        }}
                      />
                      <span className="font-mono text-[9px]" style={{ color: 'var(--gov-text-muted)' }}>{item.time}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* AIS Ping Timeline */}
              <div
                className="flex-1 flex flex-col h-full p-3"
                style={{ border: '1px solid var(--gov-border)', borderRadius: '2px', background: '#F5F6F8' }}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--gov-text-secondary)' }}>
                    AIS Transmission Continuity
                  </span>
                  <span className="font-mono text-[10px] font-semibold" style={{ color: 'var(--gov-navy)' }}>Fix Count: 24</span>
                </div>

                <div className="flex-1 relative flex items-center px-4">
                  <div className="absolute left-4 right-4 h-[1px] top-1/2 -translate-y-1/2" style={{ background: 'var(--gov-border)' }} />
                  <div className="w-full flex justify-between relative z-10">
                    {selectedSuspect.pings.map((ping, idx) => (
                      <div key={idx} className="flex flex-col items-center gap-1 group relative">
                        <div
                          className="w-3.5 h-3.5 rotate-45 border transition-all"
                          style={{
                            background: ping.isGap
                              ? 'var(--gov-error-bg)'
                              : ping.time === 'NOW'
                                ? 'var(--gov-green)'
                                : 'var(--gov-navy)',
                            borderColor: ping.isGap
                              ? 'var(--gov-error)'
                              : ping.time === 'NOW'
                                ? 'var(--gov-green)'
                                : 'var(--gov-navy)',
                            opacity: ping.isGap ? 1 : ping.time === 'NOW' ? 1 : 0.6,
                            transform: ping.time === 'NOW' ? 'rotate(45deg) scale(1.2)' : 'rotate(45deg)'
                          }}
                        />
                        <span className="font-mono text-[8px] mt-1" style={{ color: 'var(--gov-text-muted)' }}>{ping.time}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-between px-2 font-mono text-[9px]" style={{ color: 'var(--gov-text-muted)' }}>
                  <span>T-24h (Telemetry Start)</span>
                  <span>NOW (Active Fix)</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

    </div>
  );
};
