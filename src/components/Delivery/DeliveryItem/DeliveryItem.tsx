import truckImage from "../../../assets/images/truck.png";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser } from "@fortawesome/free-solid-svg-icons";
import { faCircle } from "@fortawesome/free-solid-svg-icons";
import { faLocationDot } from "@fortawesome/free-solid-svg-icons";
import { faPhone } from "@fortawesome/free-solid-svg-icons";
import { faCommentDots } from "@fortawesome/free-solid-svg-icons";

interface DeliveryItemPros<T> {
  onDeliverClick: (
    pickupDate: string,
    pickupLocation: string,
    deliveryDate: string,
    deliveryLocation: string
  ) => void;
  pickupDate: string;
  pickupLocation: string;
  deliveryDate: string;
  deliveryLocation: string;
}

import styles from "./DeliveryItem.module.css";

const DeliveryItem = <T,>({
  onDeliverClick,
  pickupDate,
  pickupLocation,
  deliveryDate,
  deliveryLocation,
}: DeliveryItemPros<T>): JSX.Element => {
  return (
    <li
      className={styles.deliveryItem}
      onClick={() =>
        onDeliverClick(
          pickupDate,
          pickupLocation,
          deliveryDate,
          deliveryLocation
        )
      }
    >
      <div className={styles.deliveryInfoHandler}>
        <div className={styles.deliveryInfo}>
          <span>Shipment number</span>
          <h3>EV-2017002346</h3>
          <span>Food Materials</span>
        </div>
        <img src={truckImage} alt="truck" />
      </div>
      <div className={styles.deliveryLocationHandler}>
        <div className={styles.deliveryLocation}>
          <FontAwesomeIcon
            icon={faCircle}
            size="2x"
            className={styles.deliveryDot}
          />
          <h3>{pickupDate}</h3>
          <span>{pickupLocation}</span>
        </div>
        <hr className={styles.dotted} />
        <div className={styles.deliveryLocation}>
          <FontAwesomeIcon
            icon={faLocationDot}
            size="2x"
            className={styles.deliveryPoint}
          />
          <h3>{deliveryDate}</h3>
          <span>{deliveryLocation}</span>
        </div>
      </div>
      <div className={styles.deliveryClient}>
        <FontAwesomeIcon
          icon={faUser}
          size="2x"
          className={styles.deliveryClientIcon}
        />
        <div className={styles.deliveryClientHandler}>
          <span>Client</span>
          <h5>Darrell Steward</h5>

          <span>Mariene, LTD</span>
        </div>
        <ul className={styles.deliveryClientContact}>
          <li>
            <FontAwesomeIcon icon={faPhone} size="2x" />
          </li>
          <li>
            <FontAwesomeIcon icon={faCommentDots} size="2x" />
          </li>
        </ul>
      </div>
    </li>
  );
};

export default DeliveryItem;
