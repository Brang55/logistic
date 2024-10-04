import styles from "./CargoPreview.module.css";

import { useLoadCargoQuery } from "../../../app/features/driver/cargoSlice";
import { useParams } from "react-router-dom";

import { Loader } from "../../Loader/Loader";
import { BackButton } from "../../Back/BackButton";
import { useLoadDriverQuery } from "../../../app/features/driver/driverSlice";
import { useLoadTruckQuery } from "../../../app/features/driver/truckSlice";
import { useLoadTrailerQuery } from "../../../app/features/driver/trailerSlice";

export const CargoPreview = () => {
  const { id } = useParams<{ id: string }>();

  const {
    data: cargo,
    isError,
    isLoading,
  } = useLoadCargoQuery(id!, { skip: !id });
  // @ts-expect-error not a final version
  const { data: driver } = useLoadDriverQuery(cargo?.driverId);
  // @ts-expect-error not a final version
  const { data: truck } = useLoadTruckQuery(cargo?.truckId);
  // @ts-expect-error not a final version
  const { data: trailer } = useLoadTrailerQuery(cargo?.trailerId);

  console.log(driver);

  if (!id) {
    return <h1>Invalid Cargo ID</h1>;
  }

  if (isError) {
    return <h1>There is an error</h1>;
  }

  if (isLoading) {
    return <Loader />;
  }

  if (!cargo) {
    return <h1>Cargo not found</h1>;
  }

  return (
    <ul className={styles.previewContainer}>
      <div className={styles.previewOptions}>
        <BackButton />
      </div>
      <li>
        <h3>Shipper Information</h3>
        <span>Name: {cargo.shipperName}</span>
        <span>Address: {cargo.shipperAddress}</span>
        <span>Contact: {cargo.contactPerson}</span>
        <span>Phone: {cargo.phoneNumber}</span>
        <span>Email: {cargo.emailAddress}</span>
      </li>
      <li>
        <h3>Receiver Information</h3>
        <span>Name: {cargo.receiverName}</span>
        <span>Address: {cargo.receiverAddress}</span>
        <span>Contact: {cargo.receiverContact}</span>
        <span>Phone: {cargo.receiverPhone}</span>
        <span>Email: {cargo.receiverEmail}</span>
      </li>
      <li className={styles.previewCargoDet}>
        <h3>Cargo Details</h3>
        <span>Quantity: {cargo.quantity}</span>
        <span>Weight: {cargo.weight}</span>
        <span>Dimensions: {cargo.dimensions}</span>
        <span>Description of Goods: {cargo.descriptionOfGoods}</span>
      </li>
      <li className={styles.previewDeliveryInfo}>
        <h3>Delivery Details</h3>
        <div>
          <span>Pickup Location: {cargo.pickupLocation}</span>
          <span>Pickup Date: {cargo.pickupDate}</span>
        </div>
        <div>
          <span>Delivery Location: {cargo.deliveryLocation}</span>
          <span>Delivery Date: {cargo.deliveryDate}</span>
        </div>
      </li>
      <li>
        <h3>Additional Information</h3>
        <span>Type of Truck: {cargo.truckType}</span>
        <span>Type of Service: {cargo.serviceType}</span>
      </li>
      <li>
        <h3>Cost and Payments</h3>
        <span>Freight Cost: {cargo.freightCost}</span>
        <span>Payment Terms: {cargo.paymentTerms}</span>
      </li>
      <li>
        <h3>Notes</h3>
        <span>Additional Notes:{cargo.notes}</span>
      </li>
      <div className={styles.cargoConfig}>
        <h2>Cargo Configured</h2>
        <h4>
          Driver:{" "}
          {cargo.driverId
            ? `${driver?.firstName} ${driver?.lastName}`
            : "No driver Selected"}
        </h4>
        <h4>
          Truck:{" "}
          {cargo.truckId
            ? `${truck?.truckModel} Truck Number: ${truck?.truckNumber}`
            : "No Truck Selected"}
        </h4>
        <h4>
          Trailer:{" "}
          {cargo.trailerId
            ? `${trailer?.trailerNumber}`
            : "No Trailer Selected"}
        </h4>
      </div>
    </ul>
  );
};
