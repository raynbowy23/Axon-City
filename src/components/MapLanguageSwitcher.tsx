import { useStore } from '../store/useStore';

export function MapLanguageSwitcher() {
  const { mapLanguage, setMapLanguage } = useStore();

  return (
    <div
      style={{
        display: 'flex',
        gap: '4px',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        borderRadius: '8px',
        padding: '4px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
      }}
    >
      <button
        onClick={() => setMapLanguage('local')}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          padding: '8px 12px',
          backgroundColor: mapLanguage === 'local' ? '#4A90D9' : 'transparent',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          transition: 'background-color 0.15s',
          fontSize: '12px',
          fontWeight: '500',
        }}
        title="Local language labels"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z" />
        </svg>
        <span>Local</span>
      </button>
      <button
        onClick={() => setMapLanguage('en')}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          padding: '8px 12px',
          backgroundColor: mapLanguage === 'en' ? '#4A90D9' : 'transparent',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          transition: 'background-color 0.15s',
          fontSize: '12px',
          fontWeight: '500',
        }}
        title="English labels"
      >
        <span style={{ fontWeight: '700', fontSize: '14px' }}>EN</span>
      </button>
    </div>
  );
}
