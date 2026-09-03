import React, { useState, useEffect } from 'react';
import { 
  Ship, 
  RefreshCw, 
  AlertCircle, 
  ExternalLink, 
  Radio, 
  Compass, 
  Navigation, 
  Info, 
  ShieldCheck, 
  Sliders, 
  Anchor,
  X,
  Crosshair,
  Layers,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2
} from 'lucide-react';
import { AisVesselData } from '../server/marinetraffic';

export interface MarineTrafficMapProps {
  centerX?: number;
  centerY?: number;
  zoom?: number;
  className?: string;
  showOverlays?: boolean;
  onSelectVessel?: (vessel: AisVesselData) => void;
  selectedVesselMmsi?: string;
}

export const MarineTrafficMap: React.FC<MarineTrafficMapProps> = ({
  centerX = 60.2,
  centerY = 13.3,
  zoom: initialZoom = 6,
  className = '',
  showOverlays = true,
  onSelectVessel,
  selectedVesselMmsi
}) => {
  const [currentZoom, setCurrentZoom] = useState<number>(initialZoom);
  const [currentCenter, setCurrentCenter] = useState<{ lat: number; lon: number }>({
    lat: centerY,
    lon: centerX
  });
  const [vessels, setVessels] = useState<AisVesselData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [apiSource, setApiSource] = useState<'live_api' | 'demo_simulation'>('demo_simulation');
  const [keyMasked, setKeyMasked] = useState<string>('');
  const [keyConfigured, setKeyConfigured] = useState<boolean>(false);
  const [activeVessel, setActiveVessel] = useState<AisVesselData | null>(null);
  const [mapMode, setMapMode] = useState<'marinetraffic_live' | 'tactical_ais'>('marinetraffic_live');
  const [iframeKey, setIframeKey] = useState<number>(0);

  // Official MarineTraffic Embed URL for zoom:6, centery:13.3, centerx:60.2
  const embedUrl = `https://www.marinetraffic.com/en/ais/embed/zoom:${currentZoom}/centery:${currentCenter.lat}/centerx:${currentCenter.lon}/maptype:4/shownames:true/mmsi:0/shipid:0/fleet:/fleet_id:/vtypes:/showmenu:/remember:false`;
  const directHomeUrl = `https://www.marinetraffic.com/en/ais/home/centerx:${currentCenter.lon}/centery:${currentCenter.lat}/zoom:${currentZoom}`;

  const fetchAisData = async () => {
    setIsLoading(true);
    setErrorNotice(null);
    try {
      const res = await fetch(`/api/marinetraffic/vessels?lat=${currentCenter.lat}&lon=${currentCenter.lon}&zoom=${currentZoom}&timespan=60`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      if (data.success) {
        setVessels(data.vessels || []);
        setApiSource(data.source);
        setKeyConfigured(data.keyConfigured);
        if (data.keyMasked) setKeyMasked(data.keyMasked);
        if (data.error) setErrorNotice(data.error);
      } else {
        setErrorNotice(data.error || 'Failed to fetch MarineTraffic AIS stream.');
        setVessels(data.vessels || []);
      }
    } catch (err: any) {
      setErrorNotice(`Network connection error: ${err.message || String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAisData();
    const interval = setInterval(fetchAisData, 45000);
    return () => clearInterval(interval);
  }, [currentCenter.lat, currentCenter.lon, currentZoom]);

  const handleZoomIn = () => {
    setCurrentZoom(prev => Math.min(prev + 1, 16));
    setIframeKey(prev => prev + 1);
  };

  const handleZoomOut = () => {
    setCurrentZoom(prev => Math.max(prev - 1, 3));
    setIframeKey(prev => prev + 1);
  };

  const handleReset = () => {
    setCurrentCenter({ lat: centerY, lon: centerX });
    setCurrentZoom(initialZoom);
    setIframeKey(prev => prev + 1);
  };

  return (
    <div className={`relative w-full h-full overflow-hidden bg-[#030914] ${className}`}>
      
      {/* 1. INTERACTIVE MARINETRAFFIC LIVE MAP BACKGROUND */}
      {mapMode === 'marinetraffic_live' ? (
        <div className="absolute inset-0 w-full h-full z-0">
          <iframe
            key={iframeKey}
            src={embedUrl}
            title="MarineTraffic Live AIS Map"
            className="w-full h-full border-0 pointer-events-auto"
            allow="fullscreen; geolocation"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            allowFullScreen
          />
        </div>
      ) : (
        /* 2. TACTICAL AIS SATELLITE RADAR MODE */
        <div className="absolute inset-0 w-full h-full z-0 pointer-events-auto">
          {/* Deep Ocean Bathymetric Cartography */}
          <div 
            className="absolute inset-0 w-full h-full bg-cover bg-center opacity-45 mix-blend-luminosity"
            style={{
              backgroundImage: `url("https://images.unsplash.com/photo-1544551763-46a013bb70d5?q=80&w=2070&auto=format&fit=crop")`
            }}
          />
          <div 
            className="absolute inset-0 opacity-90"
            style={{
              background: 'radial-gradient(ellipse at 50% 50%, rgba(6, 24, 48, 0.85) 0%, rgba(2, 9, 20, 0.95) 75%, #01040a 100%)'
            }}
          />

          {/* Graticule lines */}
          <div 
            className="absolute inset-0 opacity-20 pointer-events-none"
            style={{
              backgroundImage: `
                linear-gradient(to right, rgba(59, 130, 246, 0.35) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(59, 130, 246, 0.35) 1px, transparent 1px)
              `,
              backgroundSize: '80px 80px'
            }}
          />

          {/* SVG Vector Overlays */}
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1000 800" preserveAspectRatio="none">
            <defs>
              <radialGradient id="spill-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.45} />
                <stop offset="70%" stopColor="#0d9488" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#042f2e" stopOpacity={0.05} />
              </radialGradient>
            </defs>

            {/* Range Rings */}
            <g opacity="0.2" stroke="#3b82f6" strokeWidth="0.8" fill="none">
              <circle cx="500" cy="400" r="140" strokeDasharray="4 6" />
              <circle cx="500" cy="400" r="280" strokeDasharray="3 8" />
              <circle cx="500" cy="400" r="420" strokeDasharray="2 10" />
            </g>

            {/* Estimated Origin */}
            <ellipse 
              cx="330" 
              cy="520" 
              rx="68" 
              ry="38" 
              transform="rotate(-15 330 520)" 
              fill="rgba(239, 68, 68, 0.15)" 
              stroke="#ef4444" 
              strokeWidth="1.8" 
              strokeDasharray="4 4"
            />
            <circle cx="330" cy="520" r="4" fill="#ef4444" />
            <g transform="translate(260, 565)">
              <rect width="140" height="20" rx="3" fill="#450a0a" stroke="#ef4444" strokeWidth="0.8" opacity="0.9" />
              <text x="7" y="14" fill="#fca5a5" fontFamily="IBM Plex Mono" fontSize="9.5" fontWeight="600">
                EST. ORIGIN (T-14h)
              </text>
            </g>

            {/* Drift Streamlines */}
            <path 
              d="M 520 380 Q 420 450 330 520" 
              fill="none" 
              stroke="#f59e0b" 
              strokeWidth="2.2" 
              strokeDasharray="6 6"
              opacity="0.9"
            />

            {/* Oil Spill Polygon */}
            <path 
              d="M 450 320 C 490 300, 560 320, 600 360 C 640 400, 620 450, 580 480 C 520 520, 460 490, 420 440 C 390 390, 410 340, 450 320 Z" 
              fill="url(#spill-glow)"
              stroke="#2dd4bf"
              strokeWidth="2.2"
            />
            <circle cx="520" cy="380" r="4" fill="#2dd4bf" />
            <g transform="translate(540, 360)">
              <rect width="145" height="25" rx="4" fill="#042f2e" stroke="#2dd4bf" strokeWidth="1" opacity="0.95" />
              <text x="8" y="17" fill="#5eead4" fontFamily="IBM Plex Mono" fontSize="11" fontWeight="600">
                SLICK DET-001 (87%)
              </text>
            </g>

            {/* Live AIS Vessels in Tactical Mode */}
            {vessels.map((v, idx) => {
              const cx = idx === 0 ? 510 : idx === 1 ? 670 : idx === 2 ? 360 : idx === 3 ? 590 : 250;
              const cy = idx === 0 ? 370 : idx === 1 ? 260 : idx === 2 ? 460 : idx === 3 ? 530 : 610;
              const isSelected = activeVessel?.mmsi === v.mmsi;
              return (
                <g 
                  key={v.mmsi}
                  onClick={() => {
                    setActiveVessel(v);
                    if (onSelectVessel) onSelectVessel(v);
                  }}
                  className="cursor-pointer group"
                >
                  <g transform={`translate(${cx}, ${cy}) rotate(${v.headingDeg || 45})`}>
                    <polygon points="0,-9 6,7 -6,7" fill="#f59e0b" stroke={isSelected ? "#ffffff" : "#020617"} strokeWidth="1.4" />
                  </g>
                  <g transform={`translate(${cx + 10}, ${cy - 10})`}>
                    <rect width="105" height="18" rx="3" fill="#070f1e" stroke={isSelected ? "#60a5fa" : "rgba(59, 130, 246, 0.4)"} strokeWidth="1" opacity="0.95" />
                    <text x="6" y="13" fill="#ffffff" fontFamily="IBM Plex Mono" fontSize="9.5" fontWeight="500">
                      {v.name} ({v.speedKnots}kt)
                    </text>
                  </g>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {/* 3. FLOATING TOP-LEFT CONTROL PANEL */}
      <div className="absolute top-4 left-4 z-20 flex flex-col gap-2 max-w-md pointer-events-auto">
        <div className="bg-[#0b1424]/95 backdrop-blur-md border border-[#1e293b] rounded-2xl p-3 shadow-2xl flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${keyConfigured ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-blue-500'} animate-pulse`} />
              <span className="text-xs text-white font-bold tracking-tight">MarineTraffic Live AIS</span>
            </div>
            
          </div>

        </div>

      </div>

      {/* 5. FLOATING VESSEL INSPECTOR CARD */}
      {activeVessel && (
        <div className="absolute bottom-6 right-6 w-96 z-30 bg-[#0b1424]/98 backdrop-blur-md border border-blue-500/50 rounded-2xl p-4 shadow-2xl flex flex-col gap-3 pointer-events-auto animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <Ship className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white tracking-tight">{activeVessel.name}</h4>
                <span className="text-[11px] font-data-mono text-zinc-400">MMSI: {activeVessel.mmsi} • Flag: {activeVessel.flag}</span>
              </div>
            </div>
            <button 
              onClick={() => setActiveVessel(null)}
              className="text-zinc-400 hover:text-white p-1 rounded-md hover:bg-zinc-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-data-mono bg-zinc-900/90 p-3 rounded-xl border border-zinc-800">
            <div>
              <span className="text-[10px] text-zinc-500 block uppercase">Speed Over Ground</span>
              <span className="text-white font-semibold">{activeVessel.speedKnots} knots</span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 block uppercase">Heading / Course</span>
              <span className="text-white font-semibold">{activeVessel.headingDeg}° / {activeVessel.courseDeg}°</span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 block uppercase">Vessel Type</span>
              <span className="text-amber-400 font-semibold">{activeVessel.shipType}</span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 block uppercase">Nav Status</span>
              <span className="text-zinc-300 font-semibold truncate block">{activeVessel.status}</span>
            </div>
          </div>

          {activeVessel.attributionScore && (
            <div className="p-2.5 bg-amber-950/30 border border-amber-500/40 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-amber-300 font-bold">Attribution Likelihood</span>
              </div>
              <span className="font-data-mono text-xs text-amber-400 font-bold">{activeVessel.attributionScore}% Match</span>
            </div>
          )}

          <a
            href={`https://www.marinetraffic.com/en/ais/details/ships/mmsi:${activeVessel.mmsi}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-md shadow-blue-600/20 uppercase tracking-wider"
          >
            <span>View MarineTraffic Dossier</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

    </div>
  );
};
