import Dashboard from './pages/Dashboard';
import Payslips from './pages/Payslips';
import VacationRequest from './pages/VacationRequest';
import MyProfile from './pages/MyProfile';


export const PAGES = {
    "Dashboard": Dashboard,
    "Payslips": Payslips,
    "VacationRequest": VacationRequest,
    "MyProfile": MyProfile,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
};