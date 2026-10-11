import { Formik, Field, Form, ErrorMessage } from "formik";
import * as Yup from "yup";
import { useState } from "react";

import { Modal } from "../../ui/ui";
import { cx } from "../../ui/helpers";
import ui from "../../ui/ui.module.css";

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
  fieldLabels?: Record<string, string>;
}

const HIDDEN_FIELDS = ["id", "status"];

const humanize = (key: string) => {
  const words = key.replace(/([A-Z])/g, " $1").trim();
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
};

const AddEntityForm = <T extends { values?: object }>({
  id,
  open,
  onClose,
  initialValues,
  validationSchema,
  editEntityForm,
  entityLabel,
  editEntity,
  addEntity,
  checkEmailExists,
  engineVariations,
  truckModels,
  fieldLabels,
}: AddEntityFormProps<T>) => {
  const [formError, setFormError] = useState<string>("");

  if (!open) return null;

  const onSubmit = async (values: T, { setSubmitting }: { setSubmitting: (busy: boolean) => void }) => {
    setFormError("");
    try {
      if (checkEmailExists && "truckDriverEmail" in values && !editEntityForm) {
        const emailExists = await checkEmailExists(values["truckDriverEmail"] as string);
        if (emailExists) {
          setFormError("This email address is already registered.");
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
      setFormError(`Could not save the ${entityLabel}. Please try again.`);
    } finally {
      setSubmitting(false);
    }
  };

  const selectOptions: Record<string, string[] | undefined> = {
    truckModel: truckModels,
    engineVariation: engineVariations,
  };
  const keys = Object.keys(initialValues as object).filter((key) => !HIDDEN_FIELDS.includes(key));
  const formId = `entity-form-${entityLabel}`;

  return (
    <Formik initialValues={initialValues} validationSchema={validationSchema} onSubmit={onSubmit} enableReinitialize>
      {({ isSubmitting }) => (
        <Modal
          title={`${editEntityForm ? "Edit" : "Add"} ${entityLabel}`}
          onClose={onClose}
          footer={
            <>
              <button type="button" className={cx(ui.btn, ui.secondary)} onClick={onClose}>
                Cancel
              </button>
              <button type="submit" form={formId} className={cx(ui.btn, ui.primary)} disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : editEntityForm ? "Save changes" : `Add ${entityLabel}`}
              </button>
            </>
          }
        >
          <Form id={formId} noValidate className={ui.formGrid}>
            {keys.map((key) => {
              const options = selectOptions[key];
              return (
                <div key={key} className={ui.field}>
                  <label htmlFor={key} className={ui.label}>
                    {fieldLabels?.[key] ?? humanize(key)}
                  </label>
                  {options ? (
                    <Field as="select" id={key} name={key} className={ui.input}>
                      <option value="">Select…</option>
                      {options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </Field>
                  ) : (
                    <Field type="text" id={key} name={key} className={ui.input} />
                  )}
                  <ErrorMessage name={key} component="span" className={ui.fieldError} />
                </div>
              );
            })}
            {formError && <div className={cx(ui.alert, ui.alertError, ui.fieldWide)}>{formError}</div>}
          </Form>
        </Modal>
      )}
    </Formik>
  );
};

export default AddEntityForm;
