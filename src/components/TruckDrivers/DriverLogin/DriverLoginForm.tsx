import { useState } from "react";
import { useCreateDriverAccountMutation } from "../../../app/api/trips";
import { Modal } from "../../ui/ui";
import { cx } from "../../ui/helpers";
import ui from "../../ui/ui.module.css";

interface DriverLoginFormProps {
  driverId: string;
  email: string;
  onClose: () => void;
}

const MIN_LENGTH = 8;

/** Creates the driver's app login (their email + a password the dispatcher hands over). */
const DriverLoginForm = ({ driverId, email, onClose }: DriverLoginFormProps) => {
  const [password, setPassword] = useState("");
  const [createAccount, { isLoading, error, isSuccess }] = useCreateDriverAccountMutation();
  const message = (error as { data?: { message?: string } } | undefined)?.data?.message;
  const formId = "driver-login-form";

  return (
    <Modal
      small
      title="Driver app login"
      onClose={onClose}
      footer={
        isSuccess ? (
          <button className={cx(ui.btn, ui.primary)} onClick={onClose}>
            Done
          </button>
        ) : (
          <>
            <button className={cx(ui.btn, ui.secondary)} onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              form={formId}
              className={cx(ui.btn, ui.primary)}
              disabled={isLoading || password.length < MIN_LENGTH}
            >
              {isLoading ? "Creating..." : "Create login"}
            </button>
          </>
        )
      }
    >
      {isSuccess ? (
        <div className={cx(ui.alert, ui.alertSuccess)}>
          Login created. The driver signs in with {email} and the password you set.
        </div>
      ) : (
        <form
          id={formId}
          className={ui.formGrid}
          onSubmit={(event) => {
            event.preventDefault();
            if (password.length >= MIN_LENGTH) createAccount({ driverId, password });
          }}
        >
          <div className={cx(ui.field, ui.fieldWide)}>
            <label htmlFor="driver-email" className={ui.label}>
              Email
            </label>
            <input id="driver-email" className={ui.input} value={email} readOnly />
          </div>
          <div className={cx(ui.field, ui.fieldWide)}>
            <label htmlFor="driver-password" className={ui.label}>
              Password
            </label>
            <input
              id="driver-password"
              className={ui.input}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <span className={ui.secondaryText}>At least {MIN_LENGTH} characters. Share it with the driver securely.</span>
          </div>
          {error && <div className={cx(ui.alert, ui.alertError, ui.fieldWide)}>{message ?? "Could not create the login."}</div>}
        </form>
      )}
    </Modal>
  );
};

export default DriverLoginForm;
