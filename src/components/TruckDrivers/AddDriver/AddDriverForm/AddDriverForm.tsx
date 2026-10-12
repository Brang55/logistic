import { useState } from "react";
import type Cargo from "../../../../app/api/cargos";
import { useFetchCargosQuery } from "../../../../app/api/cargos";
import {
  useAddNewDriverMutation,
  useEditDriverMutation,
  useFetchDriversQuery,
  useLazyCheckDriverEmailQuery,
} from "../../../../app/api/drivers";
import { useFetchTrucksQuery } from "../../../../app/api/trucks";
import { fullName, seatingEffects, type SeatingEffects } from "../../../../utils/crew";

import * as Yup from "yup";

import AddEntityForm from "../../../Entity/AddEntityForm/AddEntityForm";
import { ConfirmDialog } from "../../../ui/ui";
import { shipmentRef } from "../../../ui/helpers";

interface AddDriverFormProps {
  id?: string;
  open: boolean;
  onClose: () => void;
  firstName?: string;
  lastName?: string;
  truckDriverEmail?: string;
  /** The truck the driver is seated in. */
  truckId?: string | null;
  phoneNumber?: string | number;
  editDriverForm: boolean;
}

interface DriverFormValues {
  firstName: string;
  lastName: string;
  truckDriverEmail: string;
  truckId: string;
  phoneNumber: string | number;
}

const driverValidationSchema = Yup.object().shape({
  firstName: Yup.string().required("First name is required"),
  lastName: Yup.string().required("Last name is required"),
  truckDriverEmail: Yup.string()
    .email("Invalid email")
    .required("Email is required"),
  phoneNumber: Yup.string().required("Phone number is required"),
});

const LoadList = ({ loads }: { loads: Cargo[] }) => (
  <ul style={{ margin: "4px 0 8px", paddingLeft: 18 }}>
    {loads.map((load) => (
      <li key={load.id}>
        {shipmentRef(load.id)} · {load.pickupLocation} → {load.deliveryLocation}
      </li>
    ))}
  </ul>
);

const AddDriverForm: React.FC<AddDriverFormProps> = ({
  id,
  open,
  onClose,
  firstName,
  lastName,
  truckId,
  truckDriverEmail,
  phoneNumber,
  editDriverForm,
}) => {
  const [addNewDriver] = useAddNewDriverMutation();

  const [editDriver] = useEditDriverMutation();

  const [checkDriverEmail] = useLazyCheckDriverEmailQuery();

  const { data: trucks = [] } = useFetchTrucksQuery();
  const { data: drivers = [] } = useFetchDriversQuery();
  const { data: cargos = [] } = useFetchCargosQuery();

  // Seating the driver in another truck moves loads; the dispatcher confirms that first.
  const [confirming, setConfirming] = useState<{
    name: string;
    truckId: string;
    effects: SeatingEffects;
    resolve: (confirmed: boolean) => void;
  }>();

  const initialValues: DriverFormValues = {
    firstName: firstName || "",
    lastName: lastName || "",
    truckId: truckId || "",
    truckDriverEmail: truckDriverEmail || "",
    phoneNumber: phoneNumber || "",
  };

  const checkEmailExistsInDB = async (email: string) => {
    const { exists } = await checkDriverEmail(email).unwrap();
    return exists;
  };

  const driverNames = new Map(drivers.map((driver) => [driver.id, fullName(driver)]));
  const truckNumber = (truckId: string | null | undefined) => trucks.find((truck) => truck.id === truckId)?.truckNumber;
  const truckOptions = [
    { value: "", label: "No truck" },
    ...trucks.map((truck) => ({
      value: truck.id,
      label: `${truck.truckNumber} · ${
        !truck.driverId ? "no driver" : truck.driverId === id ? "current truck" : `driven by ${driverNames.get(truck.driverId)}`
      }`,
    })),
  ];

  const confirmSeating = (values: DriverFormValues) => {
    const effects = seatingEffects(id ? { id, truckId: truckId ?? null } : undefined, values.truckId, trucks, cargos);
    if (!effects.gained.length && !effects.left.length && !effects.replacedDriverId) return Promise.resolve(true);
    return new Promise<boolean>((resolve) =>
      setConfirming({ name: fullName(values), truckId: values.truckId, effects, resolve })
    );
  };

  const answer = (confirmed: boolean) => {
    confirming?.resolve(confirmed);
    setConfirming(undefined);
  };

  const fromTruck = truckNumber(truckId);
  const toTruck = confirming && truckNumber(confirming.truckId);

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
        selects={{ truckId: truckOptions }}
        confirmSave={confirmSeating}
        fieldLabels={{
          firstName: "First name",
          lastName: "Last name",
          truckId: "Truck",
          truckDriverEmail: "Email",
          phoneNumber: "Phone",
        }}
      />
      {confirming && (
        <ConfirmDialog
          title={toTruck ? `Seat ${confirming.name} in ${toTruck}?` : `Take ${confirming.name} out of ${fromTruck}?`}
          confirmLabel={toTruck ? "Seat driver" : "Take out of truck"}
          onConfirm={() => answer(true)}
          onCancel={() => answer(false)}
          message={
            <>
              {confirming.effects.replacedDriverId && (
                <p style={{ margin: "0 0 8px" }}>
                  {driverNames.get(confirming.effects.replacedDriverId)} drives {toTruck} now and will be left without a
                  truck.
                </p>
              )}
              {confirming.effects.gained.length > 0 && (
                <>
                  <p style={{ margin: 0 }}>
                    {toTruck}'s unfinished loads move to {confirming.name}:
                  </p>
                  <LoadList loads={confirming.effects.gained} />
                </>
              )}
              {confirming.effects.left.length > 0 && (
                <>
                  <p style={{ margin: 0 }}>
                    These loads stay on {fromTruck} and will have no driver until another one is seated in it:
                  </p>
                  <LoadList loads={confirming.effects.left} />
                </>
              )}
            </>
          }
        />
      )}
    </>
  );
};

export default AddDriverForm;
