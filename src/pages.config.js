/**
 * pages.config.js - Page routing configuration
 *
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 *
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 *
 * Example file structure:
 *
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 *
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import AccessDeviceConfig from './pages/AccessDeviceConfig';
import Attendance from './pages/Attendance';
import AttendanceManagement from './pages/AttendanceManagement';
import AttendanceReports from './pages/AttendanceReports';
import Certificates from './pages/Certificates';
import CompanySettings from './pages/CompanySettings';
import ContractManagement from './pages/ContractManagement';
import CompensacionTardanzas from './pages/CompensacionTardanzas';
import ContractRenewalAutomation from './pages/ContractRenewalAutomation';
import ContractTemplateConfig from './pages/ContractTemplateConfig';
import CostCenterManagement from './pages/CostCenterManagement';
import CostCenterValuation from './pages/CostCenterValuation';
import Dashboard from './pages/Dashboard';
import DataExport from './pages/DataExport';
import DatabaseConfig from './pages/DatabaseConfig';
import EmployeeManagement from './pages/EmployeeManagement';
import HRDashboard from './pages/HRDashboard';
import HolidayManagement from './pages/HolidayManagement';
import Home from './pages/Home';
import ImportEmployees from './pages/ImportEmployees';
import LoanManagement from './pages/LoanManagement';
import ManagerApprovals from './pages/ManagerApprovals';
import MasterDataManagement from './pages/MasterDataManagement';
import MyProfile from './pages/MyProfile';
import NotificationSettings from './pages/NotificationSettings';
import OrgChart from './pages/OrgChart';
import PayrollConcepts from './pages/PayrollConcepts';
import PayrollManagement from './pages/PayrollManagement';
import PayslipTemplateConfig from './pages/PayslipTemplateConfig';
import Payslips from './pages/Payslips';
import Reports from './pages/Reports';
import RoleManagement from './pages/RoleManagement';
import AsientosContables from './pages/AsientosContables';
import CuentasContables from './pages/CuentasContables';
import ConsultaPlanillas from './pages/ConsultaPlanillas';
import BackfillAsistencia from './pages/BackfillAsistencia';
import ScheduleManagement from './pages/ScheduleManagement';
import SystemRoleInitializer from './pages/SystemRoleInitializer';
import UserManagement from './pages/UserManagement';
import VacationCalendar from './pages/VacationCalendar';
import VacationManagement from './pages/VacationManagement';
import VacationRequest from './pages/VacationRequest';
import SunatExport from './pages/SunatExport';
import SubdiarioManagement from './pages/SubdiarioManagement';
import TipoAnexoManagement from './pages/TipoAnexoManagement';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AsientosContables": AsientosContables,
    "CuentasContables": CuentasContables,
    "ConsultaPlanillas": ConsultaPlanillas,
    "BackfillAsistencia": BackfillAsistencia,
    "AccessDeviceConfig": AccessDeviceConfig,
    "Attendance": Attendance,
    "AttendanceManagement": AttendanceManagement,
    "AttendanceReports": AttendanceReports,
    "Certificates": Certificates,
    "CompanySettings": CompanySettings,
    "ContractManagement": ContractManagement,
    "CompensacionTardanzas": CompensacionTardanzas,
    "ContractRenewalAutomation": ContractRenewalAutomation,
    "ContractTemplateConfig": ContractTemplateConfig,
    "CostCenterManagement": CostCenterManagement,
    "CostCenterValuation": CostCenterValuation,
    "Dashboard": Dashboard,
    "DataExport": DataExport,
    "DatabaseConfig": DatabaseConfig,
    "EmployeeManagement": EmployeeManagement,
    "HRDashboard": HRDashboard,
    "HolidayManagement": HolidayManagement,
    "Home": Home,
    "ImportEmployees": ImportEmployees,
    "LoanManagement": LoanManagement,
    "ManagerApprovals": ManagerApprovals,
    "MasterDataManagement": MasterDataManagement,
    "MyProfile": MyProfile,
    "NotificationSettings": NotificationSettings,
    "OrgChart": OrgChart,
    "PayrollConcepts": PayrollConcepts,
    "PayrollManagement": PayrollManagement,
    "PayslipTemplateConfig": PayslipTemplateConfig,
    "Payslips": Payslips,
    "Reports": Reports,
    "RoleManagement": RoleManagement,
    "SystemRoleInitializer": SystemRoleInitializer,
    "UserManagement": UserManagement,
    "VacationCalendar": VacationCalendar,
    "VacationManagement": VacationManagement,
    "VacationRequest": VacationRequest,
    "ScheduleManagement": ScheduleManagement,
    "SunatExport": SunatExport,
    "SubdiarioManagement": SubdiarioManagement,
    "TipoAnexoManagement": TipoAnexoManagement,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};
