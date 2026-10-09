import { Navigate, Outlet } from "react-router-dom";
import type { UserRole } from "../../../app/features/driver/authSlice";
import { homeFor } from "../../../app/roles";
import { useAuth } from "../../../hooks/useAuth";
import { Loader } from "../../Loader/Loader";

const PrivateRoute = ({ roles }: { roles?: UserRole[] }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <Loader />; // Show a loading spinner or placeholder while checking auth state
  }

  if (!user) {
    return <Navigate to="/login" replace />; // Redirect to login if the user is not authenticated
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={homeFor(user.role)} replace />;
  }

  return <Outlet />; // Render the component tree for the protected route
};

export default PrivateRoute;
