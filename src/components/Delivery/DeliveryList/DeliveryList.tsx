import DeliveryItem from "../DeliveryItem/DeliveryItem";

import { useFetchConfirmedCargosQuery } from "../../../app/features/driver/cargoSlice";

interface DeliveryListProps {
  onDeliveryClick: (
    pickupDate: string,
    pickupLocation: string,
    deliveryDate: string,
    deliveryLocation: string
  ) => void;
}

const DeliveryList = ({ onDeliveryClick }: DeliveryListProps) => {
  const { data: confirmedCargo } = useFetchConfirmedCargosQuery();

  return (
    <ul>
      {confirmedCargo &&
        confirmedCargo.map((cargo) => (
          <DeliveryItem
            onDeliverClick={onDeliveryClick}
            pickupLocation={cargo.pickupLocation}
            pickupDate={cargo.pickupDate}
            deliveryLocation={cargo.deliveryLocation}
            deliveryDate={cargo.deliveryDate}
          />
        ))}
    </ul>
  );
};

export default DeliveryList;
