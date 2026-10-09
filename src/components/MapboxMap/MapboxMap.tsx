import { useEffect, useRef, useState } from "react";

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import Directions from "./Directions/Directions";

import styles from "./MapboxMap.module.css";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

interface MapboxMapProps {
  pickupDate: string;
  pickupLocation: string;
  deliveryDate: string;
  deliveryLocation: string;
}

const MapboxMap = ({
  pickupDate,
  pickupLocation,
  deliveryDate,
  deliveryLocation,
}: MapboxMapProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<mapboxgl.Map>();

  useEffect(() => {
    if (!containerRef.current) return;

    const mapInstance = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [23.319941, 42.698334],
      zoom: 12,
    });
    mapInstance.on("load", () => setMap(mapInstance));

    return () => {
      setMap(undefined);
      mapInstance.remove();
    };
  }, []);

  return (
    <div className={styles.mapboxMap}>
      <div ref={containerRef} className={styles.mapContainer} />
      {map && (
        <Directions
          map={map}
          pickupDate={pickupDate}
          pickupLocation={pickupLocation}
          deliveryDate={deliveryDate}
          deliveryLocation={deliveryLocation}
        />
      )}
    </div>
  );
};

export default MapboxMap;
