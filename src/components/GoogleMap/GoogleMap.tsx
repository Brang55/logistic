import Directions from "./Directions/Directions";

import styles from "./GoogleMap.module.css";

import { APIProvider, Map } from "@vis.gl/react-google-maps";

interface GoogleMapProps {
  pickupDate: string;
  pickupLocation: string;
  deliveryDate: string;
  deliveryLocation: string;
}

const GoogleMap = ({
  pickupDate,
  pickupLocation,
  deliveryDate,
  deliveryLocation,
}: GoogleMapProps) => {
  // @ts-expect-error not a final version
  const apiKey = import.meta.env.VITE_REACT_APP_GOOGLE_API_KEY;

  // const mapId = import.meta.env.VITE_REACT_APP_MAP_ID;

  // const position = useMemo(() => ({ lat: 42.698334, lng: 23.319941 }), []);

  return (
    <div className={styles.googleMap}>
      <APIProvider apiKey={apiKey}>
        <Map
          defaultCenter={{ lat: 42.698334, lng: 23.319941 }}
          defaultZoom={12}
          reuseMaps={true}
        >
          <Directions
            pickupDate={pickupDate}
            pickupLocation={pickupLocation}
            deliveryDate={deliveryDate}
            deliveryLocation={deliveryLocation}
          />
        </Map>
      </APIProvider>
    </div>
  );
};

export default GoogleMap;
