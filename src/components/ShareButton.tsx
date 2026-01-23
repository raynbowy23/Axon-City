/**
 * Share Button Component
 * Floating button to open the share dialog
 */

import { useState } from 'react';
import { ShareDialog } from './ShareDialog';

interface ShareButtonProps {
  disabled?: boolean;
  isMobile?: boolean;
}

export function ShareButton({ disabled = false, isMobile = false }: ShareButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const buttonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: isMobile ? '10px 14px' : '8px 14px',
    backgroundColor: disabled ? 'rgba(100, 100, 100, 0.6)' : 'rgba(74, 144, 217, 0.9)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: isMobile ? '14px' : '13px',
    fontWeight: '500',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
    transition: 'all 0.2s ease',
    opacity: disabled ? 0.6 : 1,
  };

  return (
    <>
      <button
        onClick={() => !disabled && setIsDialogOpen(true)}
        disabled={disabled}
        style={buttonStyle}
        title={disabled ? 'Select an area to share' : 'Share this view'}
        onMouseEnter={(e) => {
          if (!disabled) {
            e.currentTarget.style.backgroundColor = 'rgba(74, 144, 217, 1)';
            e.currentTarget.style.transform = 'scale(1.02)';
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled) {
            e.currentTarget.style.backgroundColor = 'rgba(74, 144, 217, 0.9)';
            e.currentTarget.style.transform = 'scale(1)';
          }
        }}
      >
        {/* Share icon */}
        <svg
          width={isMobile ? '18' : '16'}
          height={isMobile ? '18' : '16'}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
        Share
      </button>

      {isDialogOpen && (
        <ShareDialog
          onClose={() => setIsDialogOpen(false)}
          isMobile={isMobile}
        />
      )}
    </>
  );
}
