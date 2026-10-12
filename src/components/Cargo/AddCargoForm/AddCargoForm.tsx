import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { skipToken } from "@reduxjs/toolkit/query/react";
import { Formik, Form, Field, ErrorMessage, FormikHelpers } from "formik";
import * as Yup from "yup";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faCircleCheck, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";

import { formFields, FormField } from "../FormFields/FormFields";
import { Loader } from "../../Loader/Loader";
import {
  useAddNewCargoMutation,
  useEditCargoMutation,
  useLoadCargoQuery,
} from "../../../app/api/cargos";
import { useFetchTrucksQuery } from "../../../app/api/trucks";
import { crewOf } from "../../../utils/crew";
import CrewPicker from "../../Dispatcher/CrewPicker";
import { EmptyState, PageHeader } from "../../ui/ui";
import { cx, shipmentRef } from "../../ui/helpers";
import ui from "../../ui/ui.module.css";
import styles from "./AddCargoForm.module.css";
import { kgToLb, lbToKg } from "../../../utils/units";
import { errorMessage } from "../../../utils/errors";

// Weight is entered in pounds and stored as kg text; free text from older loads is kept as is.
const weightInPounds = (kg?: string | null) =>
  kg && Number.isFinite(Number(kg)) ? String(Math.round(kgToLb(Number(kg)))) : (kg ?? "");
const weightInKg = (pounds: string) =>
  pounds.trim() !== "" && Number.isFinite(Number(pounds)) ? String(Math.round(lbToKg(Number(pounds)) * 10) / 10) : pounds;

type CargoFormValues = Record<string, string>;

const SECTIONS: { title: string; description: string; fields: string[] }[] = [
  {
    title: "Shipper",
    description: "The company handing over the goods.",
    fields: ["shipperName", "shipperAddress", "contactPerson", "phoneNumber", "emailAddress"],
  },
  {
    title: "Receiver",
    description: "The company taking delivery.",
    fields: ["receiverName", "receiverAddress", "receiverContact", "receiverPhone", "receiverEmail"],
  },
  {
    title: "Goods",
    description: "What is being moved and how it must be handled.",
    fields: [
      "descriptionOfGoods",
      "quantity",
      "weight",
      "dimensions",
      "temperatureControl",
      "hazardousMaterial",
      "specialHandlingInstructions",
    ],
  },
  {
    title: "Route and schedule",
    description: "Addresses are placed on the map automatically.",
    fields: ["pickupLocation", "pickupDate", "deliveryLocation", "deliveryDate"],
  },
  {
    title: "Service and payment",
    description: "",
    fields: ["truckType", "serviceType", "freightCost", "paymentTerms", "notes"],
  },
];

const fieldsByName = new Map(formFields.map((field) => [field.name, field]));

const validationSchema = Yup.object().shape(
  Object.fromEntries(
    formFields.filter((field) => field.required).map((field) => [field.name, Yup.string().required("Required")])
  )
);

