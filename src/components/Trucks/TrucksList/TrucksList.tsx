import {
  useDeleteTruckMutation,
  useFetchTrucksQuery,
  useLoadTruckQuery,
} from "../../../app/features/driver/truckSlice";
import { Loader } from "../../Loader/Loader";
import { useState } from "react";
import { Confirm } from "../../Confirm/Confirm";
import AddTruckForm from "../AddTruck/AddTruckForm/AddTruckForm";
import { EntityItem } from "../../Entity/EntityItem/EntityItem";
import { EntityList } from "../../Entity/EntityList/EntityList";
import AddTruck from "../AddTruck/AddTruck";

interface Truck {
  id: string;
  truckNumber: string;
  truckModel: string;
  engineVariation: string;
}

const TrucksList = () => {
  const { data: trucks, isError, isLoading } = useFetchTrucksQuery();
  const [deleteTruck] = useDeleteTruckMutation();
  const [editTruckForm, setEditTruckForm] = useState<boolean>(false);
  const [confirm, setConfirm] = useState<boolean>(false);
  const [clickedTruck, setClickedTruck] = useState<string>("");

  const { data: truck, isLoading: isTruckLoading } = useLoadTruckQuery(
    clickedTruck,
    { skip: !clickedTruck }
  );

  const headings = ["Model", "Truck No", "Engine", "Options"];
  const entityFields: Array<keyof Truck> = [
    "truckModel",
    "truckNumber",
    "engineVariation",
  ];

  const truckModels = ["Scania", "DAF"];
  const engineVariations = ["Petrol", "Diesel"];

  if (isError) {
    return <h1>There is an error</h1>;
  }

  if (isLoading) {
    return <Loader />;
  }

  const onDeleteClick = (id: string) => {
    setConfirm(true);
    setClickedTruck(id);
  };

  const onEditClick = (id: string) => {
    setClickedTruck(id);
    setEditTruckForm(true);
  };

  const handleDeleteTruck = async (clickedTruck: string) => {
    try {
      await deleteTruck(clickedTruck);
      setConfirm(false);
    } catch (err) {
      return { error: err };
    }
  };

  return (
    <>
      <AddTruck />
      {trucks && (
        <EntityList<Truck>
          data={trucks}
          renderItem={(item: Truck) => (
            // @ts-expect-error not a final version
            <EntityItem<Truck>
              key={item.id}
              entityFields={entityFields}
              truckModels={truckModels}
              engineVariations={engineVariations}
              item={item}
              onDeleteClick={onDeleteClick}
              onEditClick={onEditClick}
            />
          )}
          headings={headings}
        />
      )}
      {editTruckForm && truck && !isTruckLoading && (
        <AddTruckForm
          id={truck?.id}
          open={editTruckForm}
          onClose={() => setEditTruckForm(false)}
          status={truck?.status}
          truckNumber={truck?.truckNumber}
          editTruckForm={editTruckForm}
          truckModel={truck?.truckModel || ""}
          engineVariation={truck?.engineVariation || ""}
        />
      )}
      {confirm && (
        <Confirm
          show={confirm}
          onConfirm={() => handleDeleteTruck(clickedTruck)}
          onCancel={() => setConfirm(false)}
          truckName={clickedTruck}
        />
      )}
    </>
  );
};

export default TrucksList;
