import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../../hooks/useAuth";
import { Loader } from "../../Loader/Loader";

const PrivateRoute = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return <Loader />; // Show a loading spinner or placeholder while checking auth state
  }

  if (!user) {
    return <Navigate to="/login" replace />; // Redirect to login if the user is not authenticated
  }

  return <Outlet />; // Render the component tree for the protected route
};

export default PrivateRoute;
