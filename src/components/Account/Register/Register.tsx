// import { Formik, Form, Field, ErrorMessage } from "formik";
// import * as Yup from "yup";
// import { useRegisterUserMutation } from "../../../app/features/driver/authSlice";

// const Register: React.FC = () => {
//   const [registerUser, { isLoading, error }] = useRegisterUserMutation();

//   return (
//     <div>
//       <h2>Register</h2>
//       <Formik
//         initialValues={{ email: "", password: "" }}
//         validationSchema={Yup.object({
//           email: Yup.string()
//             .email("Invalid email address")
//             .required("Required"),
//           password: Yup.string()
//             .min(6, "Must be 6 characters or more")
//             .required("Required"),
//         })}
//         onSubmit={(values) => {
//           registerUser(values);
//         }}
//       >
//         <Form>
//           <label htmlFor="email">Email</label>
//           <Field name="email" type="email" />
//           <ErrorMessage name="email" component="div" />

//           <label htmlFor="password">Password</label>
//           <Field name="password" type="password" />
//           <ErrorMessage name="password" component="div" />

//           <button type="submit" disabled={isLoading}>
//             {isLoading ? "Registering..." : "Register"}
//           </button>
//           {error && <div>{(error as any).data}</div>}
//         </Form>
//       </Formik>
//     </div>
//   );
// };

// export default Register;
