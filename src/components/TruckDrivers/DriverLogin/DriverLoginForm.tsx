import { useState } from "react";
import { useCreateDriverAccountMutation } from "../../../app/features/driver/tripsSlice";
import { Backdrop } from "../../Backdrop/Backdrop";
import formStyles from "../../Entity/AddEntityForm/AddEntityForm.module.css";

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

  return (
    <>
      <Backdrop show onClick={onClose} />
      <form
        className={formStyles.addEntityForm}
        onSubmit={(event) => {
          event.preventDefault();
          if (password.length >= MIN_LENGTH) createAccount({ driverId, password });
        }}
      >
        <button type="button" onClick={onClose} className={formStyles.closeForm}>
          X
        </button>
        <h3>Driver app login</h3>
        {isSuccess ? (
          <p>
            Login created. The driver signs in with <strong>{email}</strong> and the password you set.
          </p>
        ) : (
          <>
            <div className={formStyles.addEntityFormRow}>
              <label htmlFor="driver-email">Email:</label>
              <input id="driver-email" value={email} readOnly />
            </div>
            <div className={formStyles.addEntityFormRow}>
              <label htmlFor="driver-password">Password:</label>
              <input
                id="driver-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {password && password.length < MIN_LENGTH && (
                <div className={formStyles.error}>At least {MIN_LENGTH} characters</div>
              )}
            </div>
            {error && <div className={formStyles.error}>{message ?? "Could not create the login."}</div>}
            <button type="submit" className={formStyles.submitEntity} disabled={isLoading}>
              {isLoading ? "Creating..." : "Create login"}
            </button>
          </>
        )}
      </form>
    </>
  );
};

export default DriverLoginForm;
