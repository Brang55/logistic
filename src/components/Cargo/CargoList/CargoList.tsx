import { CargoItem } from "../CargoItem/CargoItem";

import {
  useConfirmCargoMutation,
  useDeleteCargoMutation,
  useFetchCargosQuery,
  useLoadCargoQuery,
} from "../../../app/features/driver/cargoSlice";
import { Loader } from "../../Loader/Loader";
import { Confirm } from "../../Confirm/Confirm";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export const CargoList = () => {
  const { data: cargos, isError, isLoading } = useFetchCargosQuery();
  const [deleteCargo] = useDeleteCargoMutation();

  const [previewCargo, setPreviewCargo] = useState<boolean>(false);
  const [confirm, setConfirm] = useState<boolean>(false);
  const [clickedCargo, setClickedCargo] = useState<string>("");
  const [actionType, setActionType] = useState<"delete" | "confirm">("delete");

  const navigate = useNavigate();

  console.log(cargos);

  const { data: cargo, isLoading: isCargoLoading } = useLoadCargoQuery(
    clickedCargo,
    { skip: !clickedCargo }
  );

  const [confirmCargo] = useConfirmCargoMutation();

  console.log(cargo);

  if (isError) {
    return <h1>There is an error</h1>;
  }

  if (isLoading) {
    return <Loader />;
  }

  const onDeleteClick = (id: string) => {
    setActionType("delete");
    setConfirm(true);
    setClickedCargo(id);
  };

  const onConfirmClick = (id: string) => {
    setActionType("confirm");
    setConfirm(true);
    setClickedCargo(id);
  };

  const onEditClick = (id: string) => {
    setClickedCargo(id);
    navigate(`/cargoList/${id}/edit`);
  };

  const onPreviewClick = (id: string) => {
    setClickedCargo(id);
    setPreviewCargo(true);
    navigate(`/cargoList/${id}/preview`);
  };

  const handleDeleteCargo = async (clickedCargo: string) => {
    try {
      await deleteCargo(clickedCargo);
      setConfirm(false);
    } catch (err) {
      return { error: err };
    }
  };

  const handleConfirmCargo = async (clickedCargo: string) => {
    try {
      await confirmCargo(clickedCargo);
      setConfirm(false);
    } catch (err) {
      return { error: err };
    }
  };

  const handleConfirmAction = async () => {
    if (actionType === "delete") {
      await handleDeleteCargo(clickedCargo);
    } else if (actionType === "confirm") {
      await handleConfirmCargo(clickedCargo);
    }
  };

  return (
    <>
      <h1>Cargo List</h1>
      <ul>
        {cargos &&
          cargos.map((cargo) => (
            <CargoItem
              key={cargo.id}
              id={cargo.id}
              onPreviewClick={() => onPreviewClick(cargo.id)}
              onEditClicked={() => onEditClick(cargo.id)}
              onDeleteClicked={() => onDeleteClick(cargo.id)}
              onConfirmClick={() => onConfirmClick(cargo.id)}
              handleConfirmCargo={() => handleConfirmCargo(cargo.id)}
              clickedCargo={clickedCargo}
              contactPerson={cargo.contactPerson}
              deliveryDate={cargo.deliveryDate}
              deliveryLocation={cargo.deliveryLocation}
              descriptionOfGoods={cargo.descriptionOfGoods}
              dimensions={cargo.dimensions}
              emailAddress={cargo.emailAddress}
              freightCost={cargo.freightCost}
              hazardousMaterial={cargo.hazardousMaterial}
              notes={cargo.notes}
              paymentTerms={cargo.paymentTerms}
              phoneNumber={cargo.phoneNumber}
              pickupDate={cargo.pickupDate}
              pickupLocation={cargo.pickupLocation}
              quantity={cargo.quantity}
              receiverAddress={cargo.receiverAddress}
              receiverContact={cargo.receiverContact}
              receiverEmail={cargo.receiverEmail}
              receiverName={cargo.receiverName}
              receiverPhone={cargo.receiverPhone}
              serviceType={cargo.serviceType}
              shipperAddress={cargo.shipperAddress}
              shipperName={cargo.shipperName}
              specialHandlingInstructions={cargo.specialHandlingInstructions}
              temperatureControl={cargo.temperatureControl}
              truckType={cargo.truckType}
              weight={cargo.weight}
              status={cargo.status}
            />
          ))}
      </ul>
      {confirm && (
        <Confirm
          show={confirm}
          onConfirm={handleConfirmAction}
          onCancel={() => setConfirm(false)}
        />
      )}
    </>
  );
};
