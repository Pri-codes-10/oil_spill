import React, { useState, useEffect } from 'react';
import { ActiveTab, CorridorResponse, GisLayers, MorphologicalProperties, OperationNotification, SceneMetadata, Suspect } from './types';
import { DEFAULT_DETECTION, DEMO_SCENES, INITIAL_GIS_LAYERS, INITIAL_NOTIFICATIONS } from './data';
import { TopAppBar } from './components/TopAppBar';
import { SideNavBar } from './components/SideNavBar';
import { IngestView } from './components/views/IngestView';
import { MapView } from './components/views/MapView';
import { DetectionView } from './components/views/DetectionView';
import { DriftView } from './components/views/DriftView';
import { SuspectsView } from './components/views/SuspectsView';
import { ExportView } from './components/views/ExportView';
import { ReportPreviewModal } from './components/modals/ReportPreviewModal';
import { HelpModal } from './components/modals/HelpModal';
import { OperatorModal } from './components/modals/OperatorModal';
import { DetectionResponse, getMockDetection } from "./api/api";
export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('map');
  const [currentScene, setCurrentScene] = useState<SceneMetadata>(DEMO_SCENES[0]);
  const [detection, setDetection] = useState<MorphologicalProperties>(DEFAULT_DETECTION);
  const [gisLayers, setGisLayers] = useState<GisLayers>(INITIAL_GIS_LAYERS);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [notifications, setNotifications] = useState<OperationNotification[]>(INITIAL_NOTIFICATIONS);
  const [contract1, setContract1] = useState<DetectionResponse | null>(null);
  const [corridor, setCorridor] = useState<CorridorResponse | null>(null);
  const [topSuspect, setTopSuspect] = useState<Suspect | null>(null);

  // Theme state: default to localStorage or system preference
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('aquatrace_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('aquatrace_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // Modals state
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState<boolean>(false);
  const [isOperatorModalOpen, setIsOperatorModalOpen] = useState<boolean>(false);

  const handleSceneChange = (scene: SceneMetadata) => {
    setCurrentScene(scene);
    if (scene.detections && scene.detections.length > 0) {
      setDetection(scene.detections[0]);
    }
  };

  const handleSelectDetection = (det: MorphologicalProperties) => {
    setDetection(det);
  };

  return (
    <div
      data-theme={theme}
      className="flex h-screen w-screen overflow-hidden font-sans antialiased select-none"
      style={{ background: 'var(--gov-bg)', color: 'var(--gov-text-primary)' }}
    >
      
      {/* Side Rail Navigation (Fixed Left, 72px width) */}
      <SideNavBar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab}
        onOpenOperatorProfile={() => setIsOperatorModalOpen(true)}
      />

      {/* Main Container Area (Offset by 72px left rail) */}
      <div className="flex flex-col flex-1 h-screen pl-[72px]">
        
        {/* Top App Bar (Fixed Top) */}
        <TopAppBar 
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          notifications={notifications}
          setNotifications={setNotifications}
          onOpenHelp={() => setIsHelpModalOpen(true)}
          theme={theme}
          toggleTheme={toggleTheme}
        />

        {/* Dynamic View Canvas Area (Below Top App Bar) */}
        <main className="flex-1 w-full h-[calc(100vh-72px)] mt-[72px] overflow-hidden relative">
          {activeTab === 'ingest' && (
            <IngestView
              currentScene={currentScene}
              setCurrentScene={handleSceneChange}
              onContinueToMap={() => setActiveTab('map')}
              onContract1={setContract1}
            />
          )}

          {activeTab === 'map' && (
            <MapView 
              currentScene={currentScene}
              activeDetection={detection}
              gisLayers={gisLayers}
              setGisLayers={setGisLayers}
              onSelectDetection={(selectedDet) => {
                if (selectedDet) setDetection(selectedDet);
                setActiveTab('detection');
              }}
            />
          )}

          {activeTab === 'detection' && (
            <DetectionView 
              currentScene={currentScene}
              detection={detection}
              onSelectDetection={handleSelectDetection}
              onViewDriftAnalysis={() => setActiveTab('drift')}
              onCloseDrawer={() => setActiveTab('map')}
            />
          )}

          {activeTab === 'drift' && (
            <DriftView
              currentScene={currentScene}
              contract1={contract1}
              onCorridorReady={setCorridor}
              onProceedToSuspects={() => setActiveTab('suspects')}
              onGoToIngest={() => setActiveTab('ingest')}
            />
          )}

          {activeTab === 'suspects' && (
            <SuspectsView
              currentScene={currentScene}
              searchQuery={searchQuery}
              contract1={contract1}
              corridor={corridor}
              onTopSuspectReady={setTopSuspect}
              onProceedToExport={() => setActiveTab('export')}
              onGoToIngest={() => setActiveTab('drift')}
            />
          )}

          {activeTab === 'export' && (
            <ExportView
              currentScene={currentScene}
              detection={detection}
              topSuspect={topSuspect}
              onOpenReportPreview={() => setIsReportModalOpen(true)}
            />
          )}
        </main>
      </div>

      {/* Global Modals */}
      <ReportPreviewModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        currentScene={currentScene}
        detection={detection}
        topSuspect={topSuspect}
      />

      <HelpModal 
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
      />

      <OperatorModal 
        isOpen={isOperatorModalOpen}
        onClose={() => setIsOperatorModalOpen(false)}
      />

    </div>
  );
}
