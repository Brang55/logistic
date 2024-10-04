import { useState } from "react";

import styles from "./AddTruck.module.css";
import AddCargoForm from "./AddCargoForm/AddCargoForm";

const AddCargo: React.FC = () => {
  const [openForm, setOpenForm] = useState<boolean>(false);

  return (
    <div className={styles.addDriverHolder}>
      <h3>Cargo List</h3>
      <button
        onClick={() => setOpenForm(true)}
        className={styles.addDriverButton}
      >
        Add Truck
      </button>
      <AddCargoForm
        // @ts-expect-error not a final version
        open={openForm}
        onClose={() => setOpenForm(false)}
        editTruckForm={false}
      />
    </div>
  );
};

export default AddCargo;
