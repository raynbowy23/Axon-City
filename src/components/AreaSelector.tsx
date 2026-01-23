import { useStore } from '../store/useStore';
import { MAX_COMPARISON_AREAS } from '../types';

interface AreaSelectorProps {
  onAddArea?: () => void;
  disabled?: boolean;
}

export function AreaSelector({ onAddArea, disabled }: AreaSelectorProps) {
  const { areas, activeAreaId, setActiveAreaId, removeArea } = useStore();

  if (areas.length === 0) {
    return null;
  }

  const canAddMore = areas.length < MAX_COMPARISON_AREAS;

  return (
    <div
      style={{
        display: 'flex',
        gap: '6px',
        flexWrap: 'wrap',
        alignItems: 'center',
      }}
    >
      {areas.map((area) => {
        const isActive = area.id === activeAreaId;
        const [r, g, b] = area.color;

        return (
          <div
            key={area.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <button
              onClick={() => setActiveAreaId(area.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                backgroundColor: isActive
                  ? `rgba(${r}, ${g}, ${b}, 0.3)`
                  : 'rgba(255, 255, 255, 0.1)',
                border: `2px solid rgba(${r}, ${g}, ${b}, ${isActive ? 1 : 0.5})`,
                borderRadius: '6px',
                cursor: 'pointer',
                color: 'white',
                fontSize: '12px',
                fontWeight: isActive ? '600' : '400',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = `rgba(${r}, ${g}, ${b}, 0.2)`;
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                }
              }}
            >
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: `rgb(${r}, ${g}, ${b})`,
                }}
              />
              {area.name}
            </button>

            {/* Remove button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeArea(area.id);
              }}
              style={{
                width: '20px',
                height: '20px',
                padding: 0,
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                color: 'rgba(255, 255, 255, 0.6)',
                fontSize: '14px',
                lineHeight: '1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(217, 74, 74, 0.8)';
                e.currentTarget.style.color = 'white';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)';
              }}
              title={`Remove ${area.name}`}
            >
              ×
            </button>
          </div>
        );
      })}

      {/* Add new area button */}
      {canAddMore && onAddArea && (
        <button
          onClick={onAddArea}
          disabled={disabled}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '6px 10px',
            backgroundColor: disabled ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.1)',
            border: '2px dashed rgba(255, 255, 255, 0.3)',
            borderRadius: '6px',
            cursor: disabled ? 'not-allowed' : 'pointer',
            color: disabled ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.7)',
            fontSize: '12px',
            transition: 'all 0.15s ease',
            opacity: disabled ? 0.5 : 1,
          }}
          onMouseEnter={(e) => {
            if (!disabled) {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.5)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = disabled
              ? 'rgba(255, 255, 255, 0.05)'
              : 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
          }}
        >
          <span style={{ fontSize: '14px' }}>+</span>
          Add Area
        </button>
      )}
    </div>
  );
}
