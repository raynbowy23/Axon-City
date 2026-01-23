import { useState, useCallback, useRef, useEffect } from 'react';
import { useStore } from '../store/useStore';

interface SearchResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  importance: number;
}

interface SearchBarProps {
  isMobile?: boolean;
}

// Nominatim API endpoint (free OpenStreetMap geocoding)
const NOMINATIM_API = 'https://nominatim.openstreetmap.org/search';

export function SearchBar({ isMobile = false }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showFavoritesMenu, setShowFavoritesMenu] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const favContainerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { setViewState, viewState, setSelectionLocationName, favoriteLocations, addFavoriteLocation, removeFavoriteLocation } = useStore();

  // Debounced search function
  const searchLocation = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 3) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);

    try {
      const params = new URLSearchParams({
        q: searchQuery,
        format: 'json',
        limit: '5',
        addressdetails: '1',
      });

      const response = await fetch(`${NOMINATIM_API}?${params}`, {
        headers: {
          'User-Agent': 'AxonCity/1.0', // Required by Nominatim usage policy
        },
      });

      if (response.ok) {
        const data: SearchResult[] = await response.json();
        setResults(data);
        setIsOpen(data.length > 0);
        setSelectedIndex(-1);
      }
    } catch (error) {
      console.error('Geocoding error:', error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle input change with debounce
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setQuery(value);

      // Clear previous debounce timer
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      // Debounce search by 300ms
      debounceRef.current = setTimeout(() => {
        searchLocation(value);
      }, 300);
    },
    [searchLocation]
  );

  // Handle selecting a result
  const handleSelectResult = useCallback(
    (result: SearchResult) => {
      const lat = parseFloat(result.lat);
      const lon = parseFloat(result.lon);

      // Fly to the selected location
      setViewState({
        ...viewState,
        longitude: lon,
        latitude: lat,
        zoom: 14,
        pitch: viewState.pitch,
        bearing: viewState.bearing,
      });

      // Get a clean location name (first 2 parts of display name)
      const parts = result.display_name.split(',').map(p => p.trim());
      const locationName = parts.slice(0, 2).join(', ');

      // Store the location name for the extracted view
      setSelectionLocationName(locationName);

      // Update input and close dropdown
      setQuery(parts[0]); // Show short name
      setIsOpen(false);
      setResults([]);
      inputRef.current?.blur();
    },
    [viewState, setViewState, setSelectionLocationName]
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen || results.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, -1));
          break;
        case 'Enter':
          e.preventDefault();
          if (selectedIndex >= 0 && results[selectedIndex]) {
            handleSelectResult(results[selectedIndex]);
          }
          break;
        case 'Escape':
          setIsOpen(false);
          setSelectedIndex(-1);
          inputRef.current?.blur();
          break;
      }
    },
    [isOpen, results, selectedIndex, handleSelectResult]
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSelectedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Format display name to be more readable
  const formatDisplayName = (name: string): { primary: string; secondary: string } => {
    const parts = name.split(',').map((p) => p.trim());
    return {
      primary: parts[0] || name,
      secondary: parts.slice(1, 3).join(', '),
    };
  };

  // Handle navigating to a favorite location
  const handleGoToFavorite = useCallback((fav: { longitude: number; latitude: number; zoom: number; name: string }) => {
    setViewState({
      ...viewState,
      longitude: fav.longitude,
      latitude: fav.latitude,
      zoom: fav.zoom,
    });
    setQuery(fav.name);
    setShowFavoritesMenu(false);
  }, [viewState, setViewState]);

  // Handle adding current location as favorite
  const handleAddFavorite = useCallback(() => {
    const name = query.trim() || `Location ${favoriteLocations.length + 1}`;
    addFavoriteLocation({
      longitude: viewState.longitude,
      latitude: viewState.latitude,
      zoom: viewState.zoom,
      name,
    });
    setShowFavoritesMenu(false);
  }, [viewState, addFavoriteLocation, query, favoriteLocations.length]);

  // Handle removing a favorite
  const handleRemoveFavorite = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    removeFavoriteLocation(id);
  }, [removeFavoriteLocation]);

  // Close favorites menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (favContainerRef.current && !favContainerRef.current.contains(e.target as Node)) {
        setShowFavoritesMenu(false);
      }
    };

    if (showFavoritesMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFavoritesMenu]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: isMobile ? '100%' : '320px',
      }}
    >
      {/* Search Input */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          borderRadius: isOpen ? '8px 8px 0 0' : '8px',
          padding: isMobile ? '10px 12px' : '8px 12px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
        }}
      >
        {/* Search Icon */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgba(255, 255, 255, 0.6)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ marginRight: '10px', flexShrink: 0 }}
        >
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder="Search location..."
          style={{
            flex: 1,
            backgroundColor: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'white',
            fontSize: '14px',
            fontFamily: 'inherit',
          }}
        />

        {/* Loading indicator */}
        {isLoading && (
          <div
            style={{
              width: '16px',
              height: '16px',
              border: '2px solid rgba(255, 255, 255, 0.3)',
              borderTopColor: 'white',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
        )}

        {/* Clear button */}
        {query && !isLoading && (
          <button
            onClick={() => {
              setQuery('');
              setResults([]);
              setIsOpen(false);
              inputRef.current?.focus();
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.6)',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        )}

        {/* Favorites/Star button */}
        <div ref={favContainerRef} style={{ position: 'relative', marginLeft: '4px' }}>
          <button
            onClick={() => setShowFavoritesMenu(!showFavoritesMenu)}
            style={{
              background: 'none',
              border: 'none',
              color: favoriteLocations.length > 0 ? '#FFD700' : 'rgba(255, 255, 255, 0.6)',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.15s',
            }}
            title={favoriteLocations.length > 0 ? `${favoriteLocations.length} favorite(s)` : 'Add to favorites'}
          >
            {favoriteLocations.length > 0 ? (
              // Filled star
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
              </svg>
            ) : (
              // Empty star
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
              </svg>
            )}
          </button>

          {/* Favorites menu dropdown */}
          {showFavoritesMenu && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '4px',
                backgroundColor: 'rgba(0, 0, 0, 0.95)',
                borderRadius: '8px',
                overflow: 'hidden',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
                zIndex: 1001,
                minWidth: '200px',
                maxHeight: '300px',
                overflowY: 'auto',
              }}
            >
              {/* Add current location button */}
              <button
                onClick={handleAddFavorite}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '10px 14px',
                  backgroundColor: 'transparent',
                  color: '#4A90D9',
                  border: 'none',
                  borderBottom: favoriteLocations.length > 0 ? '1px solid rgba(255, 255, 255, 0.1)' : 'none',
                  cursor: 'pointer',
                  fontSize: '13px',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                </svg>
                Add Current Location
              </button>

              {/* List of favorites */}
              {favoriteLocations.map((fav) => (
                <div
                  key={fav.id}
                  onClick={() => handleGoToFavorite(fav)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    backgroundColor: 'transparent',
                    cursor: 'pointer',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#FFD700" style={{ flexShrink: 0 }}>
                      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                    </svg>
                    <span
                      style={{
                        color: 'white',
                        fontSize: '13px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {fav.name}
                    </span>
                  </div>
                  <button
                    onClick={(e) => handleRemoveFavorite(e, fav.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'rgba(255, 255, 255, 0.4)',
                      cursor: 'pointer',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginLeft: '8px',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = '#ff6b6b';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'rgba(255, 255, 255, 0.4)';
                    }}
                    title="Remove favorite"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                    </svg>
                  </button>
                </div>
              ))}

              {/* Empty state */}
              {favoriteLocations.length === 0 && (
                <div
                  style={{
                    padding: '12px 14px',
                    color: 'rgba(255, 255, 255, 0.5)',
                    fontSize: '12px',
                    textAlign: 'center',
                  }}
                >
                  No favorites yet
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Results Dropdown */}
      {isOpen && results.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.95)',
            borderRadius: '0 0 8px 8px',
            overflow: 'hidden',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
            zIndex: 1000,
          }}
        >
          {results.map((result, index) => {
            const { primary, secondary } = formatDisplayName(result.display_name);
            const isSelected = index === selectedIndex;

            return (
              <div
                key={result.place_id}
                onClick={() => handleSelectResult(result)}
                onMouseEnter={() => setSelectedIndex(index)}
                style={{
                  padding: '10px 12px',
                  cursor: 'pointer',
                  backgroundColor: isSelected ? 'rgba(74, 144, 217, 0.3)' : 'transparent',
                  borderBottom: index < results.length - 1 ? '1px solid rgba(255, 255, 255, 0.1)' : 'none',
                  transition: 'background-color 0.15s ease',
                }}
              >
                <div
                  style={{
                    color: 'white',
                    fontSize: '14px',
                    fontWeight: 500,
                    marginBottom: '2px',
                  }}
                >
                  {primary}
                </div>
                {secondary && (
                  <div
                    style={{
                      color: 'rgba(255, 255, 255, 0.5)',
                      fontSize: '12px',
                    }}
                  >
                    {secondary}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Spinner animation */}
      <style>
        {`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
}
