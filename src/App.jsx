import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import Layout from "./Layout";
import Login from "./pages/Login";

// Importar todas las páginas
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import HRDashboard from "./pages/HRDashboard";
import Payslips from "./pages/Payslips";
import VacationRequest from "./pages/VacationRequest";
import Attendance from "./pages/Attendance";
import Certificates from "./pages/Certificates";
import MyProfile from "./pages/MyProfile";
import EmployeeManagement from "./pages/EmployeeManagement";
import PayrollManagement from "./pages/PayrollManagement";
import AttendanceManagement from "./pages/AttendanceManagement";
import VacationManagement from "./pages/VacationManagement";
import Reports from "./pages/Reports";
import CompanySettings from "./pages/CompanySettings";
import UserManagement from "./pages/UserManagement";
import RoleManagement from "./pages/RoleManagement";
import AttendanceReports from "./pages/AttendanceReports";
import ManagerApprovals from "./pages/ManagerApprovals";
import VacationCalendar from "./pages/VacationCalendar";
import OrgChart from "./pages/OrgChart";
import ImportEmployees from "./pages/ImportEmployees";
import MasterDataManagement from "./pages/MasterDataManagement";
import PayrollConcepts from "./pages/PayrollConcepts";
import CostCenterManagement from "./pages/CostCenterManagement";
import CostCenterValuation from "./pages/CostCenterValuation";
import HolidayManagement from "./pages/HolidayManagement";
import ScheduleManagement from "./pages/ScheduleManagement";
import DatabaseConfig from "./pages/DatabaseConfig";
import AccessDeviceConfig from "./pages/AccessDeviceConfig";
import ContractManagement from "./pages/ContractManagement";
import ContractTemplateConfig from "./pages/ContractTemplateConfig";
import ContractRenewalAutomation from "./pages/ContractRenewalAutomation";
import PayslipTemplateConfig from "./pages/PayslipTemplateConfig";
import NotificationSettings from "./pages/NotificationSettings";
import DataExport from "./pages/DataExport";
import SystemRoleInitializer from "./pages/SystemRoleInitializer";
import LoanManagement from "./pages/LoanManagement";
import ConsultaPlanillas from "./pages/ConsultaPlanillas";
import AsientosContables from "./pages/AsientosContables";
import CuentasContables from "./pages/CuentasContables";
import SunatExport from "./pages/SunatExport";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Componente para rutas protegidas
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoadingAuth } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-[#1a5850] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

const AuthenticatedApp = () => {
  const { isLoadingAuth } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-[#1a5850] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Home />} />

      {/* Rutas protegidas */}
      <Route path="/Dashboard" element={
        <ProtectedRoute>
          <Layout currentPageName="Dashboard"><Dashboard /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/HRDashboard" element={
        <ProtectedRoute>
          <Layout currentPageName="HRDashboard"><HRDashboard /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/Payslips" element={
        <ProtectedRoute>
          <Layout currentPageName="Payslips"><Payslips /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/VacationRequest" element={
        <ProtectedRoute>
          <Layout currentPageName="VacationRequest"><VacationRequest /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/Attendance" element={
        <ProtectedRoute>
          <Layout currentPageName="Attendance"><Attendance /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/Certificates" element={
        <ProtectedRoute>
          <Layout currentPageName="Certificates"><Certificates /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/MyProfile" element={
        <ProtectedRoute>
          <Layout currentPageName="MyProfile"><MyProfile /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/EmployeeManagement" element={
        <ProtectedRoute>
          <Layout currentPageName="EmployeeManagement"><EmployeeManagement /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/PayrollManagement" element={
        <ProtectedRoute>
          <Layout currentPageName="PayrollManagement"><PayrollManagement /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/AttendanceManagement" element={
        <ProtectedRoute>
          <Layout currentPageName="AttendanceManagement"><AttendanceManagement /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/VacationManagement" element={
        <ProtectedRoute>
          <Layout currentPageName="VacationManagement"><VacationManagement /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/Reports" element={
        <ProtectedRoute>
          <Layout currentPageName="Reports"><Reports /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/CompanySettings" element={
        <ProtectedRoute>
          <Layout currentPageName="CompanySettings"><CompanySettings /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/UserManagement" element={
        <ProtectedRoute>
          <Layout currentPageName="UserManagement"><UserManagement /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/RoleManagement" element={
        <ProtectedRoute>
          <Layout currentPageName="RoleManagement"><RoleManagement /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/AttendanceReports" element={
        <ProtectedRoute>
          <Layout currentPageName="AttendanceReports"><AttendanceReports /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/ManagerApprovals" element={
        <ProtectedRoute>
          <Layout currentPageName="ManagerApprovals"><ManagerApprovals /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/VacationCalendar" element={
        <ProtectedRoute>
          <Layout currentPageName="VacationCalendar"><VacationCalendar /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/OrgChart" element={
        <ProtectedRoute>
          <Layout currentPageName="OrgChart"><OrgChart /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/ImportEmployees" element={
        <ProtectedRoute>
          <Layout currentPageName="ImportEmployees"><ImportEmployees /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/MasterDataManagement" element={
        <ProtectedRoute>
          <Layout currentPageName="MasterDataManagement"><MasterDataManagement /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/PayrollConcepts" element={
        <ProtectedRoute>
          <Layout currentPageName="PayrollConcepts"><PayrollConcepts /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/LoanManagement" element={
        <ProtectedRoute>
          <Layout currentPageName="LoanManagement"><LoanManagement/></Layout>
        </ProtectedRoute>
      } />
      <Route path="/CostCenterManagement" element={
        <ProtectedRoute>
          <Layout currentPageName="CostCenterManagement"><CostCenterManagement /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/CostCenterValuation" element={
        <ProtectedRoute>
          <Layout currentPageName="CostCenterValuation"><CostCenterValuation /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/HolidayManagement" element={
        <ProtectedRoute>
          <Layout currentPageName="HolidayManagement"><HolidayManagement /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/ScheduleManagement" element={
        <ProtectedRoute>
          <Layout currentPageName="ScheduleManagement"><ScheduleManagement /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/DatabaseConfig" element={
        <ProtectedRoute>
          <Layout currentPageName="DatabaseConfig"><DatabaseConfig /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/AccessDeviceConfig" element={
        <ProtectedRoute>
          <Layout currentPageName="AccessDeviceConfig"><AccessDeviceConfig /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/ContractManagement" element={
        <ProtectedRoute>
          <Layout currentPageName="ContractManagement"><ContractManagement /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/ContractTemplateConfig" element={
        <ProtectedRoute>
          <Layout currentPageName="ContractTemplateConfig"><ContractTemplateConfig /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/ContractRenewalAutomation" element={
        <ProtectedRoute>
          <Layout currentPageName="ContractRenewalAutomation"><ContractRenewalAutomation /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/PayslipTemplateConfig" element={
        <ProtectedRoute>
          <Layout currentPageName="PayslipTemplateConfig"><PayslipTemplateConfig /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/NotificationSettings" element={
        <ProtectedRoute>
          <Layout currentPageName="NotificationSettings"><NotificationSettings /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/DataExport" element={
        <ProtectedRoute>
          <Layout currentPageName="DataExport"><DataExport /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/SystemRoleInitializer" element={
        <ProtectedRoute>
          <Layout currentPageName="SystemRoleInitializer"><SystemRoleInitializer /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/ConsultaPlanillas" element={
        <ProtectedRoute>
          <Layout currentPageName="ConsultaPlanillas"><ConsultaPlanillas /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/AsientosContables" element={
        <ProtectedRoute>
          <Layout currentPageName="AsientosContables"><AsientosContables /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/CuentasContables" element={
        <ProtectedRoute>
          <Layout currentPageName="CuentasContables"><CuentasContables /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/SunatExport" element={
        <ProtectedRoute>
          <Layout currentPageName="SunatExport"><SunatExport /></Layout>
        </ProtectedRoute>
      } />
    </Routes>
  );
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <AuthProvider>
          <AuthenticatedApp />
          <Toaster />
        </AuthProvider>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
