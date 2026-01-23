import { useStore } from '../store/useStore';
import { storyPresets } from '../data/storyPresets';

interface StorySelectorProps {
  isMobile?: boolean;
}

export function StorySelector({ isMobile = false }: StorySelectorProps) {
  const { activeStoryId, applyStory, isLoading } = useStore();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      }}
    >
      {storyPresets.map((story) => {
        const isActive = activeStoryId === story.id;

        return (
          <button
            key={story.id}
            onClick={() => applyStory(story.id)}
            disabled={isLoading}
            title={story.description}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: isMobile ? '12px 14px' : '8px 10px',
              backgroundColor: isActive
                ? 'rgba(74, 144, 217, 0.3)'
                : 'rgba(255, 255, 255, 0.05)',
              color: 'white',
              border: isActive
                ? '1px solid rgba(74, 144, 217, 0.8)'
                : '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '6px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontSize: isMobile ? '14px' : '12px',
              fontWeight: isActive ? '600' : '400',
              textAlign: 'left',
              opacity: isLoading ? 0.6 : 1,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!isLoading && !isActive) {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isLoading && !isActive) {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
              }
            }}
          >
            <span style={{ fontSize: isMobile ? '18px' : '16px', width: '24px', textAlign: 'center' }}>
              {story.icon}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: isActive ? '600' : '500' }}>{story.name}</div>
              <div
                style={{
                  fontSize: isMobile ? '11px' : '10px',
                  opacity: 0.6,
                  marginTop: '2px',
                }}
              >
                {story.description}
              </div>
            </div>
            {isActive && (
              <span
                style={{
                  fontSize: '10px',
                  padding: '2px 6px',
                  backgroundColor: 'rgba(74, 144, 217, 0.5)',
                  borderRadius: '4px',
                }}
              >
                Active
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
