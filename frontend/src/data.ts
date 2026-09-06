import { EnvironmentalInputs, GisLayers, MorphologicalProperties, OperationNotification, SceneMetadata, VesselSuspect } from './types';
import logo from './assets/logo_aqua.svg';
import spillTraceBg from './assets/spilltrace_bg.jpg';
import backgroundDark from './assets/background_dark.jpg';

export const APP_BACKGROUND = spillTraceBg; 
export const APP_BACKGROUND_DARK = backgroundDark;
export const APP_LOGO = logo;
export const DEMO_SCENES: SceneMetadata[] = [
  {
    id: 'north_sea',
    backendScenePath: 'north_sea',
    name: 'North Sea - Sentinel-1A',
    satellite: 'SENTINEL-1A',
    acquisition: '2023-10-24 14:22 UTC',
    orbit: '42910',
    mode: 'IW',
    polarisations: 'VV+VH',
    coordinates: '58.3421°N, 2.1190°E',
    lat: 58.3421,
    lon: 2.1190,
    locationName: 'North Sea (Forties Field)',
    thumbnailUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCw1AqYDpVDw8edt72NNPTlp-95sJ3ZOB3J3LbzCNHu4QFV2tCoOQWovigNA4HMbKGpE3xcEz5xcrPkDjF4xMjRjPiny8j_hU2hc3InOmczXSTu-z3E-GVUrjhRMFdIZGs5JyorZBTk8ICZG3OQKcwNwpAxRWNFjxmgZlbggEvNcooHSo1Ehrfj1sPQ9SCxTkJM4LmTaEo5p2znGNyMv6GRckVVG6GZLJ7KD0ZKPG_mm46NpIAEqxOUlA',
    mapImageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBHCgnI_o-oUNnWU94r8oQ3xpVTES73lKSEsUW_kXi50CQK4fvtUDmhf-OCFrbLSKMA3tW5jN273RE96JJvBs83xdAyTpSHbULM8uJgikT5WGHEVouQYDUGh7N4oDaivKziNc2Zaj3twJrEzkt216BgbDedKScXhxrXJlE3ar0PZVSiEJ3k1msb7OH6q__DTqSuQQKamwVxUFB0o8-ESXgK219fgmCUwgUl6rDRRtebXafKuG6yvi0eow',
    detectionImageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB48gkrxu9dRDxnav9UXL3jE1crNE5Kc6TJw1X7W-fV6Ac8kEfIwXQQVe-RT_7zZInH8dtOCm0iHB_27fwn15Ci4PsyYJA4CvIJjINLr1GrfnHjbzLEHzf_1NERF9N1KUkPbLuHT37DjqkSsNGrXKvUFYHY4v4ycFS935VImeGX_AtqtRDiwp0uAf7I03EQaTSQBQd92PslZVyxa4YNid10kaUzK3Bj_UUI8sNiaP7yL89m17ou5JIUoQ'
  },
  {
    id: 'panama_canal',
    backendScenePath: 'panama_canal',
    name: 'Panama Canal - Sentinel-1B',
    satellite: 'SENTINEL-1B',
    acquisition: '2023-11-08 09:45 UTC',
    orbit: '38112',
    mode: 'IW',
    polarisations: 'VV+VH',
    coordinates: '9.1420°N, 79.7210°W',
    lat: 9.1420,
    lon: -79.7210,
    locationName: 'Panama Canal Approaches',
    thumbnailUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCc7VeEnRohbQn4YRPyEG8eZyZ-J5-s89MKCkRHN8gnZl45-4UToq7hSFnrrAYO_vJWxJkrfjL351htk8pqmfz2txc_hXdOMC3xdB_ZtMQHtwdIBFndd5cLIHOnJN1FdckYxCcEvhUoV-KfNBmUQoxpF3WEf_SGdQvksbPJ0SNC1fPQCHI38yIYS95c-v6XTXjG5tNs6GLJIaqOJp0VYgFYqzkIY4ZLNF7vBKek9XTLE4qOjh_3xXm4lA',
    mapImageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCc7VeEnRohbQn4YRPyEG8eZyZ-J5-s89MKCkRHN8gnZl45-4UToq7hSFnrrAYO_vJWxJkrfjL351htk8pqmfz2txc_hXdOMC3xdB_ZtMQHtwdIBFndd5cLIHOnJN1FdckYxCcEvhUoV-KfNBmUQoxpF3WEf_SGdQvksbPJ0SNC1fPQCHI38yIYS95c-v6XTXjG5tNs6GLJIaqOJp0VYgFYqzkIY4ZLNF7vBKek9XTLE4qOjh_3xXm4lA',
    detectionImageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB48gkrxu9dRDxnav9UXL3jE1crNE5Kc6TJw1X7W-fV6Ac8kEfIwXQQVe-RT_7zZInH8dtOCm0iHB_27fwn15Ci4PsyYJA4CvIJjINLr1GrfnHjbzLEHzf_1NERF9N1KUkPbLuHT37DjqkSsNGrXKvUFYHY4v4ycFS935VImeGX_AtqtRDiwp0uAf7I03EQaTSQBQd92PslZVyxa4YNid10kaUzK3Bj_UUI8sNiaP7yL89m17ou5JIUoQ'
  },
  {
    id: 'gulf_mexico',
    backendScenePath: 'gulf_mexico',
    name: 'Gulf of Mexico - TerraSAR-X',
    satellite: 'TERRASAR-X',
    acquisition: '2023-09-15 18:10 UTC',
    orbit: '51204',
    mode: 'SM',
    polarisations: 'HH+HV',
    coordinates: '27.8105°N, 91.2401°W',
    lat: 27.8105,
    lon: -91.2401,
    locationName: 'Mississippi Canyon (GoM)',
    thumbnailUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCw1AqYDpVDw8edt72NNPTlp-95sJ3ZOB3J3LbzCNHu4QFV2tCoOQWovigNA4HMbKGpE3xcEz5xcrPkDjF4xMjRjPiny8j_hU2hc3InOmczXSTu-z3E-GVUrjhRMFdIZGs5JyorZBTk8ICZG3OQKcwNwpAxRWNFjxmgZlbggEvNcooHSo1Ehrfj1sPQ9SCxTkJM4LmTaEo5p2znGNyMv6GRckVVG6GZLJ7KD0ZKPG_mm46NpIAEqxOUlA',
    mapImageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBHCgnI_o-oUNnWU94r8oQ3xpVTES73lKSEsUW_kXi50CQK4fvtUDmhf-OCFrbLSKMA3tW5jN273RE96JJvBs83xdAyTpSHbULM8uJgikT5WGHEVouQYDUGh7N4oDaivKziNc2Zaj3twJrEzkt216BgbDedKScXhxrXJlE3ar0PZVSiEJ3k1msb7OH6q__DTqSuQQKamwVxUFB0o8-ESXgK219fgmCUwgUl6rDRRtebXafKuG6yvi0eow',
    detectionImageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB48gkrxu9dRDxnav9UXL3jE1crNE5Kc6TJw1X7W-fV6Ac8kEfIwXQQVe-RT_7zZInH8dtOCm0iHB_27fwn15Ci4PsyYJA4CvIJjINLr1GrfnHjbzLEHzf_1NERF9N1KUkPbLuHT37DjqkSsNGrXKvUFYHY4v4ycFS935VImeGX_AtqtRDiwp0uAf7I03EQaTSQBQd92PslZVyxa4YNid10kaUzK3Bj_UUI8sNiaP7yL89m17ou5JIUoQ'
  },
  {
    id: 'mediterranean',
    backendScenePath: 'mediterranean',
    name: 'Mediterranean - Radarsat-2',
    satellite: 'RADARSAT-2',
    acquisition: '2023-10-02 21:05 UTC',
    orbit: '19044',
    mode: 'SCN',
    polarisations: 'VV+VH',
    coordinates: '36.4210°N, 14.8820°E',
    lat: 36.4210,
    lon: 14.8820,
    locationName: 'Sicily Channel (Mediterranean)',
    thumbnailUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCw1AqYDpVDw8edt72NNPTlp-95sJ3ZOB3J3LbzCNHu4QFV2tCoOQWovigNA4HMbKGpE3xcEz5xcrPkDjF4xMjRjPiny8j_hU2hc3InOmczXSTu-z3E-GVUrjhRMFdIZGs5JyorZBTk8ICZG3OQKcwNwpAxRWNFjxmgZlbggEvNcooHSo1Ehrfj1sPQ9SCxTkJM4LmTaEo5p2znGNyMv6GRckVVG6GZLJ7KD0ZKPG_mm46NpIAEqxOUlA',
    mapImageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBHCgnI_o-oUNnWU94r8oQ3xpVTES73lKSEsUW_kXi50CQK4fvtUDmhf-OCFrbLSKMA3tW5jN273RE96JJvBs83xdAyTpSHbULM8uJgikT5WGHEVouQYDUGh7N4oDaivKziNc2Zaj3twJrEzkt216BgbDedKScXhxrXJlE3ar0PZVSiEJ3k1msb7OH6q__DTqSuQQKamwVxUFB0o8-ESXgK219fgmCUwgUl6rDRRtebXafKuG6yvi0eow',
    detectionImageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB48gkrxu9dRDxnav9UXL3jE1crNE5Kc6TJw1X7W-fV6Ac8kEfIwXQQVe-RT_7zZInH8dtOCm0iHB_27fwn15Ci4PsyYJA4CvIJjINLr1GrfnHjbzLEHzf_1NERF9N1KUkPbLuHT37DjqkSsNGrXKvUFYHY4v4ycFS935VImeGX_AtqtRDiwp0uAf7I03EQaTSQBQd92PslZVyxa4YNid10kaUzK3Bj_UUI8sNiaP7yL89m17ou5JIUoQ'
  }
];

