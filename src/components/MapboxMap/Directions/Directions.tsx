import { useEffect, useState } from "react";

import mapboxgl from "mapbox-gl";

import styles from "./Directions.module.css";
import { formatDistance, formatDuration } from "../../../utils/format";

interface DirectionsProps {
  map: mapboxgl.Map;
  pickupDate: string;
  pickupLocation: string;
  deliveryDate: string;
  deliveryLocation: string;
}

type Coordinates = [number, number];

interface Place {
  name: string;
  coordinates: Coordinates;
}

interface Route {
  geometry: { type: "LineString"; coordinates: Coordinates[] };
  distance: number;
  duration: number;
  legs: { summary: string }[];
}

const accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

const ROUTES_SOURCE = "routes";

const geocode = async (query: string, signal: AbortSignal): Promise<Place> => {
  const params = new URLSearchParams({
    q: query,
    limit: "1",
    access_token: accessToken,
  });
  const response = await fetch(
    `https://api.mapbox.com/search/geocode/v6/forward?${params}`,
    { signal }
  );
  if (!response.ok) throw new Error(`Geocoding failed: ${response.status}`);

  const [feature] = (await response.json()).features;
  if (!feature) throw new Error(`No location found for "${query}"`);

  return {
    name: feature.properties.name,
    coordinates: feature.geometry.coordinates,
  };
};

const fetchRoutes = async (
  places: Place[],
  signal: AbortSignal
): Promise<Route[]> => {
  const waypoints = places.map((place) => place.coordinates.join(",")).join(";");
  const params = new URLSearchParams({
    alternatives: "true",
    geometries: "geojson",
    overview: "full",
    access_token: accessToken,
  });
  const response = await fetch(
    `https://api.mapbox.com/directions/v5/mapbox/driving/${waypoints}?${params}`,
    { signal }
  );
  if (!response.ok) throw new Error(`Directions failed: ${response.status}`);

  return (await response.json()).routes;
};

const routeName = (route: Route, index: number) =>
  route.legs[0]?.summary || `Route ${index + 1}`;

const Directions = ({
  map,
  pickupLocation,

  deliveryLocation,
}: DirectionsProps) => {
  const [places, setPlaces] = useState<Place[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);

  const [routeIndex, setRouteIndex] = useState(0);

  const selected = routes[routeIndex];

  useEffect(() => {
    if (map.getSource(ROUTES_SOURCE)) return;

    map.addSource(ROUTES_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    map.addLayer({
      id: "routes-alternative",
      type: "line",
      source: ROUTES_SOURCE,
      filter: ["!=", ["get", "selected"], true],
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": "#9e9e9e", "line-width": 5 },
    });
    map.addLayer({
      id: "routes-selected",
      type: "line",
      source: ROUTES_SOURCE,
      filter: ["==", ["get", "selected"], true],
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": "#d8a415", "line-width": 6 },
    });
  }, [map]);

  useEffect(() => {
    if (!pickupLocation || !deliveryLocation) return;

    const controller = new AbortController();
    Promise.all([
      geocode(pickupLocation, controller.signal),
      geocode(deliveryLocation, controller.signal),
    ])
      .then(async (found) => {
        const foundRoutes = await fetchRoutes(found, controller.signal);
        setPlaces(found);
        setRoutes(foundRoutes);
        setRouteIndex(0);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error(error);
        setPlaces([]);
        setRoutes([]);
      });

    return () => controller.abort();
  }, [pickupLocation, deliveryLocation]);

  useEffect(() => {
    const markers = places.map((place, index) =>
      new mapboxgl.Marker({ color: index === 0 ? "#2e7d32" : "#c62828" })
        .setLngLat(place.coordinates)
        .setPopup(new mapboxgl.Popup().setText(place.name))
        .addTo(map)
    );

    return () => markers.forEach((marker) => marker.remove());
  }, [map, places]);

  useEffect(() => {
    const source = map.getSource(ROUTES_SOURCE) as
      | mapboxgl.GeoJSONSource
      | undefined;
    source?.setData({
      type: "FeatureCollection",
      features: routes.map((route, index) => ({
        type: "Feature",
        geometry: route.geometry,
        properties: { selected: index === routeIndex },
      })),
    });

    if (!selected) return;
    const bounds = new mapboxgl.LngLatBounds();
    selected.geometry.coordinates.forEach((point) => bounds.extend(point));
    map.fitBounds(bounds, {
      padding: { top: 50, bottom: 50, left: 50, right: 370 },
    });
  }, [map, routes, routeIndex, selected]);

  if (!selected || places.length < 2) return null;

  return (
    <div className={styles.directionsContainer}>
      <div className={styles.directionsBox}>
        <h2>{routeName(selected, routeIndex)}</h2>
        <p>
          {places[0].name} to {places[1].name}
        </p>
        <p>Distance: {formatDistance(selected.distance)}</p>
        <p>Duration: {formatDuration(selected.duration)}</p>
        <h2>Other Routes</h2>
        <ul>
          {routes.map((route, index) => (
            <li key={index}>
              <button
                onClick={() => setRouteIndex(index)}
                className={styles.otherRoutes}
              >
                {routeName(route, index)}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default Directions;
