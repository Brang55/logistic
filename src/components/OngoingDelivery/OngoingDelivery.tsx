import { useState } from "react";
import DeliveryList from "../Delivery/DeliveryList/DeliveryList";
import GoogleMap from "../GoogleMap/GoogleMap";
import Search from "../Search/Search";
import styles from "./OngoingDelivery.module.css";

const OngoingDelivery = () => {
  const [pickupDate, setPickupDate] = useState<string>("");
  const [pickupLocation, setPickupLocation] = useState<string>("");
  const [deliveryDate, setDeliveryDate] = useState<string>("");
  const [deliveryLocation, setDeliveryLocation] = useState<string>("");

  const handleDeliveryClick = (
    pickupDate: string,
    pickupLocation: string,
    deliveryDate: string,
    deliveryLocation: string
  ) => {
    setPickupDate(pickupDate);
    setPickupLocation(pickupLocation);
    setDeliveryDate(deliveryDate);
    setDeliveryLocation(deliveryLocation);
  };

  console.log(pickupDate, pickupLocation, deliveryDate, deliveryLocation);

  return (
    <>
      <section className={styles.ongoingSection}>
        <div className={styles.ongoingHandler}>
          <Search />
        </div>
        <h3 className={styles.ongoingTitle}>Ongoing Delivery</h3>
        <DeliveryList onDeliveryClick={handleDeliveryClick} />
      </section>
      <div className={styles.googleMapsHandler}>
        <GoogleMap
          pickupDate={pickupDate}
          pickupLocation={pickupLocation}
          deliveryDate={deliveryDate}
          deliveryLocation={deliveryLocation}
        />
      </div>
    </>
  );
};

export default OngoingDelivery;
