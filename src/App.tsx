import Navigation from "./components/Navigation/Navigation";

import "./assets/css/styles.css";
import OngoingDelivery from "./components/OngoingDelivery/OngoingDelivery";
import { Route, Routes } from "react-router-dom";
import Dashboard from "./components/Dashboard/Dashboard";
import TruckDriversList from "./components/TruckDrivers/TruckDriversList/TruckDriversList";
import TrucksList from "./components/Trucks/TrucksList/TrucksList";
import TrailersList from "./components/Trailers/TrailersList/TrailersList";
import AddCargoForm from "./components/Cargo/AddCargoForm/AddCargoForm";
import { CargoList } from "./components/Cargo/CargoList/CargoList";
import { CargoPreview } from "./components/Cargo/CargoPreview/CargoPreview";

import Dispatcher from "./components/Dispatcher/Dispatcher";
import LiveFleet from "./components/Fleet/LiveFleet";
import DriverTrip from "./components/Driver/DriverTrip";
import Traffic from "./components/Traffic/Traffic";
import Login from "./components/Account/Login/Login";

import PrivateRoute from "./components/Account/PrivateRoute/PrivateRoute";
import { STAFF } from "./app/roles";

function App() {
  return (
    <>
      <Navigation />
      <main className="main">
        <Routes>
          <Route element={<PrivateRoute roles={STAFF} />}>
            <Route path="/" element={<Dashboard />} />
          </Route>
          <Route element={<PrivateRoute roles={STAFF} />}>
            <Route path="/dashboard" element={<Dashboard />} />
          </Route>
          <Route element={<PrivateRoute roles={STAFF} />}>
            <Route path="/dispatcher" element={<Dispatcher />} />
          </Route>
          <Route element={<PrivateRoute roles={STAFF} />}>
            <Route path="/fleet" element={<LiveFleet />} />
          </Route>
          <Route element={<PrivateRoute roles={STAFF} />}>
            <Route path="/track" element={<OngoingDelivery />} />
          </Route>
          <Route element={<PrivateRoute roles={STAFF} />}>
            <Route path="/drivers" element={<TruckDriversList />} />
          </Route>
          <Route element={<PrivateRoute roles={STAFF} />}>
            <Route path="/trucks" element={<TrucksList />} />
          </Route>
          <Route element={<PrivateRoute roles={STAFF} />}>
            <Route path="/trailers" element={<TrailersList />} />
          </Route>
          <Route element={<PrivateRoute roles={STAFF} />}>
            <Route path="/cargo" element={<AddCargoForm />} />
          </Route>
          <Route element={<PrivateRoute roles={STAFF} />}>
            <Route path="/cargoList" element={<CargoList />} />
          </Route>
          <Route element={<PrivateRoute roles={STAFF} />}>
            <Route path="/cargoList/:id/preview" element={<CargoPreview />} />
          </Route>
          <Route element={<PrivateRoute roles={STAFF} />}>
            <Route path="/cargoList/:id/edit" element={<AddCargoForm />} />
          </Route>

          <Route element={<PrivateRoute roles={STAFF} />}>
            <Route path="/traffic" element={<Traffic />} />
          </Route>
          <Route element={<PrivateRoute roles={["driver"]} />}>
            <Route path="/driver" element={<DriverTrip />} />
          </Route>

          <Route path="/login" element={<Login />} />
        </Routes>
      </main>
    </>
  );
}

export default App;
