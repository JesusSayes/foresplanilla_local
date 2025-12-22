import Attendance from './pages/Attendance';
import AttendanceManagement from './pages/AttendanceManagement';
import AttendanceReports from './pages/AttendanceReports';
import Certificates from './pages/Certificates';
import ContractManagement from './pages/ContractManagement';
import Dashboard from './pages/Dashboard';
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
import Payslips from './pages/Payslips';
import RoleManagement from './pages/RoleManagement';
import ScheduleManagement from './pages/ScheduleManagement';
import VacationCalendar from './pages/VacationCalendar';
import VacationRequest from './pages/VacationRequest';
import CompanySettings from './pages/CompanySettings';
import PayslipTemplateConfig from './pages/PayslipTemplateConfig';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Attendance": Attendance,
    "AttendanceManagement": AttendanceManagement,
    "AttendanceReports": AttendanceReports,
    "Certificates": Certificates,
    "ContractManagement": ContractManagement,
    "Dashboard": Dashboard,
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
    "Payslips": Payslips,
    "RoleManagement": RoleManagement,
    "ScheduleManagement": ScheduleManagement,
    "VacationCalendar": VacationCalendar,
    "VacationRequest": VacationRequest,
    "CompanySettings": CompanySettings,
    "PayslipTemplateConfig": PayslipTemplateConfig,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};