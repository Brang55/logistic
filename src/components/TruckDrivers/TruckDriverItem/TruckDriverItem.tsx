import styles from "./TruckDriverItem.module.css";

import {
  useDeleteDriverMutation,
  useFetchDriversQuery,
  useLoadDriverQuery,
} from "../../../app/features/driver/driverSlice";
import { Loader } from "../../Loader/Loader";
import { useState } from "react";
import { Confirm } from "../../Confirm/Confirm";
import AddDriverForm from "../AddDriver/AddDriverForm/AddDriverForm";

const TruckDriverItem = () => {
  const [confirm, setConfirm] = useState<boolean>(false);
  const [editDriverForm, setEditDriverForm] = useState<boolean>(false);

  const [clickedDriverName, setClickedDriverName] = useState<string>("");

  const [clickedDriverLastName, setClickedDriverLastName] =
    useState<string>("");

  const [clickedDriver, setClickedDriver] = useState<string>("");

  const { data: drivers, isError, isLoading } = useFetchDriversQuery();

  const [deleteDriver] = useDeleteDriverMutation();

  const { data: driver, isLoading: isDriverLoading } = useLoadDriverQuery(
    clickedDriver,
    { skip: !clickedDriver }
  );
  console.log(driver);

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
      {drivers?.map((item) => {
        return (
          <div className={styles.tableRow} key={item.id}>
            <li>{`${item.firstName} ${item.lastName}`}</li>

            <li>{item.phoneNumber}</li>
            <li>{item.truckDriverEmail}</li>
            <li>{item.truckNumber}</li>
            {/* <td>
                <button className={styles.driverPreview}>Preview</button>
              </td> */}
            <li>
              <button
                className={styles.driverPreview}
                onClick={() => onEditClick(item.id)}
              >
                Edit
              </button>

              <button
                className={styles.driverDelete}
                onClick={() =>
                  onDeleteClick(item.id, item.firstName, item.lastName)
                }
                disabled={isLoading}
              >
                Delete
              </button>
            </li>
          </div>
        );
      })}
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

export default TruckDriverItem;
