import { useRef } from 'react';
import L, { type LeafletEvent, type Marker as LeafletMarker } from 'leaflet';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
import 'leaflet/dist/leaflet.css';

// Leaflet's default marker icon resolves its image URLs relative to the page, which breaks
// under Vite's bundling (the default `_getIconUrl` looks for a path Vite never produces) —
// the fix is to point it at the bundled asset URLs directly. One-time module-level side
// effect, same fix documented across every Vite + Leaflet integration.
delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl, iconUrl, shadowUrl });

const DEFAULT_ZOOM = 15;

interface LocationMapPreviewProps {
  latitude: number;
  longitude: number;
  onMove: (latitude: number, longitude: number) => void;
  /**
   * Bumped only when a fresh geocode/resolve produces new coordinates —
   * NOT on every drag, which would remount the map and fight the user's own
   * drag gesture (fine-tuning the pin shouldn't re-pan/reset the view).
   */
  mapSeed: number;
}

/** CLIENT-LOC-1's free OSM/Leaflet preview pin — draggable so the user can fine-tune a resolved or approximate location. No routing engine embedded; "Get Directions" deep-links out instead. */
export function LocationMapPreview({ latitude, longitude, onMove, mapSeed }: LocationMapPreviewProps) {
  const markerRef = useRef<LeafletMarker | null>(null);

  const handleDragEnd = (event: LeafletEvent) => {
    const marker = event.target as LeafletMarker;
    const position = marker.getLatLng();
    onMove(position.lat, position.lng);
  };

  return (
    <div className="h-48 w-full overflow-hidden rounded-lg border-hairline border-border" data-testid="location-map-preview">
      <MapContainer
        key={mapSeed}
        center={[latitude, longitude]}
        zoom={DEFAULT_ZOOM}
        scrollWheelZoom={false}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker
          position={[latitude, longitude]}
          draggable
          eventHandlers={{ dragend: handleDragEnd }}
          ref={markerRef}
        />
      </MapContainer>
    </div>
  );
}
