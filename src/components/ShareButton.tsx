/**
 * Share Button Component
 * Uses native Share API on mobile, falls back to ShareDialog on desktop
 */

import { useState, useCallback } from 'react';
import { ShareDialog } from './ShareDialog';
import { useStore } from '../store/useStore';
import { useUrlState } from '../hooks/useUrlState';
import { captureSnapshot, defaultSnapshotOptions } from '../utils/snapshotExport';
import { getStoryById } from '../data/storyPresets';

interface ShareButtonProps {
  disabled?: boolean;
  isMobile?: boolean;
}

// Check if native share is available (with file support)
function canUseNativeShare(): boolean {
  return typeof navigator !== 'undefined' &&
         typeof navigator.share === 'function' &&
         typeof navigator.canShare === 'function';
}

export function ShareButton({ disabled = false, isMobile = false }: ShareButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const { areas, activeLayers, activeStoryId } = useStore();
  const { getShareUrl } = useUrlState();

  const preset = activeStoryId ? getStoryById(activeStoryId) : null;

  // Handle native share (mobile)
  const handleNativeShare = useCallback(async () => {
    if (disabled || isSharing) return;

    setIsSharing(true);

    const shareUrl = getShareUrl();
    const shareTitle = areas.length > 0
      ? `AxonCity: ${areas.map((a) => a.name).join(' vs ')}`
      : 'AxonCity Urban Analysis';
    const shareText = areas.length > 0
      ? `Check out this urban comparison: ${areas.map((a) => a.name).join(' vs ')}`
      : 'Check out this urban analysis';

    try {
      // Try to capture an image to share
      const blob = await captureSnapshot(defaultSnapshotOptions, {
        presetName: preset?.name,
        areas,
        activeLayers,
        timestamp: new Date().toLocaleString(),
      });

      if (blob && navigator.canShare) {
        // Create a file from the blob
        const file = new File([blob], 'axoncity-share.png', { type: 'image/png' });

        const shareData: ShareData = {
          title: shareTitle,
          text: shareText,
          url: shareUrl,
          files: [file],
        };

        // Check if we can share with files
        if (navigator.canShare(shareData)) {
          await navigator.share(shareData);
          setIsSharing(false);
          return;
        }
      }

      // Fallback: share without image
      await navigator.share({
        title: shareTitle,
        text: shareText,
        url: shareUrl,
      });
    } catch (error) {
      // User cancelled or share failed - that's okay
      if ((error as Error).name !== 'AbortError') {
        console.warn('Native share failed:', error);
        // Fall back to dialog
        setIsDialogOpen(true);
      }
    } finally {
      setIsSharing(false);
    }
  }, [disabled, isSharing, getShareUrl, areas, activeLayers, preset]);

  // Handle button click
  const handleClick = useCallback(() => {
    if (disabled) return;

    // Use native share on mobile if available
    if (isMobile && canUseNativeShare()) {
      handleNativeShare();
    } else {
      setIsDialogOpen(true);
    }
  }, [disabled, isMobile, handleNativeShare]);

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
    minHeight: isMobile ? '48px' : undefined,
  };

  return (
    <>
      <button
        onClick={handleClick}
        disabled={disabled || isSharing}
        style={buttonStyle}
        title={disabled ? 'Select an area to share' : 'Share this view'}
        onMouseEnter={(e) => {
          if (!disabled && !isSharing) {
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
        {isSharing ? (
          // Loading spinner
          <div
            style={{
              width: isMobile ? '18px' : '16px',
              height: isMobile ? '18px' : '16px',
              border: '2px solid rgba(255, 255, 255, 0.3)',
              borderTopColor: 'white',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
        ) : (
          // Share icon
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
        )}
        {isSharing ? 'Sharing...' : 'Share'}
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
