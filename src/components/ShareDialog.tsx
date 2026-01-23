/**
 * Share Dialog Component
 * Full sharing UI with link copying, image export, and social sharing
 */

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { useUrlState } from '../hooks/useUrlState';
import { exportSnapshot, generatePreview, copySnapshotToClipboard, captureSnapshot, defaultSnapshotOptions } from '../utils/snapshotExport';
import { exportMetrics } from '../utils/exportMetrics';
import { calculatePOIMetrics } from '../utils/metricsCalculator';
import { getStoryById } from '../data/storyPresets';

interface ShareDialogProps {
  onClose: () => void;
  isMobile?: boolean;
}

type ExportFormat = 'png' | 'csv';

export function ShareDialog({ onClose, isMobile = false }: ShareDialogProps) {
  const { areas, activeLayers, activeStoryId } = useStore();
  const { getShareUrl, copyShareUrl } = useUrlState();

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(true);
  const [copySuccess, setCopySuccess] = useState<'link' | 'image' | null>(null);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);

  const shareUrl = getShareUrl();
  const preset = activeStoryId ? getStoryById(activeStoryId) : null;

  // Generate preview on mount
  useEffect(() => {
    const generate = async () => {
      setIsGeneratingPreview(true);
      const url = await generatePreview({
        presetName: preset?.name,
        areas,
        activeLayers,
        timestamp: new Date().toLocaleString(),
      });
      setPreviewUrl(url);
      setIsGeneratingPreview(false);
    };

    generate();

    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [areas, activeLayers, preset]);

  // Handle copy link
  const handleCopyLink = useCallback(async () => {
    const success = await copyShareUrl();
    if (success) {
      setCopySuccess('link');
      setTimeout(() => setCopySuccess(null), 2000);
    }
  }, [copyShareUrl]);

  // Handle PNG export
  const handleExportPNG = useCallback(async () => {
    setExportingFormat('png');
    const success = await exportSnapshot(
      { width: 1920, height: 1080 },
      {
        presetName: preset?.name,
        areas,
        activeLayers,
        timestamp: new Date().toLocaleString(),
      }
    );
    setExportingFormat(null);
    if (success) {
      // Brief success indication
    }
  }, [areas, activeLayers, preset]);

  // Handle CSV export
  const handleExportCSV = useCallback(() => {
    setExportingFormat('csv');

    // Calculate metrics for each area
    const exportAreas = areas.map((area) => {
      const areaM2 = area.polygon.area;
      const areaKm2 = areaM2 / 1_000_000;

      // Calculate POI metrics from layer data
      const metrics = calculatePOIMetrics(area.layerData, areaKm2);

      return {
        name: area.name,
        metrics,
      };
    });

    // Trigger download
    try {
      exportMetrics(exportAreas);
    } catch (e) {
      console.error('CSV export error:', e);
    }
    setExportingFormat(null);
  }, [areas]);

  // Handle copy image to clipboard
  const handleCopyImage = useCallback(async () => {
    const blob = await captureSnapshot(defaultSnapshotOptions, {
      presetName: preset?.name,
      areas,
      activeLayers,
      timestamp: new Date().toLocaleString(),
    });

    if (blob) {
      const success = await copySnapshotToClipboard(blob);
      if (success) {
        setCopySuccess('image');
        setTimeout(() => setCopySuccess(null), 2000);
      }
    }
  }, [areas, activeLayers, preset]);

  // Social share URLs
  const shareText = areas.length > 0
    ? `Check out this urban comparison: ${areas.map((a) => a.name).join(' vs ')}`
    : 'Check out this urban analysis';

  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    `${shareText} @AxonCity`
  )}&url=${encodeURIComponent(shareUrl)}`;

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(
    `${shareText}\n${shareUrl}`
  )}`;

  const messengerUrl = `fb-messenger://share/?link=${encodeURIComponent(shareUrl)}`;

  const smsUrl = `sms:?body=${encodeURIComponent(
    `${shareText} ${shareUrl}`
  )}`;

  const emailUrl = `mailto:?subject=${encodeURIComponent(
    `AxonCity: ${areas.map((a) => a.name).join(' vs ') || 'Urban Analysis'}`
  )}&body=${encodeURIComponent(
    `${shareText}\n\n${shareUrl}`
  )}`;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isMobile ? '16px' : '20px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: '#1a1a1a',
          borderRadius: '12px',
          width: '100%',
          maxWidth: isMobile ? '100%' : '480px',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '18px', color: 'white' }}>
            Share Comparison
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.6)',
              cursor: 'pointer',
              padding: '4px',
              fontSize: '20px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Preview */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <div
            style={{
              backgroundColor: '#000',
              borderRadius: '8px',
              overflow: 'hidden',
              aspectRatio: '16/9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isGeneratingPreview ? (
              <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '14px' }}>
                Generating preview...
              </span>
            ) : previewUrl ? (
              <img
                src={previewUrl}
                alt="Share preview"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '14px' }}>
                Preview unavailable
              </span>
            )}
          </div>
        </div>

        {/* Link Section */}
        <div style={{ padding: '16px 20px' }}>
          <div
            style={{
              fontSize: '12px',
              color: 'rgba(255, 255, 255, 0.6)',
              marginBottom: '8px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Share Link
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={shareUrl}
              readOnly
              style={{
                flex: 1,
                padding: '10px 12px',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '6px',
                color: 'white',
                fontSize: '13px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              onClick={(e) => e.currentTarget.select()}
            />
            <button
              onClick={handleCopyLink}
              style={{
                padding: '10px 16px',
                backgroundColor: copySuccess === 'link' ? '#22c55e' : '#4A90D9',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '500',
                whiteSpace: 'nowrap',
                transition: 'background-color 0.2s',
              }}
            >
              {copySuccess === 'link' ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Download Section */}
        <div
          style={{
            padding: '16px 20px',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <div
            style={{
              fontSize: '12px',
              color: 'rgba(255, 255, 255, 0.6)',
              marginBottom: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Download
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <DownloadButton
              icon="image"
              label="PNG Image"
              sublabel="1920×1080"
              onClick={handleExportPNG}
              loading={exportingFormat === 'png'}
            />
            <DownloadButton
              icon="table"
              label="CSV Data"
              sublabel="Metrics"
              onClick={handleExportCSV}
              loading={exportingFormat === 'csv'}
              disabled={areas.length === 0}
            />
            <DownloadButton
              icon="clipboard"
              label="Copy Image"
              sublabel="Clipboard"
              onClick={handleCopyImage}
              success={copySuccess === 'image'}
            />
          </div>
        </div>

        {/* Social Share Section */}
        <div
          style={{
            padding: '16px 20px',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <div
            style={{
              fontSize: '12px',
              color: 'rgba(255, 255, 255, 0.6)',
              marginBottom: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Share to
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <SocialButton
              platform="whatsapp"
              url={whatsappUrl}
            />
            <SocialButton
              platform="messenger"
              url={messengerUrl}
            />
            <SocialButton
              platform="messages"
              url={smsUrl}
            />
            <SocialButton
              platform="twitter"
              url={twitterUrl}
            />
            <SocialButton
              platform="email"
              url={emailUrl}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            fontSize: '11px',
            color: 'rgba(255, 255, 255, 0.4)',
            textAlign: 'center',
          }}
        >
          Data: OpenStreetMap contributors • Generated by AxonCity
        </div>
      </div>
    </div>
  );
}

// Download button component
interface DownloadButtonProps {
  icon: 'image' | 'table' | 'clipboard';
  label: string;
  sublabel: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  success?: boolean;
}

function DownloadButton({
  icon,
  label,
  sublabel,
  onClick,
  loading = false,
  disabled = false,
  success = false,
}: DownloadButtonProps) {
  const icons = {
    image: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    ),
    table: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18" />
      </svg>
    ),
    clipboard: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      </svg>
    ),
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
        padding: '12px 16px',
        backgroundColor: success
          ? 'rgba(34, 197, 94, 0.2)'
          : 'rgba(255, 255, 255, 0.1)',
        border: success
          ? '1px solid rgba(34, 197, 94, 0.5)'
          : '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '8px',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        color: success ? '#22c55e' : 'white',
        flex: 1,
        minWidth: '80px',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.2s',
      }}
    >
      {loading ? (
        <div
          style={{
            width: '20px',
            height: '20px',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            borderTopColor: 'white',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
      ) : success ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        icons[icon]
      )}
      <span style={{ fontSize: '12px', fontWeight: '500' }}>{success ? 'Copied!' : label}</span>
      <span style={{ fontSize: '10px', opacity: 0.6 }}>{sublabel}</span>
    </button>
  );
}

// Social share button component
interface SocialButtonProps {
  platform: 'twitter' | 'whatsapp' | 'messenger' | 'messages' | 'email';
  url: string;
}

function SocialButton({ platform, url }: SocialButtonProps) {
  const configs = {
    whatsapp: {
      label: 'WhatsApp',
      color: '#25D366',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
      ),
    },
    messenger: {
      label: 'Messenger',
      color: '#0084FF',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.373 0 0 4.974 0 11.111c0 3.498 1.744 6.614 4.469 8.654V24l4.088-2.242c1.092.301 2.246.464 3.443.464 6.627 0 12-4.974 12-11.111S18.627 0 12 0zm1.191 14.963l-3.055-3.26-5.963 3.26L10.732 8l3.131 3.259L19.752 8l-6.561 6.963z"/>
        </svg>
      ),
    },
    messages: {
      label: 'SMS',
      color: '#34C759',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
    twitter: {
      label: 'Twitter',
      color: '#1DA1F2',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      ),
    },
    email: {
      label: 'Email',
      color: '#6B7280',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
          <polyline points="22,6 12,13 2,6" />
        </svg>
      ),
    },
  };

  const config = configs[platform];

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 16px',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '8px',
        color: 'white',
        textDecoration: 'none',
        fontSize: '13px',
        fontWeight: '500',
        flex: 1,
        justifyContent: 'center',
        transition: 'all 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = config.color;
        e.currentTarget.style.borderColor = config.color;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
      }}
    >
      {config.icon}
      {config.label}
    </a>
  );
}

// Add CSS animation for loading spinner
const style = document.createElement('style');
style.textContent = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;
if (!document.head.querySelector('style[data-share-dialog]')) {
  style.setAttribute('data-share-dialog', '');
  document.head.appendChild(style);
}
