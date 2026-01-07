import AccessDeviceConfig from './pages/AccessDeviceConfig';
import Attendance from './pages/Attendance';
import AttendanceManagement from './pages/AttendanceManagement';
import AttendanceReports from './pages/AttendanceReports';
import Certificates from './pages/Certificates';
import CompanySettings from './pages/CompanySettings';
import ContractManagement from './pages/ContractManagement';
import ContractRenewalAutomation from './pages/ContractRenewalAutomation';
import ContractTemplateConfig from './pages/ContractTemplateConfig';
import Dashboard from './pages/Dashboard';
import DatabaseConfig from './pages/DatabaseConfig';
import EmployeeManagement from './pages/EmployeeManagement';
import HRDashboard from './pages/HRDashboard';
import HolidayManagement from './pages/HolidayManagement';
import Home from './pages/Home';
import ImportEmployees from './pages/ImportEmployees';
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
import ScheduleManagement from './pages/ScheduleManagement';
import SystemRoleInitializer from './pages/SystemRoleInitializer';
import UserManagement from './pages/UserManagement';
import VacationCalendar from './pages/VacationCalendar';
import VacationManagement from './pages/VacationManagement';
import VacationRequest from './pages/VacationRequest';
import CostCenterManagement from './pages/CostCenterManagement';
import CostCenterValuation from './pages/CostCenterValuation';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AccessDeviceConfig": AccessDeviceConfig,
    "Attendance": Attendance,
    "AttendanceManagement": AttendanceManagement,
    "AttendanceReports": AttendanceReports,
    "Certificates": Certificates,
    "CompanySettings": CompanySettings,
    "ContractManagement": ContractManagement,
    "ContractRenewalAutomation": ContractRenewalAutomation,
    "ContractTemplateConfig": ContractTemplateConfig,
    "Dashboard": Dashboard,
    "DatabaseConfig": DatabaseConfig,
    "EmployeeManagement": EmployeeManagement,
    "HRDashboard": HRDashboard,
    "HolidayManagement": HolidayManagement,
    "Home": Home,
    "ImportEmployees": ImportEmployees,
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
    "ScheduleManagement": ScheduleManagement,
    "SystemRoleInitializer": SystemRoleInitializer,
    "UserManagement": UserManagement,
    "VacationCalendar": VacationCalendar,
    "VacationManagement": VacationManagement,
    "VacationRequest": VacationRequest,
    "CostCenterManagement": CostCenterManagement,
    "CostCenterValuation": CostCenterValuation,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};