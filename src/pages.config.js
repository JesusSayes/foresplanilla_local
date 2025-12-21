import Attendance from './pages/Attendance';
import Certificates from './pages/Certificates';
import Dashboard from './pages/Dashboard';
import Home from './pages/Home';
import ManagerApprovals from './pages/ManagerApprovals';
import MyProfile from './pages/MyProfile';
import Payslips from './pages/Payslips';
import VacationCalendar from './pages/VacationCalendar';
import VacationRequest from './pages/VacationRequest';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Attendance": Attendance,
    "Certificates": Certificates,
    "Dashboard": Dashboard,
    "Home": Home,
    "ManagerApprovals": ManagerApprovals,
    "MyProfile": MyProfile,
    "Payslips": Payslips,
    "VacationCalendar": VacationCalendar,
    "VacationRequest": VacationRequest,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};