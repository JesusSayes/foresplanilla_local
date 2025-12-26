import Attendance from './pages/Attendance';
import AttendanceManagement from './pages/AttendanceManagement';
import AttendanceReports from './pages/AttendanceReports';
import Certificates from './pages/Certificates';
import CompanySettings from './pages/CompanySettings';
import ContractManagement from './pages/ContractManagement';
import Dashboard from './pages/Dashboard';
import DatabaseConfig from './pages/DatabaseConfig';
import EmployeeManagement from './pages/EmployeeManagement';
import HolidayManagement from './pages/HolidayManagement';
import Home from './pages/Home';
import ImportEmployees from './pages/ImportEmployees';
import ManagerApprovals from './pages/ManagerApprovals';
import MasterDataManagement from './pages/MasterDataManagement';
import MyProfile from './pages/MyProfile';
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
import AccessDeviceConfig from './pages/AccessDeviceConfig';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Attendance": Attendance,
    "AttendanceManagement": AttendanceManagement,
    "AttendanceReports": AttendanceReports,
    "Certificates": Certificates,
    "CompanySettings": CompanySettings,
    "ContractManagement": ContractManagement,
    "Dashboard": Dashboard,
    "DatabaseConfig": DatabaseConfig,
    "EmployeeManagement": EmployeeManagement,
    "HolidayManagement": HolidayManagement,
    "Home": Home,
    "ImportEmployees": ImportEmployees,
    "ManagerApprovals": ManagerApprovals,
    "MasterDataManagement": MasterDataManagement,
    "MyProfile": MyProfile,
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
    "AccessDeviceConfig": AccessDeviceConfig,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};