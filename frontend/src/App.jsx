import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { Toaster } from "react-hot-toast";
import ChangePassword from "./pages/ChangePassword";  
import CreateRequest from "./pages/CreateRequest";

// NEW Layout (Step 2)
import DashboardLayout from "./components/SidebarLayout";

// Pages
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import OfficeDashboard from "./pages/OfficeDashboard";
import StudentDashboard from "./pages/StudentDashboard";
import SupervisorDashboard from "./pages/SupervisorDashboard";
import UserManagement from "./pages/UserManagement";
import UpdatePassword from "./pages/UpdatePassword";
import { NotificationProvider } from "./context/NotificationContext"; 

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>  
          <Toaster position="top-right" />
          <Routes>
            {/* Public Pages */}
            <Route path="/" element={<Home />} />
            <Route path="/home" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            
            {/* New Create Request Page */}
            <Route
              path="/create-request"
              element={
                <DashboardLayout>
                  <CreateRequest />
                </DashboardLayout>
              }
            />
            
            {/* Dashboards wrapped in DashboardLayout */}
            <Route
              path="/dashboard/office"
              element={
                <DashboardLayout>
                  <OfficeDashboard />
                </DashboardLayout>
              }
            />
            <Route
              path="/dashboard/student"
              element={
                <DashboardLayout>
                  <StudentDashboard />
                </DashboardLayout>
              }
            />
            <Route
              path="/dashboard/supervisor"
              element={
                <DashboardLayout>
                  <SupervisorDashboard />
                </DashboardLayout>
              }
            />
            <Route
              path="/supervisor/users"
              element={
                <DashboardLayout>
                  <UserManagement />
                </DashboardLayout>
              }
            />
            <Route
              path="/supervisor/password/:id"
              element={
                <DashboardLayout>
                  <UpdatePassword />
                </DashboardLayout>
              }
            />
            <Route
              path="/change-password"
              element={
                <DashboardLayout>
                  <ChangePassword />
                </DashboardLayout>
              }
            />
          </Routes>
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;