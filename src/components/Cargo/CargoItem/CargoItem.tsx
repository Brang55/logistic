import { useState } from "react";
import styles from "./CargoItem.module.css";
import { Confirm } from "../../Confirm/Confirm";

interface CargoItemProps<T> {
  onPreviewClick: (id: string) => void;
  onEditClicked: (id: string) => void;
  onDeleteClicked: (id: string) => void;
  onConfirmClick: (id: string) => void;
  handleConfirmCargo: (id: string) => void;
  clickedCargo: string;
  key: string;
  id: string;
  contactPerson: string;
  deliveryDate: string;
  deliveryLocation: string;
  descriptionOfGoods: string;
  dimensions: string;
  emailAddress: string;
  freightCost: string;
  hazardousMaterial: string;
  notes: string;
  paymentTerms: string;
  phoneNumber: string;
  pickupDate: string;
  pickupLocation: string;
  quantity: string;
  receiverAddress: string;
  receiverContact: string;
  receiverEmail: string;
  receiverName: string;
  receiverPhone: string;
  serviceType: string;
  shipperAddress: string;
  shipperName: string;
  specialHandlingInstructions: string;
  temperatureControl: string;
  truckType: string;
  weight: string;
  status: string;
}

export const CargoItem = <T,>({
  onEditClicked,
  onDeleteClicked,
  onPreviewClick,
  onConfirmClick,
  handleConfirmCargo,
  clickedCargo,
  id,
  deliveryDate,
  deliveryLocation,
  emailAddress,
  phoneNumber,
  pickupDate,
  pickupLocation,
  receiverAddress,
  receiverEmail,
  receiverName,
  receiverPhone,
  shipperAddress,
  shipperName,
  status,
}: CargoItemProps<T>): JSX.Element => {
  const [openConfirm, setOpenConfirm] = useState<boolean>(false);

  return (
    <>
      <li
        className={`${styles.cargoContainer} ${
          status === "edited" ? styles.slashBackground : ""
        }`}
      >
        <div className={styles.cargoPersonalInformation}>
          <h4>Shipper Information</h4>
          <h3>{shipperName}</h3>
          <span>{shipperAddress}</span>
          <span>{phoneNumber}</span>
          <span>{emailAddress}</span>
        </div>
        <div className={styles.cargoPersonalInformation}>
          <h4>Receiver Information</h4>
          <h3>{receiverName}</h3>
          <span>{receiverAddress}</span>
          <span>{receiverPhone}</span>
          <span>{receiverEmail}</span>
        </div>
        <div className={styles.cargoInfo}>
          <h4>Cargo Information</h4>
          <div className={styles.cargoDates}>
            <span>Pickup Date: {pickupDate}</span>
            <span>Pickup Location: {pickupLocation}</span>
          </div>
          <div className={styles.cargoDates}>
            <span>Delivery Date: {deliveryDate}</span>
            <span>Delivery Location: {deliveryLocation}</span>
          </div>
        </div>
        <div className={styles.cargoOptions}>
          <button
            className={styles.cargoOption}
            onClick={() => onConfirmClick(id)}
          >
            Confirm
          </button>
          <button
            className={styles.cargoOption}
            onClick={() => onPreviewClick(id)}
          >
            Preview
          </button>
          <button
            className={styles.cargoOption}
            onClick={() => onEditClicked(id)}
          >
            Edit
          </button>
          <button
            className={styles.cargoDelete}
            onClick={() => onDeleteClicked(id)}
          >
            Delete
          </button>
        </div>
      </li>
      {openConfirm && (
        <Confirm
          show={openConfirm}
          onConfirm={() => handleConfirmCargo(clickedCargo)}
          onCancel={() => setOpenConfirm(false)}
        />
      )}
    </>
  );
};