const FormInput = ({ field }: { field: FormField }) => {
  const wide = field.type === "textarea";
  return (
    <div className={cx(ui.field, wide && ui.fieldWide)}>
      <label htmlFor={field.name} className={ui.label}>
        {field.label}
        {field.required && <span className={ui.required}>*</span>}
      </label>
      {field.type === "select" ? (
        <Field as="select" id={field.name} name={field.name} className={ui.input}>
          <option value="">Select…</option>
          {field.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Field>
      ) : field.type === "textarea" ? (
        <Field as="textarea" id={field.name} name={field.name} className={ui.input} />
      ) : (
        <Field type={field.type} id={field.name} name={field.name} className={ui.input} />
      )}
      <ErrorMessage name={field.name} component="span" className={ui.fieldError} />
    </div>
  );
};

const AddCargoForm = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: cargo, isError, isLoading } = useLoadCargoQuery(id ?? skipToken);

  const { data: trucks = [] } = useFetchTrucksQuery();

  const [addCargo] = useAddNewCargoMutation();
  const [editCargo] = useEditCargoMutation();
  const [saved, setSaved] = useState<string>();
  const [saveError, setSaveError] = useState<string>();

  if (id && isLoading) return <Loader />;
  if (id && (isError || !cargo)) {
    return <EmptyState icon={faTriangleExclamation} title="Cargo not found" text="It may have been deleted." />;
  }

  const initialValues: CargoFormValues = Object.fromEntries([
    ...formFields.map((field) => [field.name, String((cargo as Record<string, unknown> | undefined)?.[field.name] ?? "")]),
    ["weight", weightInPounds(cargo?.weight)],
    // driverId stays "" for the truck's own driver; the API fills it in.
    ...Object.entries(crewOf(cargo, trucks)),
  ]);

  const handleSubmit = async (values: CargoFormValues, { resetForm }: FormikHelpers<CargoFormValues>) => {
    setSaveError(undefined);
    try {
      if (id) {
        await editCargo({ id, ...values, weight: weightInKg(values.weight) }).unwrap();
        navigate(`/cargoList/${id}/preview`);
      } else {
        const created = await addCargo({ ...values, weight: weightInKg(values.weight) }).unwrap();
        setSaved(created.id);
        resetForm();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (error) {
      setSaveError(errorMessage(error, "Could not save the cargo. Please try again."));
    }
  };

  return (
    <>
      {id && (
        <div className={styles.top}>
          <button className={cx(ui.btn, ui.secondary, ui.small)} onClick={() => navigate(-1)}>
            <FontAwesomeIcon icon={faArrowLeft} /> Back
          </button>
        </div>
      )}
      <PageHeader
        title={id ? "Edit cargo" : "Add cargo"}
        subtitle={
          id
            ? `${shipmentRef(id)} · changes to a planned load send it back for confirmation`
            : "Fields marked * are required. New loads appear in Dispatch, ready for a truck."
        }
      />

      {saved && (
        <div className={cx(ui.alert, ui.alertSuccess, styles.banner)}>
          <FontAwesomeIcon icon={faCircleCheck} />
          <span>
            Cargo {shipmentRef(saved)} added. <Link to={`/cargoList/${saved}/preview`}>View it</Link> or{" "}
            <Link to="/dispatcher">assign a truck in Dispatch</Link>.
          </span>
        </div>
      )}

      <Formik<CargoFormValues>
        initialValues={initialValues}
        validationSchema={validationSchema}
        onSubmit={handleSubmit}
        enableReinitialize
      >
        {({ isSubmitting, submitCount, isValid, values, setValues }) => (
          <Form noValidate className={styles.form}>
            {SECTIONS.map((section) => (
              <section key={section.title} className={cx(ui.card, styles.section)}>
                <div className={styles.sectionIntro}>
                  <h2 className={ui.cardTitle}>{section.title}</h2>
                  {section.description && <p className={ui.secondaryText}>{section.description}</p>}
                </div>
                <div className={ui.formGrid}>
                  {section.fields.map((name) => {
                    const field = fieldsByName.get(name);
                    return field ? <FormInput key={name} field={field} /> : null;
                  })}
                </div>
              </section>
            ))}

            {id && (
              <section className={cx(ui.card, styles.section)}>
                <div className={styles.sectionIntro}>
                  <h2 className={ui.cardTitle}>Assignment</h2>
                  <p className={ui.secondaryText}>The truck brings its driver and hooked trailer.</p>
                </div>
                <div className={ui.formGrid}>
                  <CrewPicker
                    value={{ truckId: values.truckId, driverId: values.driverId, trailerId: values.trailerId }}
                    onChange={(crew) => setValues({ ...values, ...crew })}
                    current={cargo}
                    idPrefix="cargo"
                  />
                </div>
              </section>
            )}

            <div className={styles.actionBar}>
              <span className={ui.secondaryText}>
                {saveError ? (
                  <span className={ui.fieldError}>{saveError}</span>
                ) : submitCount > 0 && !isValid ? (
                  <span className={ui.fieldError}>Some required fields are missing.</span>
                ) : null}
              </span>
              <div className={ui.actions}>
                <button type="button" className={cx(ui.btn, ui.secondary)} onClick={() => (id ? navigate(-1) : navigate("/cargoList"))}>
                  Cancel
                </button>
                <button type="submit" className={cx(ui.btn, ui.primary)} disabled={isSubmitting}>
                  {isSubmitting ? "Saving..." : id ? "Save changes" : "Add cargo"}
                </button>
              </div>
            </div>
          </Form>
        )}
      </Formik>
    </>
  );
};

export default AddCargoForm;
