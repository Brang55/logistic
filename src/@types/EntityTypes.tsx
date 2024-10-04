import * as Yup from "yup";

export default interface AddEntityFormProps<T> {
  id?: string;
  open: boolean;
  onClose: () => void;
  initialValues: T;
  validationSchema: Yup.ObjectSchema;
  editEntityForm: boolean;
  collectionName: string;
  entityLabel: string;
  editEntity: (values: object) => void;
  addEntity: (values: object) => void;
  checkEmailExists?: boolean; // Optional flag to check if email exists
}
