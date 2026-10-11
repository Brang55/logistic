import { lazy, ReactNode, Suspense } from "react";
import { Route, Routes } from "react-router-dom";

import "./assets/css/styles.css";
import Navigation from "./components/Navigation/Navigation";
import Login from "./components/Account/Login/Login";
import PrivateRoute from "./components/Account/PrivateRoute/PrivateRoute";
import { Loader } from "./components/Loader/Loader";
import { STAFF } from "./app/roles";

// Pages load on demand, so map-heavy screens (and mapbox-gl) don't weigh down every other page.
const Dashboard = lazy(() => import("./components/Dashboard/Dashboard"));
const Dispatcher = lazy(() => import("./components/Dispatcher/Dispatcher"));
const LiveFleet = lazy(() => import("./components/Fleet/LiveFleet"));
const OngoingDelivery = lazy(() => import("./components/OngoingDelivery/OngoingDelivery"));
const TruckDriversList = lazy(() => import("./components/TruckDrivers/TruckDriversList/TruckDriversList"));
const TrucksList = lazy(() => import("./components/Trucks/TrucksList/TrucksList"));
const TrailersList = lazy(() => import("./components/Trailers/TrailersList/TrailersList"));
const VehicleDetail = lazy(() => import("./components/Vehicles/VehicleDetail"));
const AddCargoForm = lazy(() => import("./components/Cargo/AddCargoForm/AddCargoForm"));
const CargoList = lazy(() => import("./components/Cargo/CargoList/CargoList").then((m) => ({ default: m.CargoList })));
const CargoPreview = lazy(() =>
  import("./components/Cargo/CargoPreview/CargoPreview").then((m) => ({ default: m.CargoPreview }))
);
const Traffic = lazy(() => import("./components/Traffic/Traffic"));
const LoadBoard = lazy(() => import("./components/LoadBoard/LoadBoard"));
const DriverTrip = lazy(() => import("./components/Driver/DriverTrip"));
const DeliveryHistory = lazy(() => import("./components/Driver/DeliveryHistory"));
const RoadReports = lazy(() => import("./components/Driver/RoadReports"));
const DriverChat = lazy(() => import("./components/Driver/DriverChat"));
const NotFound = lazy(() => import("./components/NotFound/NotFound"));

const Page = ({ children }: { children: ReactNode }) => <div className="page">{children}</div>;

function App() {
  return (
    <>
      <Navigation />
      <main className="main">
        <Suspense fallback={<Loader />}>
          <Routes>
            <Route element={<PrivateRoute roles={STAFF} />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/dispatcher" element={<Dispatcher />} />
              <Route path="/fleet" element={<LiveFleet />} />
              <Route path="/track" element={<OngoingDelivery />} />
              <Route path="/drivers" element={<Page><TruckDriversList /></Page>} />
              <Route path="/trucks" element={<Page><TrucksList /></Page>} />
              <Route path="/trailers" element={<Page><TrailersList /></Page>} />
              <Route path="/trucks/:id" element={<Page><VehicleDetail kind="trucks" /></Page>} />
              <Route path="/trailers/:id" element={<Page><VehicleDetail kind="trailers" /></Page>} />
              <Route path="/cargo" element={<Page><AddCargoForm /></Page>} />
              <Route path="/cargoList" element={<Page><CargoList /></Page>} />
              <Route path="/cargoList/:id/preview" element={<Page><CargoPreview /></Page>} />
              <Route path="/cargoList/:id/edit" element={<Page><AddCargoForm /></Page>} />
              <Route path="/traffic" element={<Traffic />} />
              <Route path="/loadboard" element={<LoadBoard />} />
            </Route>
            <Route element={<PrivateRoute roles={["driver"]} />}>
              <Route path="/driver" element={<DriverTrip />} />
              <Route path="/driver/history" element={<DeliveryHistory />} />
              <Route path="/driver/reports" element={<RoadReports />} />
              <Route path="/driver/chat" element={<DriverChat />} />
            </Route>

            <Route path="/login" element={<Login />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
    </>
  );
}

export default App;
