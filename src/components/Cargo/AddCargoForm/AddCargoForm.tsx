import styles from "./AddCargoForm.module.css";
import { Formik, Form, Field, ErrorMessage, FormikHelpers } from "formik";
import * as Yup from "yup";
import { formFields, FormField } from "../FormFields/FormFields";

import { Loader } from "../../Loader/Loader";
import { useNavigate } from "react-router-dom";

import {
  useLoadCargoQuery,
  useEditCargoMutation,
  useAddNewCargoMutation,
} from "../../../app/features/driver/cargoSlice";

import {
  useFetchAvailableDriversQuery,
  useLoadDriverQuery,
} from "../../../app/features/driver/driverSlice";
import {
  useFetchAvailableTrailersQuery,
  useLoadTrailerQuery,
} from "../../../app/features/driver/trailerSlice";
import {
  useFetchTrucksQuery,
  useFetchAvailableTrucksQuery,
  useLoadTruckQuery,
} from "../../../app/features/driver/truckSlice";

import { useParams } from "react-router-dom";

import { useState } from "react";
import { BackButton } from "../../Back/BackButton";

interface CargoFormValues {
  shipperName: string;
  shipperAddress: string;
  contactPerson: string;
  phoneNumber: string;
  emailAddress: string;
  receiverName: string;
  receiverAddress: string;
  receiverContact: string;
  receiverPhone: string;
  receiverEmail: string;
  descriptionOfGoods: string;
  quantity: string;
  weight: string;
  dimensions: string;
  pickupDate: string;
  deliveryDate: string;
  pickupLocation: string;
  deliveryLocation: string;
  truckType: string;
  serviceType: string;
  temperatureControl: string;
  hazardousMaterial: string;
  specialHandlingInstructions: string;
  freightCost: string;
  paymentTerms: string;
  notes: string;
  driverId?: string;
  truckId?: string;
  trailerId?: string;
}

const generateValidationSchema = (fields: FormField[]) => {
  const schema: {
    [key: string]: Yup.StringSchema | Yup.NumberSchema | Yup.MixedSchema;
  } = {};
  fields.forEach((field) => {
    if (field.required) {
      schema[field.name] = Yup.string().required("Required");
    }
  });
  return Yup.object().shape(schema);
};

