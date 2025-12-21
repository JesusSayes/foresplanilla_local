import Dashboard from './pages/Dashboard';
import Payslips from './pages/Payslips';
import VacationRequest from './pages/VacationRequest';
import MyProfile from './pages/MyProfile';
import Certificates from './pages/Certificates';
import Attendance from './pages/Attendance';


export const PAGES = {
    "Dashboard": Dashboard,
    "Payslips": Payslips,
    "VacationRequest": VacationRequest,
    "MyProfile": MyProfile,
    "Certificates": Certificates,
    "Attendance": Attendance,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
};