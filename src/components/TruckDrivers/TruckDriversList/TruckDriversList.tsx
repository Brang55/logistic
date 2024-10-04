import AddDriver from "../AddDriver/AddDriver";

import {
  useDeleteDriverMutation,
  useFetchDriversQuery,
  useLoadDriverQuery,
} from "../../../app/features/driver/driverSlice";
import { Loader } from "../../Loader/Loader";
import { useState } from "react";
import { Confirm } from "../../Confirm/Confirm";
import AddDriverForm from "../AddDriver/AddDriverForm/AddDriverForm";

import { EntityItem } from "../../Entity/EntityItem/EntityItem";
import { EntityList } from "../../Entity/EntityList/EntityList";

interface Driver {
  id: string;
  firstName: string;
  lastName: string;
  phoneNumber: string | number;
  truckDriverEmail: string;
  truckNumber: string;
  status: string;
}

const TruckDriversList = () => {
  const { data: drivers, isError, isLoading } = useFetchDriversQuery();
  const [deleteDriver] = useDeleteDriverMutation();
  const [editDriverForm, setEditDriverForm] = useState<boolean>(false);
  const [confirm, setConfirm] = useState<boolean>(false);
  const [clickedDriver, setClickedDriver] = useState<string>("");
  const [clickedDriverName, setClickedDriverName] = useState<string>("");
  const [clickedDriverLastName, setClickedDriverLastName] =
    useState<string>("");

  console.log(clickedDriver);

  const { data: driver, isLoading: isDriverLoading } = useLoadDriverQuery(
    clickedDriver,
    { skip: !clickedDriver }
  );

  console.log(driver);

  const headings = [
    "First Name",
    "Last Name",
    "Phone No.",
    "Email",
    "Truck No",
    "Options",
  ];
  const entityFields: Array<keyof Driver> = [
    "firstName",
    "lastName",
    "phoneNumber",
    "truckDriverEmail",
    "truckNumber",
  ];

  if (isError) {
    return <h1>There is an error</h1>;
  }

  if (isLoading) {
    return <Loader />;
  }

  const onDeleteClick = (id: string, firstName: string, lastName: string) => {
    setConfirm(true);
    setClickedDriver(id);
    setClickedDriverName(firstName);
    setClickedDriverLastName(lastName);
  };

  const onEditClick = (id: string) => {
    setClickedDriver(id);
    setEditDriverForm(true);
  };

  const handleDeleteDriver = async (clickedDriver: string) => {
    try {
      await deleteDriver(clickedDriver);
      setConfirm(false);
    } catch (err) {
      return { error: err };
    }
  };

  return (
    <>
      <AddDriver />
      {drivers && (
        <EntityList<Driver>
          data={drivers}
          renderItem={(item: Driver) => (
            <EntityItem<Driver>
              key={item.id}
              entityFields={entityFields}
              item={item}
              onDeleteClick={onDeleteClick}
              onEditClick={onEditClick}
            />
          )}
          headings={headings}
        />
      )}
      {editDriverForm && driver && !isDriverLoading && (
        <AddDriverForm
          id={driver?.id}
          open={editDriverForm}
          onClose={() => setEditDriverForm(false)}
          firstName={driver?.firstName}
          lastName={driver?.lastName}
          truckNumber={driver?.truckNumber}
          truckDriverEmail={driver?.truckDriverEmail}
          phoneNumber={driver?.phoneNumber}
          editDriverForm={editDriverForm}
        />
      )}
      {confirm && (
        <Confirm
          show={confirm}
          onConfirm={() => handleDeleteDriver(clickedDriver)}
          onCancel={() => setConfirm(false)}
          driverName={clickedDriverName}
          driverLastName={clickedDriverLastName}
        />
      )}
    </>
  );
};

export default TruckDriversList;
