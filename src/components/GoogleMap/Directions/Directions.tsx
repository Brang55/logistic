import { useEffect, useState } from "react";

import styles from "./Directions.module.css";

import { useMapsLibrary, useMap } from "@vis.gl/react-google-maps";

interface DirectionsProps {
  pickupDate: string;
  pickupLocation: string;
  deliveryDate: string;
  deliveryLocation: string;
}

const Directions = ({
  pickupLocation,

  deliveryLocation,
}: DirectionsProps) => {
  const map = useMap();
  const routesLibrary = useMapsLibrary("routes");

  const [directionsService, setDirectionsService] =
    useState<google.maps.DirectionsService>();
  const [directionsRenderer, setDirectionsRenderer] =
    useState<google.maps.DirectionsRenderer>();

  const [routes, setRoutes] = useState<google.maps.DirectionsRoute[]>([]);

  const [routeIndex, setRouteIndex] = useState(0);

  const selected = routes[routeIndex];
  const leg = selected?.legs[0];

  // const passOrigin = "g.k. Mladost 2Mladost, Младост 2 261Г, 1799 Sofia";
  // const passDestination = "Plovdiv";

  useEffect(() => {
    if (!routesLibrary || !map) return;
    setDirectionsService(new routesLibrary.DirectionsService());
    setDirectionsRenderer(new routesLibrary.DirectionsRenderer({ map }));
  }, [routesLibrary, map]);

  useEffect(() => {
    if (
      !directionsService ||
      !directionsRenderer ||
      !pickupLocation ||
      !deliveryLocation
    )
      return;
    directionsService
      .route({
        origin: pickupLocation,
        destination: deliveryLocation,
        travelMode: google.maps.TravelMode.DRIVING,
        provideRouteAlternatives: true,
      })
      .then((response) => {
        directionsRenderer.setDirections(response);
        setRoutes(response.routes);
      });
  }, [directionsService, directionsRenderer, pickupLocation, deliveryLocation]);

  useEffect(() => {
    if (!directionsRenderer) return;
    directionsRenderer.setRouteIndex(routeIndex);
  }, [routeIndex, directionsRenderer]);

  if (!leg) return null;

  return (
    <div className={styles.directionsContainer}>
      <div className={styles.directionsBox}>
        <h2>{selected.summary}</h2>
        <p>
          {leg.start_address.split(",")[0]} to {leg.end_address.split(",")[0]}
        </p>
        <p>Distance: {leg.distance?.text}</p>
        <p>Duration: {leg.duration?.text}</p>
        <h2>Other Routes</h2>
        <ul>
          {routes.map((route, index) => (
            <li key={route.summary}>
              <button
                onClick={() => setRouteIndex(index)}
                className={styles.otherRoutes}
              >
                {route.summary}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default Directions;
