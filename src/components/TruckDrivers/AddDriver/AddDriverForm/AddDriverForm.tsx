import {
  useAddNewDriverMutation,
  useEditDriverMutation,
  useLazyCheckDriverEmailQuery,
} from "../../../../app/api/drivers";

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
  firstName: string;
  lastName: string;
  truckDriverEmail: string;
  truckNumber: string;
  phoneNumber: string | number;
}

const driverValidationSchema = Yup.object().shape({
  firstName: Yup.string().required("First name is required"),
  lastName: Yup.string().required("Last name is required"),
  truckDriverEmail: Yup.string()
    .email("Invalid email")
    .required("Email is required"),
  truckNumber: Yup.string().required("Truck number is required"),
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

  const [checkDriverEmail] = useLazyCheckDriverEmailQuery();

  const initialValues: DriverFormValues = {
    firstName: firstName || "",
    lastName: lastName || "",
    truckNumber: truckNumber || "",
    truckDriverEmail: truckDriverEmail || "",
    phoneNumber: phoneNumber || "",
  };

  const checkEmailExistsInDB = async (email: string) => {
    const { exists } = await checkDriverEmail(email).unwrap();
    return exists;
  };

  return (
    <>
      <AddEntityForm
        id={id}
        open={open}
        onClose={onClose}
        initialValues={initialValues}
        validationSchema={driverValidationSchema}
        editEntityForm={editDriverForm}
        addEntity={addNewDriver}
        editEntity={editDriver}
        entityLabel="driver"
        checkEmailExists={checkEmailExistsInDB}
        fieldLabels={{
          firstName: "First name",
          lastName: "Last name",
          truckNumber: "Usual truck number",
          truckDriverEmail: "Email",
          phoneNumber: "Phone",
        }}
      />
    </>
  );
};

export default AddDriverForm;
