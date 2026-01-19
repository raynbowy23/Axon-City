export type MobileTab = 'map' | 'layers' | 'stats' | '3d';

interface MobileNavProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  hasSelection: boolean;
  isExtractedViewOpen: boolean;
}

// SVG Icons
const MapIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
    <line x1="8" y1="2" x2="8" y2="18" />
    <line x1="16" y1="6" x2="16" y2="22" />
  </svg>
);

const LayersIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
);

const StatsIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

const ThreeDIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2L2 7l10 5 10-5-10-5z" />
    <path d="M2 17l10 5 10-5" />
    <path d="M2 12l10 5 10-5" />
  </svg>
);

export function MobileNav({
  activeTab,
  onTabChange,
  hasSelection,
  isExtractedViewOpen,
}: MobileNavProps) {
  const tabs: { id: MobileTab; label: string; icon: React.ReactNode; disabled?: boolean }[] = [
    { id: 'map', label: 'Map', icon: <MapIcon /> },
    { id: 'layers', label: 'Layers', icon: <LayersIcon /> },
    { id: 'stats', label: 'Stats', icon: <StatsIcon />, disabled: !hasSelection },
    { id: '3d', label: '3D View', icon: <ThreeDIcon />, disabled: !hasSelection },
  ];

  return (
    <nav className="mobile-nav">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`mobile-nav-item ${activeTab === tab.id ? 'active' : ''} ${tab.id === '3d' && isExtractedViewOpen ? 'active' : ''}`}
          onClick={() => !tab.disabled && onTabChange(tab.id)}
          disabled={tab.disabled}
          style={{
            opacity: tab.disabled ? 0.4 : 1,
            cursor: tab.disabled ? 'not-allowed' : 'pointer',
          }}
        >
          {tab.icon}
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
