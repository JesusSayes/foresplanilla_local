import Dashboard from './pages/Dashboard';
import Payslips from './pages/Payslips';
import VacationRequest from './pages/VacationRequest';
import MyProfile from './pages/MyProfile';
import Certificates from './pages/Certificates';
import Attendance from './pages/Attendance';
import ManagerApprovals from './pages/ManagerApprovals';
import VacationCalendar from './pages/VacationCalendar';


export const PAGES = {
    "Dashboard": Dashboard,
    "Payslips": Payslips,
    "VacationRequest": VacationRequest,
    "MyProfile": MyProfile,
    "Certificates": Certificates,
    "Attendance": Attendance,
    "ManagerApprovals": ManagerApprovals,
    "VacationCalendar": VacationCalendar,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
};