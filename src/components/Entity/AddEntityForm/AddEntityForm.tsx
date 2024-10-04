import styles from "./AddEntityForm.module.css";
import { Formik, Field, Form, ErrorMessage } from "formik";
import * as Yup from "yup";

import { useState } from "react";
import { Loader } from "../../Loader/Loader";
import { Backdrop } from "../../Backdrop/Backdrop";

interface AddEntityFormProps<T> {
  id?: string;
  open: boolean;
  onClose: () => void;
  initialValues: T;
  // @ts-expect-error not a final version
  validationSchema: Yup.ObjectSchema;
  editEntityForm: boolean;
  collectionName: string;
  entityLabel: string;
  editEntity: (values: T) => void;
  addEntity: (values: T) => void;
  truckDriverEmail?: string;
  checkEmailExists?: (email: string) => Promise<boolean>;
  engineVariations?: string[];
  truckModels?: string[];
}

const AddEntityForm = <T extends { values?: object }>({
  id,
  open,
  onClose,
  initialValues,
  validationSchema,
  editEntityForm,
  //   collectionName,
  entityLabel,
  editEntity,
  addEntity,
  checkEmailExists,
  engineVariations,
  truckModels,
}: AddEntityFormProps<T>) => {
  const [isLoading, setIsLoading] = useState(false);
  const [emailExistsMessage, setEmailExistsMessage] = useState<string>("");

  if (!open) return null;

  const onSubmit = async (values: T) => {
    setIsLoading(true);

    try {
      if (checkEmailExists && "truckDriverEmail" in values && !editEntityForm) {
        const emailExists = await checkEmailExists(
          values["truckDriverEmail"] as string
        );
        if (emailExists) {
          setEmailExistsMessage("Email address is already registered");
          return;
        }
      }

      if (editEntityForm && id) {
        await editEntity({ ...values, id });
      } else {
        await addEntity(values);
      }
      onClose();
    } catch (err) {
      console.error(`Failed to save the ${entityLabel}:`, err);
      setEmailExistsMessage(
        `Failed to save the ${entityLabel}. Please try again.`
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Backdrop show={open} onClick={onClose} />
      <Formik
        initialValues={initialValues}
        validationSchema={validationSchema}
        onSubmit={onSubmit}
        enableReinitialize
      >
        {() => (
          <Form className={styles.addEntityForm} noValidate>
            <button onClick={onClose} className={styles.closeForm}>
              X
            </button>
            {Object.keys(initialValues)
              .filter((key) => key !== "id")
              .filter((status) => status !== "status")
              .map((key) => (
                <div key={key} className={styles.addEntityFormRow}>
                  <label htmlFor={key}>
                    {key.charAt(0).toUpperCase() + key.slice(1)}:
                  </label>
                  {key === "truckModel" && truckModels ? (
                    <Field
                      as="select"
                      className={styles.options}
                      id={key}
                      name={key}
                    >
                      <option value="">Select a model</option>
                      {truckModels.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </Field>
                  ) : key === "engineVariation" && engineVariations ? (
                    <Field
                      as="select"
                      className={styles.options}
                      id={key}
                      name={key}
                    >
                      <option value="">Select an engine variation</option>
                      {engineVariations.map((variation) => (
                        <option key={variation} value={variation}>
                          {variation}
                        </option>
                      ))}
                    </Field>
                  ) : (
                    <Field type="text" id={key} name={key} />
                  )}
                  <ErrorMessage
                    name={key}
                    component="div"
                    className={styles.error}
                  />
                </div>
              ))}
            {emailExistsMessage && (
              <div className={styles.error}>{emailExistsMessage}</div>
            )}
            <button type="submit" className={styles.submitEntity}>
              {editEntityForm ? "Apply" : "Add"}
            </button>
          </Form>
        )}
      </Formik>
      {isLoading && <Loader />}
    </>
  );
};

export default AddEntityForm;
