import {
  useAddNewDriverMutation,
  useEditDriverMutation,
} from "../../../../app/features/driver/driverSlice";

import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../../../config/firebase";
import * as Yup from "yup";

import AddEntityForm from "../../../Entity/AddEntityForm/AddEntityForm";

interface AddDriverFormProps {
  id?: string;
  open: boolean;
  onClose: () => void;
  firstName?: string;
  lastName?: string;
  truckDriverEmail?: string;
  truckNumber?: string;
  phoneNumber?: string | number;
  editDriverForm: boolean;
}

interface DriverFormValues {
  id?: string;
  firstName: string;
  lastName: string;
  truckDriverEmail: string;
  truckNumber: string;
  phoneNumber: string | number;
}

const driverValidationSchema = Yup.object().shape({
  firstName: Yup.string().required("First Name is required"),
  lastName: Yup.string().required("Last Name is required"),
  truckDriverEmail: Yup.string()
    .email("Invalid email")
    .required("Email is required"),
  truckNumber: Yup.string().required("Truck Number is required"),
  phoneNumber: Yup.string().required("Phone number is required"),
});

const AddDriverForm: React.FC<AddDriverFormProps> = ({
  id,
  open,
  onClose,
  firstName,
  lastName,
  truckNumber,
  truckDriverEmail,
  phoneNumber,
  editDriverForm,
}) => {
  const [addNewDriver] = useAddNewDriverMutation();

  const [editDriver] = useEditDriverMutation();

  const initialValues: DriverFormValues = {
    id: id || "",
    firstName: firstName || "",
    lastName: lastName || "",
    truckNumber: truckNumber || "",
    truckDriverEmail: truckDriverEmail || "",
    phoneNumber: phoneNumber || "",
  };

  const checkEmailExistsInDB = async (email: string) => {
    const q = query(
      collection(db, "drivers"),
      where("truckDriverEmail", "==", email)
    );
    const querySnapshot = await getDocs(q);
    return !querySnapshot.empty;
  };

  return (
    <>
      <AddEntityForm
        id={id}
        open={open}
        onClose={onClose}
        // @ts-expect-error not a final version
        initialValues={initialValues}
        validationSchema={driverValidationSchema}
        editEntityForm={editDriverForm}
        // @ts-expect-error not a final version
        addEntity={addNewDriver}
        // @ts-expect-error not a final version
        editEntity={editDriver}
        entityLabel="driver"
        checkEmailExists={checkEmailExistsInDB}
      />
    </>
  );
};

export default AddDriverForm;
