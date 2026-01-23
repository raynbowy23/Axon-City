import { useState, useRef, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { MAX_COMPARISON_AREAS } from '../types';

interface AreaSelectorProps {
  onAddArea?: () => void;
  disabled?: boolean;
  isLoading?: boolean;
}

export function AreaSelector({ onAddArea, disabled, isLoading }: AreaSelectorProps) {
  const { areas, activeAreaId, setActiveAreaId, removeArea, renameArea } = useStore();

  // Track which area is being edited
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (editingAreaId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingAreaId]);

  const startEditing = (areaId: string, currentName: string) => {
    if (isLoading) return;
    setEditingAreaId(areaId);
    setEditValue(currentName);
  };

  const finishEditing = () => {
    if (editingAreaId && editValue.trim()) {
      renameArea(editingAreaId, editValue.trim());
    }
    setEditingAreaId(null);
    setEditValue('');
  };

  const cancelEditing = () => {
    setEditingAreaId(null);
    setEditValue('');
  };

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
        const canSwitch = !isLoading && !isActive;

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
              onClick={() => canSwitch && setActiveAreaId(area.id)}
              disabled={isLoading && !isActive}
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
                cursor: isLoading && !isActive ? 'not-allowed' : 'pointer',
                color: 'white',
                fontSize: '12px',
                fontWeight: isActive ? '600' : '400',
                transition: 'all 0.15s ease',
                opacity: isLoading && !isActive ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isActive && !isLoading) {
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
              {editingAreaId === area.id ? (
                <input
                  ref={inputRef}
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={finishEditing}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      finishEditing();
                    } else if (e.key === 'Escape') {
                      cancelEditing();
                    }
                    e.stopPropagation();
                  }}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    border: 'none',
                    borderRadius: '3px',
                    color: 'white',
                    fontSize: '12px',
                    fontWeight: '600',
                    padding: '2px 6px',
                    width: '80px',
                    outline: 'none',
                  }}
                />
              ) : (
                <span
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    startEditing(area.id, area.name);
                  }}
                  title="Double-click to rename"
                  style={{ cursor: 'text' }}
                >
                  {area.name}
                </span>
              )}
            </button>

            {/* Remove button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!isLoading) {
                  removeArea(area.id);
                }
              }}
              disabled={isLoading}
              style={{
                width: '20px',
                height: '20px',
                padding: 0,
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                borderRadius: '4px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                color: 'rgba(255, 255, 255, 0.6)',
                fontSize: '14px',
                lineHeight: '1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
                opacity: isLoading ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isLoading) {
                  e.currentTarget.style.backgroundColor = 'rgba(217, 74, 74, 0.8)';
                  e.currentTarget.style.color = 'white';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)';
              }}
              title={isLoading ? 'Please wait...' : `Remove ${area.name}`}
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
