import Attendance from './pages/Attendance';
import AttendanceManagement from './pages/AttendanceManagement';
import AttendanceReports from './pages/AttendanceReports';
import Certificates from './pages/Certificates';
import Dashboard from './pages/Dashboard';
import EmployeeManagement from './pages/EmployeeManagement';
import HolidayManagement from './pages/HolidayManagement';
import Home from './pages/Home';
import ImportEmployees from './pages/ImportEmployees';
import ManagerApprovals from './pages/ManagerApprovals';
import MasterDataManagement from './pages/MasterDataManagement';
import MyProfile from './pages/MyProfile';
import Payslips from './pages/Payslips';
import RoleManagement from './pages/RoleManagement';
import VacationCalendar from './pages/VacationCalendar';
import VacationRequest from './pages/VacationRequest';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Attendance": Attendance,
    "AttendanceManagement": AttendanceManagement,
    "AttendanceReports": AttendanceReports,
    "Certificates": Certificates,
    "Dashboard": Dashboard,
    "EmployeeManagement": EmployeeManagement,
    "HolidayManagement": HolidayManagement,
    "Home": Home,
    "ImportEmployees": ImportEmployees,
    "ManagerApprovals": ManagerApprovals,
    "MasterDataManagement": MasterDataManagement,
    "MyProfile": MyProfile,
    "Payslips": Payslips,
    "RoleManagement": RoleManagement,
    "VacationCalendar": VacationCalendar,
    "VacationRequest": VacationRequest,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};