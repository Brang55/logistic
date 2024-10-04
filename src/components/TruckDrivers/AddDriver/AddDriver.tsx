import { useState } from "react";
import styles from "./AddDriver.module.css";
import AddDriverForm from "./AddDriverForm/AddDriverForm";

const AddDriver: React.FC = () => {
  const [openForm, setOpenForm] = useState<boolean>(false);

  return (
    <div className={styles.addDriverHolder}>
      <h3>Truck Drivers List</h3>
      <button
        onClick={() => setOpenForm(true)}
        className={styles.addDriverButton}
      >
        Add User
      </button>
      <AddDriverForm
        open={openForm}
        onClose={() => setOpenForm(false)}
        editDriverForm={false}
      />
    </div>
  );
};

export default AddDriver;
