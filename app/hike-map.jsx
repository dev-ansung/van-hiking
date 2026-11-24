"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import {
  Map,
  MapMarker,
  MapRoute,
  MarkerContent,
  RouteMarker,
  RouteProgress,
  useMap,
} from "@/components/ui/map";

// One distinct color per hike so pins/routes can be told apart at a glance.
export const ROUTE_COLORS = ["#1a73e8", "#7c3aed", "#0d9488", "#ea580c"];
export function routeColor(i) {
  return ROUTE_COLORS[i % ROUTE_COLORS.length];
}

// Esri World Imagery raster style (no key needed). Passed as the map's
// `styles` for satellite mode; the mapcn component swaps styles through its
// own effect, so pins/routes tear down and re-add like a theme change.
const ESRI_WORLD_IMAGERY = {
  version: 8,
  sources: {
    esri: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution:
        "Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    },
  },
  layers: [{ id: "esri", type: "raster", source: "esri" }],
};

// Padding keeps the route/pins clear of the floating UI: on desktop the
// fixed left panel covers the left ~400px; on mobile the bottom sheet
// covers the bottom ~148px at its peek snap point.
function cameraPadding() {
  if (typeof window !== "undefined" && window.innerWidth >= 900) {
    return { top: 60, bottom: 40, left: 448, right: 40 };
  }
  return { top: 60, bottom: 180, left: 24, right: 24 };
}

// Fly the map to the given bounds whenever they change. A single point has
// zero-area bounds; fitBounds would zoom to the map's max zoom, where the
// CARTO basemap has no tiles (black map). So a lone pin flies to a fixed
// street-level zoom instead, and fitBounds is clamped so even a very short
// route never flies past tile coverage.
function FlyTo({ bounds }) {
  const { map, isLoaded } = useMap();
  useEffect(() => {
    if (!map || !isLoaded || !bounds) return;
    const [
      [minLng, minLat],
      [maxLng, maxLat],
    ] = bounds;
    const padding = cameraPadding();
    if (minLng === maxLng && minLat === maxLat) {
      map.flyTo({ center: [minLng, minLat], zoom: 13, duration: 800, padding });
      return;
    }
    map.fitBounds(bounds, { padding, duration: 800, maxZoom: 14 });
  }, [map, isLoaded, bounds]);
  return null;
}

