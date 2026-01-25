import { useState, useEffect } from 'react';

// Height threshold below which we collapse to info button
// Stats panel can be up to 400px tall + 65px bottom offset = 465px from bottom
// Top controls need ~250px, so we need at least 715px to show both
// Use 900px to provide comfortable margin
const COLLAPSE_HEIGHT_THRESHOLD = 900;

interface EditSelectionInfoProps {
  // 'inline' renders only the "i" button when collapsed (for placing next to Comparison Areas)
  // 'block' renders only the full box when expanded (for standalone placement)
  variant?: 'inline' | 'block';
}

export function EditSelectionInfo({ variant = 'block' }: EditSelectionInfoProps) {
  const [isCollapsed, setIsCollapsed] = useState(true); // Default to collapsed
  const [showTooltip, setShowTooltip] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  // Detect touch device
  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  // Check window height and update collapsed state
  useEffect(() => {
    const checkHeight = () => {
      setIsCollapsed(window.innerHeight < COLLAPSE_HEIGHT_THRESHOLD);
    };

    checkHeight();
    window.addEventListener('resize', checkHeight);
    return () => window.removeEventListener('resize', checkHeight);
  }, []);

  // Inline variant: only render when collapsed (shows "i" button)
  if (variant === 'inline') {
    if (!isCollapsed) return null;

    return (
      <div style={{ position: 'relative', display: 'inline-flex' }}>
        <button
          onClick={() => setShowTooltip(!showTooltip)}
          onMouseEnter={isTouchDevice ? undefined : () => setShowTooltip(true)}
          onMouseLeave={isTouchDevice ? undefined : () => setShowTooltip(false)}
          style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            backgroundColor: 'rgba(255, 200, 50, 0.2)',
            border: '1px solid rgba(255, 200, 50, 0.6)',
            color: 'rgba(255, 200, 50, 0.9)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '7px',
            fontWeight: '600',
            fontStyle: 'italic',
            fontFamily: 'Georgia, serif',
            padding: 0,
            lineHeight: 1,
          }}
          title="Edit Selection Tips"
        >
          i
        </button>

        {/* Tooltip */}
        {showTooltip && (
          <div
            style={{
              position: 'absolute',
              top: '-4px',
              left: '22px',
              backgroundColor: 'rgba(0, 0, 0, 0.95)',
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '11px',
              color: 'rgba(255, 255, 255, 0.85)',
              lineHeight: '1.5',
              whiteSpace: 'nowrap',
              zIndex: 1001,
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <div
              style={{
                marginBottom: '6px',
                fontWeight: '600',
                color: 'rgba(255, 200, 50, 0.9)',
                fontSize: '12px',
              }}
            >
              Edit Selection:
            </div>
            <div style={{ marginBottom: '3px' }}>Drag corners to move</div>
            <div style={{ marginBottom: '3px' }}>
              Click <span style={{ color: '#64C8FF', fontWeight: '500' }}>blue dots</span> to add point
            </div>
            <div>Double-click corner to remove</div>

            {/* Arrow pointing left */}
            <div
              style={{
                position: 'absolute',
                left: '-6px',
                top: '12px',
                width: '0',
                height: '0',
                borderTop: '6px solid transparent',
                borderBottom: '6px solid transparent',
                borderRight: '6px solid rgba(0, 0, 0, 0.95)',
              }}
            />
          </div>
        )}
      </div>
    );
  }

  // Block variant: only render when expanded (shows full box)
  if (isCollapsed) return null;

  return (
    <div
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: '8px 12px',
        borderRadius: '6px',
        fontSize: '10px',
        color: 'rgba(255, 255, 255, 0.7)',
        lineHeight: '1.4',
      }}
    >
      <div
        style={{
          marginBottom: '4px',
          fontWeight: '500',
          color: 'rgba(255, 200, 50, 0.9)',
        }}
      >
        Edit Selection:
      </div>
      <div>Drag corners to move</div>
      <div>
        Click <span style={{ color: '#64C8FF' }}>blue dots</span> to add point
      </div>
      <div>Double-click corner to remove</div>
    </div>
  );
}
