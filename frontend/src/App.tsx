import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { getToken } from "./services/api";
import Audit from "./pages/Audit";
import Cases from "./pages/Cases";
import Details from "./pages/Details";
import Documents, { DocumentsIndex } from "./pages/Documents";
import Home from "./pages/Home";
import Legal from "./pages/Legal";
import Login from "./pages/Login";
import Notifications from "./pages/Notifications";
import Pricing from "./pages/Pricing";
import Profile from "./pages/Profile";
import Registry from "./pages/Registry";
import Register from "./pages/Register";
import Summary from "./pages/Summary";

function Protected() {
  return getToken() ? <Layout><Outlet /></Layout> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/terms" element={<Legal kind="terms" />} />
      <Route path="/privacy" element={<Legal kind="privacy" />} />
      <Route path="/offer" element={<Legal kind="offer" />} />
      <Route element={<Protected />}>
        <Route path="/" element={<Home />} />
        <Route path="/cases" element={<Cases />} />
        <Route path="/documents" element={<DocumentsIndex />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/analysis/:id" element={<Summary />} />
        <Route path="/analysis/:id/details" element={<Details />} />
        <Route path="/analysis/:id/audit" element={<Audit />} />
        <Route path="/analysis/:id/registry" element={<Registry />} />
        <Route path="/analysis/:id/documents" element={<Documents />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