const AddCargoForm = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    data: cargo,
    isError,
    isLoading,
  } = useLoadCargoQuery(id!, { skip: !id });

  const cargoDriverId = cargo?.driverId;
  const cargoTrailerId = cargo?.trailerId;
  const cargoTruckId = cargo?.truckId;

  const { data: availableDrivers, refetch: refetchAvailableDrivers } =
    useFetchAvailableDriversQuery();

  const { data: availableTrucks, refetch: refetchAvailableTrucks } =
    useFetchAvailableTrucksQuery();

  const { data: availableTrailers, refetch: refetchAvailableTrailers } =
    useFetchAvailableTrailersQuery();
  // @ts-expect-error not a final version
  const { data: driver } = useLoadDriverQuery(cargoDriverId);
  // @ts-expect-error not a final version
  const { data: truck } = useLoadTruckQuery(cargoTruckId);
  // @ts-expect-error not a final version
  const { data: trailer } = useLoadTrailerQuery(cargoTrailerId);

  const { data: trucks } = useFetchTrucksQuery();

  console.log(trailer?.trailerNumber);

  const [addCargo] = useAddNewCargoMutation();

  const [editCargo] = useEditCargoMutation();

  const [cargoExist, setCargoExist] = useState<string>("");

  const initialValues = {
    shipperName: cargo ? cargo.shipperName : "",
    shipperAddress: cargo ? cargo.shipperAddress : "",
    contactPerson: cargo ? cargo.contactPerson : "",
    phoneNumber: cargo ? cargo.phoneNumber : "",
    emailAddress: cargo ? cargo.emailAddress : "",
    receiverName: cargo ? cargo.receiverName : "",
    receiverAddress: cargo ? cargo.receiverAddress : "",
    receiverContact: cargo ? cargo.receiverContact : "",
    receiverPhone: cargo ? cargo.receiverPhone : "",
    receiverEmail: cargo ? cargo.receiverEmail : "",
    descriptionOfGoods: cargo ? cargo.descriptionOfGoods : "",
    quantity: cargo ? cargo.quantity : "",
    weight: cargo ? cargo.weight : "",
    dimensions: cargo ? cargo.dimensions : "",
    pickupDate: cargo ? cargo.pickupDate : "",
    deliveryDate: cargo ? cargo.deliveryDate : "",
    pickupLocation: cargo ? cargo.pickupLocation : "",
    deliveryLocation: cargo ? cargo.deliveryLocation : "",
    truckType: cargo ? cargo.truckType : "",
    serviceType: cargo ? cargo.serviceType : "",
    temperatureControl: cargo ? cargo.temperatureControl : "",
    hazardousMaterial: cargo ? cargo.hazardousMaterial : "",
    specialHandlingInstructions: cargo ? cargo.specialHandlingInstructions : "",
    freightCost: cargo ? cargo.freightCost : "",
    paymentTerms: cargo ? cargo.paymentTerms : "",
    notes: cargo ? cargo.notes : "",
    driverId: cargo ? cargo.driverId : "",
    truckId: cargo ? cargo.truckId : "",
    trailerId: cargo ? cargo.trailerId : "",
    // Add default initial values for other fields here
  };

  const validationSchema = generateValidationSchema(formFields);

  const handleSubmit = async (
    values: CargoFormValues,
    { setSubmitting, resetForm }: FormikHelpers<CargoFormValues>
  ) => {
    setSubmitting(true);
    try {
      if (id) {
        // @ts-expect-error not a final version
        await editCargo({ id, ...values });
        await refetchAvailableDrivers();
        await refetchAvailableTrailers();
        await refetchAvailableTrucks();
        navigate(-1);
      } else {
        // @ts-expect-error not a final version
        await addCargo(values);
        resetForm();
      }
    } catch (error) {
      console.error("Error submitting the form", error);
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return <Loader />;
  }

  if (isError) {
    return <h1>There is an error</h1>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.cargoOptions}>
        <span className={styles.cargoName}>
          {id ? "Edit Cargo" : "Add Cargo"}
        </span>
        <span className={styles.backContainer}>
          {id ? <BackButton /> : null}
        </span>
      </div>
      <Formik<CargoFormValues>
        initialValues={initialValues}
        validationSchema={validationSchema}
        onSubmit={handleSubmit}
        enableReinitialize
      >
        {({ isSubmitting }) => (
          <>
            {isSubmitting && <Loader />}
            <Form>
              {formFields.map((field) => (
                <div className={styles.formGroup} key={field.name}>
                  <label htmlFor={field.name}>{field.label}</label>
                  {field.type === "select" ? (
                    <Field
                      as="select"
                      name={field.name}
                      className="form-control"
                    >
                      <option value="">Select...</option>
                      {field.options &&
                        field.options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                    </Field>
                  ) : field.type === "textarea" ? (
                    <Field
                      as="textarea"
                      name={field.name}
                      className="form-control"
                    />
                  ) : field.type === "file" ? (
                    <Field
                      type="file"
                      name={field.name}
                      className="form-control"
                    />
                  ) : (
                    <Field
                      type={field.type}
                      name={field.name}
                      className="form-control"
                    />
                  )}

                  <ErrorMessage
                    name={field.name}
                    component="span"
                    className={styles.errorMsg}
                  />
                </div>
              ))}
              {id && (
                <>
                  <div className={styles.formGroupContainer}>
                    <h2>Configure Cargo</h2>
                    <div className={styles.formGroupConfigure}>
                      <label htmlFor="driverId">Driver</label>
                      <Field
                        as="select"
                        name="driverId"
                        className="form-control"
                      >
                        <option value="">
                          {cargo?.driverId
                            ? `${driver?.firstName} ${driver?.lastName}`
                            : "Select Driver..."}
                        </option>
                        {availableDrivers?.map((driver) => (
                          <option key={driver.id} value={driver.id}>
                            {driver.firstName} {driver.lastName}
                          </option>
                        ))}
                      </Field>
                      <ErrorMessage
                        name="driverId"
                        component="span"
                        className={styles.errorMsg}
                      />
                    </div>

                    <div className={styles.formGroupConfigure}>
                      <label htmlFor="truckId">Truck</label>
                      <Field
                        as="select"
                        name="truckId"
                        className="form-control"
                      >
                        <option value="">
                          {cargo?.truckId
                            ? truck?.truckModel
                            : "Select Driver..."}
                        </option>
                        {availableTrucks?.map((truck) => (
                          <option key={truck.id} value={truck.id}>
                            {truck.truckModel}
                          </option>
                        ))}
                      </Field>
                      <ErrorMessage
                        name="truckId"
                        component="span"
                        className={styles.errorMsg}
                      />
                    </div>

                    <div className={styles.formGroupConfigure}>
                      <label htmlFor="trailerId">Trailer</label>
                      <Field
                        as="select"
                        name="trailerId"
                        className="form-control"
                      >
                        <option value="">
                          {cargo?.trailerId
                            ? trailer?.trailerNumber
                            : "Select Trailer..."}
                        </option>
                        {availableTrailers?.map((trailer) => (
                          <option key={trailer.id} value={trailer.id}>
                            {trailer.trailerNumber}
                          </option>
                        ))}
                      </Field>
                      <ErrorMessage
                        name="trailerId"
                        component="span"
                        className={styles.errorMsg}
                      />
                    </div>
                  </div>
                </>
              )}
              {cargoExist && <div className={styles.error}>{cargoExist}</div>}
              <button
                type="submit"
                className={styles.cargoSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? "Submitting..."
                  : id
                  ? "Update Cargo"
                  : "Add Cargo"}
              </button>
            </Form>
          </>
        )}
      </Formik>
    </div>
  );
};

export default AddCargoForm;
