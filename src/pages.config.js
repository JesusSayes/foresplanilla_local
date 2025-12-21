import Dashboard from './pages/Dashboard';
import Payslips from './pages/Payslips';
import VacationRequest from './pages/VacationRequest';
import MyProfile from './pages/MyProfile';
import Certificates from './pages/Certificates';


export const PAGES = {
    "Dashboard": Dashboard,
    "Payslips": Payslips,
    "VacationRequest": VacationRequest,
    "MyProfile": MyProfile,
    "Certificates": Certificates,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
};