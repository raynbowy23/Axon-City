import { useCallback, useRef, useEffect, useState } from 'react';

export type BottomSheetState = 'collapsed' | 'peek' | 'expanded';

interface BottomSheetProps {
  children: React.ReactNode;
  state: BottomSheetState;
  onStateChange: (state: BottomSheetState) => void;
  peekHeight?: number;
  title?: string;
}

// Minimum drag distance to trigger state change
const DRAG_THRESHOLD = 50;

export function BottomSheet({
  children,
  state,
  onStateChange,
  peekHeight = 200,
  title,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const startYRef = useRef(0);
  const startStateRef = useRef<BottomSheetState>(state);

  // Handle drag start
  const handleDragStart = useCallback((clientY: number) => {
    setIsDragging(true);
    startYRef.current = clientY;
    startStateRef.current = state;
    setDragOffset(0);
  }, [state]);

  // Handle drag move
  const handleDragMove = useCallback((clientY: number) => {
    if (!isDragging) return;

    const deltaY = clientY - startYRef.current;
    setDragOffset(deltaY);
  }, [isDragging]);

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    if (!isDragging) return;

    setIsDragging(false);
    const deltaY = dragOffset;

    // Determine new state based on drag direction and distance
    if (Math.abs(deltaY) > DRAG_THRESHOLD) {
      if (deltaY > 0) {
        // Dragged down
        if (startStateRef.current === 'expanded') {
          onStateChange('peek');
        } else if (startStateRef.current === 'peek') {
          onStateChange('collapsed');
        }
      } else {
        // Dragged up
        if (startStateRef.current === 'collapsed') {
          onStateChange('peek');
        } else if (startStateRef.current === 'peek') {
          onStateChange('expanded');
        }
      }
    }

    setDragOffset(0);
  }, [isDragging, dragOffset, onStateChange]);

  // Touch event handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    handleDragStart(e.touches[0].clientY);
  }, [handleDragStart]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    handleDragMove(e.touches[0].clientY);
  }, [handleDragMove]);

  const handleTouchEnd = useCallback(() => {
    handleDragEnd();
  }, [handleDragEnd]);

  // Mouse event handlers (for desktop testing)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    handleDragStart(e.clientY);
  }, [handleDragStart]);

  // Add global mouse listeners when dragging
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      handleDragMove(e.clientY);
    };

    const handleMouseUp = () => {
      handleDragEnd();
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  // Prevent body scroll when expanded
  useEffect(() => {
    if (state === 'expanded') {
      document.body.classList.add('bottom-sheet-open');
    } else {
      document.body.classList.remove('bottom-sheet-open');
    }

    return () => {
      document.body.classList.remove('bottom-sheet-open');
    };
  }, [state]);

  // Calculate transform based on state and drag
  const getTransform = (): string => {
    let baseTransform = 'translateY(100%)';

    if (state === 'peek') {
      baseTransform = `translateY(calc(100% - ${peekHeight}px))`;
    } else if (state === 'expanded') {
      baseTransform = 'translateY(0)';
    }

    // Apply drag offset during dragging
    if (isDragging && dragOffset !== 0) {
      // Limit the drag range
      const limitedOffset = Math.max(-100, Math.min(300, dragOffset));
      return `translateY(calc(${state === 'collapsed' ? '100%' : state === 'peek' ? `100% - ${peekHeight}px` : '0px'} + ${limitedOffset}px))`;
    }

    return baseTransform;
  };

  if (state === 'collapsed') {
    return null;
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`bottom-sheet-overlay ${state === 'expanded' ? 'visible' : ''}`}
        onClick={() => onStateChange('peek')}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={`bottom-sheet ${state}`}
        style={{
          transform: getTransform(),
          transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        {/* Drag handle */}
        <div
          style={{
            padding: '12px 16px 8px',
            cursor: 'grab',
            touchAction: 'none',
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
        >
          <div className="bottom-sheet-handle" />
          {title && (
            <div
              style={{
                color: 'white',
                fontSize: '16px',
                fontWeight: '600',
                textAlign: 'center',
                marginTop: '8px',
              }}
            >
              {title}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="bottom-sheet-content">
          {children}
        </div>
      </div>
    </>
  );
}