export const INITIAL_GIS_LAYERS: GisLayers = {
  marineTraffic: true,
  sarBackscatter: true,
  predictedMask: true,
  predictedMaskOpacity: 85,
  confidenceHeatmap: false,
  oceanCurrents: false,
  aisTracks: true,
  originEstimate: false
};

export const SUSPECT_VESSELS: VesselSuspect[] = [
  {
    id: 'suspect-1',
    rank: 1,
    name: 'MT OCEAN GLORY',
    mmsi: '244010000',
    flag: 'PANAMA',
    type: 'TANKER',
    score: 94,
    proximityScore: 98,
    headingMatchScore: 85,
    timingScore: 92,
    speedProfileScore: 70,
    aisStatus: 'NO GAP',
    details: {
      imo: '9382914',
      callsign: '3FTB9',
      destination: 'ROTTERDAM (NL)',
      eta: '2023-10-26 18:00 UTC',
      draught: '14.2 m',
      length: '248 m x 42 m'
    },
    speedHistory: [
      { time: 'T-24h', knots: 14.2 },
      { time: 'T-20h', knots: 14.0 },
      { time: 'T-16h', knots: 13.8 },
      { time: 'T-14h', knots: 5.4, isAnomaly: true },
      { time: 'T-12h', knots: 6.1, isAnomaly: true },
      { time: 'T-8h', knots: 13.5 },
      { time: 'T-4h', knots: 14.1 },
      { time: 'NOW', knots: 14.4 }
    ],
    pings: [
      { time: 'T-24h', active: true },
      { time: 'T-18h', active: true },
      { time: 'T-14h', active: true },
      { time: 'T-12h', active: true },
      { time: 'T-6h', active: true },
      { time: 'NOW', active: true }
    ],
    trackPoints: [
      { x: 120, y: 150 },
      { x: 260, y: 220 },
      { x: 420, y: 310 },
      { x: 510, y: 400 },
      { x: 680, y: 490 },
      { x: 820, y: 560 }
    ]
  },
  {
    id: 'suspect-2',
    rank: 2,
    name: 'MV SEA BREEZE',
    mmsi: '352890000',
    flag: 'LIBERIA',
    type: 'BULK CARRIER',
    score: 78,
    proximityScore: 82,
    headingMatchScore: 74,
    timingScore: 80,
    speedProfileScore: 76,
    aisStatus: 'GAP DETECTED (3.2h)',
    details: {
      imo: '9451120',
      callsign: 'A8QK2',
      destination: 'ANTWERP (BE)',
      eta: '2023-10-27 06:00 UTC',
      draught: '11.8 m',
      length: '199 m x 32 m'
    },
    speedHistory: [
      { time: 'T-24h', knots: 11.2 },
      { time: 'T-20h', knots: 11.0 },
      { time: 'T-16h', knots: 11.4 },
      { time: 'T-12h', knots: 10.9 },
      { time: 'T-8h', knots: 11.1 },
      { time: 'T-4h', knots: 11.3 },
      { time: 'NOW', knots: 11.5 }
    ],
    pings: [
      { time: 'T-24h', active: true },
      { time: 'T-18h', active: true },
      { time: 'T-14h', active: false, isGap: true },
      { time: 'T-10h', active: true },
      { time: 'T-4h', active: true },
      { time: 'NOW', active: true }
    ],
    trackPoints: [
      { x: 90, y: 280 },
      { x: 220, y: 310 },
      { x: 440, y: 380 },
      { x: 610, y: 440 },
      { x: 790, y: 510 }
    ]
  },
  {
    id: 'suspect-3',
    rank: 3,
    name: 'PACIFIC TRADER',
    mmsi: '477123900',
    flag: 'MARSHALL ISLANDS',
    type: 'CONTAINER SHIP',
    score: 62,
    proximityScore: 65,
    headingMatchScore: 68,
    timingScore: 59,
    speedProfileScore: 56,
    aisStatus: 'NO GAP',
    details: {
      imo: '9604102',
      callsign: 'V7AB8',
      destination: 'HAMBURG (DE)',
      eta: '2023-10-28 12:00 UTC',
      draught: '13.5 m',
      length: '294 m x 32 m'
    },
    speedHistory: [
      { time: 'T-24h', knots: 18.2 },
      { time: 'T-20h', knots: 18.5 },
      { time: 'T-16h', knots: 18.1 },
      { time: 'T-12h', knots: 17.9 },
      { time: 'T-8h', knots: 18.3 },
      { time: 'T-4h', knots: 18.0 },
      { time: 'NOW', knots: 18.4 }
    ],
    pings: [
      { time: 'T-24h', active: true },
      { time: 'T-18h', active: true },
      { time: 'T-12h', active: true },
      { time: 'T-6h', active: true },
      { time: 'NOW', active: true }
    ],
    trackPoints: [
      { x: 150, y: 120 },
      { x: 310, y: 200 },
      { x: 490, y: 290 },
      { x: 670, y: 390 },
      { x: 840, y: 480 }
    ]
  },
  {
    id: 'suspect-4',
    rank: 4,
    name: 'NORDIC VALIANT',
    mmsi: '257390000',
    flag: 'NORWAY',
    type: 'CRUDE TANKER',
    score: 48,
    proximityScore: 52,
    headingMatchScore: 45,
    timingScore: 50,
    speedProfileScore: 45,
    aisStatus: 'NO GAP',
    details: {
      imo: '9512398',
      callsign: 'LAVB4',
      destination: 'BERGEN (NO)',
      eta: '2023-10-25 14:00 UTC',
      draught: '15.0 m',
      length: '274 m x 48 m'
    },
    speedHistory: [
      { time: 'T-24h', knots: 12.0 },
      { time: 'T-18h', knots: 12.2 },
      { time: 'T-12h', knots: 12.1 },
      { time: 'T-6h', knots: 12.0 },
      { time: 'NOW', knots: 12.3 }
    ],
    pings: [
      { time: 'T-24h', active: true },
      { time: 'T-16h', active: true },
      { time: 'T-8h', active: true },
      { time: 'NOW', active: true }
    ],
    trackPoints: [
      { x: 300, y: 100 },
      { x: 420, y: 220 },
      { x: 580, y: 360 },
      { x: 740, y: 500 }
    ]
  }
];

export const DEFAULT_ENVIRONMENT: EnvironmentalInputs = {
  currentModel: 'HYCOM',
  windModel: 'GFS',
  resolution: '0.1°',
  leewayCoeff: 3.2,
  waterTemp: '11.4 °C',
  waveHeight: '1.8 m'
};

export const INITIAL_NOTIFICATIONS: OperationNotification[] = [
  {
    id: 'notif-1',
    title: 'High-Confidence Spill Detected',
    message: 'Sentinel-1A SAR frame processed: 12.4 km² anomaly identified with 87% confidence.',
    time: '14:22 UTC',
    type: 'alert',
    unread: true
  },
  {
    id: 'notif-2',
    title: 'Hindcast Drift Matrix Converged',
    message: 'Backward trajectory localized origin window to 14:00–18:00 UTC (T-14h).',
    time: '14:35 UTC',
    type: 'info',
    unread: true
  },
  {
    id: 'notif-3',
    title: 'Attribution Pipeline Scored',
    message: 'MT OCEAN GLORY ranked #1 with 94% attribution correlation (speed anomaly identified).',
    time: '14:48 UTC',
    type: 'success',
    unread: false
  }
];
