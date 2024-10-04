import { Formik, Form, Field, ErrorMessage } from "formik";
import * as Yup from "yup";
import { useLoginUserMutation } from "../../../app/features/driver/authSlice";

import { useAuth } from "../../../hooks/useAuth";

import styles from "./Login.module.css";
import { useNavigate } from "react-router-dom";

const Login: React.FC = () => {
  const [loginUser, { isLoading, isError }] = useLoginUserMutation();
  const navigate = useNavigate();

  const { user } = useAuth();

  console.log(user);

  return (
    <div className={styles.loginContainer}>
      <Formik
        initialValues={{ email: "", password: "" }}
        validationSchema={Yup.object({
          email: Yup.string()
            .email("Invalid email address")
            .required("Required"),
          password: Yup.string()
            .min(6, "Must be 6 characters or more")
            .required("Required"),
        })}
        onSubmit={async (values) => {
          try {
            // Wait for the loginUser mutation to complete
            const result = await loginUser(values).unwrap();

            // If the login is successful, navigate to the home page
            if (result) {
              navigate("/");
            }
          } catch (loginError) {
            console.error("Login failed:", loginError);
            // Optionally handle login errors here
          }
        }}
      >
        <Form className={styles.loginForm}>
          <h2>Login</h2>
          <div className={styles.loginFormRow}>
            <label htmlFor="email">Email</label>
            <Field name="email" type="email" />
            <ErrorMessage
              name="email"
              component="div"
              className={styles.error}
            />
          </div>
          <div className={styles.loginFormRow}>
            <label htmlFor="password">Password</label>
            <Field name="password" type="password" />
            <ErrorMessage
              name="password"
              component="div"
              className={styles.error}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className={styles.submitLogin}
          >
            {isLoading ? "Logging in..." : "Login"}
          </button>
          {isError && <div>There is an error</div>}
        </Form>
      </Formik>
    </div>
  );
};

export default Login;