function boundsOf(coords) {
  if (!coords || coords.length === 0) return null;
  let minLng = 180;
  let minLat = 90;
  let maxLng = -180;
  let maxLat = -90;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

function hikeCoords(h) {
  return h && h.geometry && Array.isArray(h.geometry.coordinates)
    ? h.geometry.coordinates
    : [];
}

// Meeting point = first waypoint (route start).
function meetingPoint(h) {
  const wps = Array.isArray(h.waypoints) ? h.waypoints : [];
  return wps.length > 0 ? wps[0] : null;
}

// Meeting-point pins, one per hike at every zoom level — no clustering
// (removed at the user's word: tapping a pin narrows the list to that
// hike's week instead, so the map never has to hide pins). Non-selected
// pins render muted while a route is shown so the selected route stays
// the focus.
function Pins({ hikes, selectedIndex, onSelect }) {
  return (
    <>
      {hikes.map((h, i) => {
        const mp = meetingPoint(h);
        if (!mp) return null;
        const color = routeColor(h._idx ?? i);
        const isActive = i === selectedIndex;
        const isMuted = selectedIndex !== null && !isActive;
        return (
          <MapMarker
            key={h.id || h.hike_date}
            longitude={mp.lng}
            latitude={mp.lat}
            anchor="bottom"
            onClick={() => onSelect(i)}
          >
            <MarkerContent>
              <span
                className={`hike-pin${isActive ? " active" : ""}${isMuted ? " muted" : ""}`}
              >
                <MapPin
                  size={isMuted ? 22 : 30}
                  color={isMuted ? "#9ca3af" : color}
                  strokeWidth={2}
                />
              </span>
            </MarkerContent>
          </MapMarker>
        );
      })}
    </>
  );
}

// Pins-only map. One pin per hike at its meeting point; no routes drawn by
// default. Tapping a pin (or its Timeline entry) draws that hike's route
// progressively from the start point, with a moving dot at the drawing head.
// The draw is a small requestAnimationFrame loop driving MapRoute's
// `progress` prop; the shipped mapcn component slices the route via setData
// internally (RouteProgress) and pins the dot via RouteMarker at="progress".
// Tapping another pin cancels the current animation and draws the new route;
// tapping the same pin hides the route again. While a route is shown the
// other pins stay visible but muted (smaller, gray) — Google Maps shows
// alternatives muted instead of hiding them.
export default function HikesMap({ hikes, selectedIndex, onSelect, basemap }) {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef(null);

  // Satellite mode uses the Esri raster style for both themes; otherwise the
  // mapcn CARTO light/dark defaults apply (styles undefined).
  const styles =
    basemap === "satellite"
      ? { dark: ESRI_WORLD_IMAGERY, light: ESRI_WORLD_IMAGERY }
      : undefined;

  const selected =
    selectedIndex === null || selectedIndex === undefined
      ? null
      : hikes[selectedIndex] || null;

  const pinCoords = useMemo(
    () =>
      hikes
        .map((h) => {
          const mp = meetingPoint(h);
          return mp ? [mp.lng, mp.lat] : null;
        })
        .filter(Boolean),
    [hikes]
  );

  // Camera target: the selected route PLUS every meeting-point pin, so the
  // muted pins always stay on screen and clickable (Google Maps keeps
  // alternatives visible instead of hiding them). Fitting only the route
  // zooms tight onto it and pushes the other pins thousands of pixels
  // off-screen, where they can neither be seen nor clicked.
  const targetBounds = useMemo(() => {
    if (selected)
      return boundsOf([...hikeCoords(selected), ...pinCoords]);
    return boundsOf(pinCoords);
  }, [selected, pinCoords]);

  const center = useMemo(() => {
    if (pinCoords.length > 0) return pinCoords[0];
    return [-123.12, 49.28]; // Vancouver fallback
  }, [pinCoords]);

  // Animate the selected route drawing itself, 0 -> 1. Duration scales with
  // distance: ~1s for the shortest routes, ~2s for the longest (12.93 km).
  // Cleanup cancels the frame, so switching pins stops the old draw at once.
  useEffect(() => {
    if (!selected) {
      setProgress(0);
      return;
    }
    const dist = Number(selected.distance_km) || 0;
    const duration = Math.min(2000, Math.max(1000, 1000 + (dist / 13) * 1000));
    const start = performance.now();
    cancelAnimationFrame(rafRef.current);
    setProgress(0);
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      setProgress(t);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [selected]);

  const selectedColor = selected
    ? routeColor(selected._idx ?? selectedIndex)
    : null;
  const selectedWaypoints = selected
    ? (Array.isArray(selected.waypoints) ? selected.waypoints : []).slice(1)
    : [];

  return (
    <div className="hike-map">
      <Map viewport={{ center, zoom: 10 }} styles={styles}>
        <FlyTo bounds={targetBounds} />

        <Pins hikes={hikes} selectedIndex={selectedIndex} onSelect={onSelect} />

        {/* Selected route: base line hidden, RouteProgress draws the traveled
            slice, RouteMarker rides the drawing head. */}
        {selected && (
          <MapRoute
            key={selected.id || selected.hike_date}
            id={`hike-${selected.id || selectedIndex}`}
            coordinates={hikeCoords(selected)}
            color={selectedColor}
            width={3}
            opacity={0}
            active
            activeWidth={5}
            progress={progress}
            onClick={() => onSelect(selectedIndex)}
          >
            <RouteProgress color={selectedColor} width={5} opacity={1} />
            <RouteMarker at="progress" anchor="center">
              <MarkerContent>
                <span
                  className="hike-walker-dot"
                  style={{ borderColor: selectedColor }}
                />
              </MarkerContent>
            </RouteMarker>
          </MapRoute>
        )}

        {/* Intermediate/end stops of the selected hike, once drawn. */}
        {selected &&
          progress >= 1 &&
          selectedWaypoints.map((w, j) => (
            <MapMarker
              key={`${selected.id || selectedIndex}-wp-${j + 1}`}
              longitude={w.lng}
              latitude={w.lat}
              onClick={() => onSelect(selectedIndex)}
            >
              <MarkerContent>
                <span
                  className="hike-marker-num"
                  style={{ background: selectedColor }}
                >
                  {j + 2}
                </span>
              </MarkerContent>
            </MapMarker>
          ))}
      </Map>
    </div>
  );
}
