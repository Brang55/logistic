import { useState } from "react";

import styles from "./AddTruck.module.css";
import AddTruckForm from "./AddTruckForm/AddTruckForm";

const AddTruck: React.FC = () => {
  const [openForm, setOpenForm] = useState<boolean>(false);

  return (
    <div className={styles.addDriverHolder}>
      <h3>Trucks List</h3>
      <button
        onClick={() => setOpenForm(true)}
        className={styles.addDriverButton}
      >
        Add Truck
      </button>
      <AddTruckForm
        open={openForm}
        onClose={() => setOpenForm(false)}
        editTruckForm={false}
      />
    </div>
  );
};

export default AddTruck;
