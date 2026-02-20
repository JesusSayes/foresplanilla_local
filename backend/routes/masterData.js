import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  listPositions, createPosition, updatePosition, deletePosition,
  listDepartments, createDepartment, updateDepartment, deleteDepartment,
  listBanks, createBank,
  listSites, createSite,
  listAFPs, createAFP,
  listProfessions, createProfession,
  listUbigeos,
  listHolidays, createHoliday,
  listRoles, createRole
} from '../controllers/masterDataController.js';
import seguroVidaController from '../controllers/masterData/seguroVidaController.js';
import uitController from '../controllers/masterData/uitController.js';
import accountingAccountController from '../controllers/masterData/accountingAccountController.js';
import rmvController from '../controllers/masterData/rmvController.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/positions', listPositions);
router.post('/positions', createPosition);
router.put('/positions/:id', updatePosition);
router.delete('/positions/:id', deletePosition);

router.get('/departments', listDepartments);
router.post('/departments', createDepartment);
router.put('/departments/:id', updateDepartment);
router.delete('/departments/:id', deleteDepartment);

router.get('/banks', listBanks);
router.post('/banks', createBank);

router.get('/sites', listSites);
router.post('/sites', createSite);

router.get('/afps', listAFPs);
router.post('/afps', createAFP);

router.get('/professions', listProfessions);
router.post('/professions', createProfession);

router.get('/ubigeos', listUbigeos);

router.get('/holidays', listHolidays);
router.post('/holidays', createHoliday);

router.get('/roles', listRoles);
router.post('/roles', createRole);

router.get('/rmvs', rmvController.getAll);
router.get('/rmvs/:id', rmvController.getById);
router.post('/rmvs', rmvController.create);
router.put('/rmvs/:id', rmvController.update);
router.delete('/rmvs/:id', rmvController.delete);

router.get('/segurovidaley', seguroVidaController.getAll);
router.get('/segurovidaley/:id', seguroVidaController.getById);
router.post('/segurovidaley', seguroVidaController.create);
router.put('/segurovidaley/:id', seguroVidaController.update);
router.delete('/segurovidaley/:id', seguroVidaController.delete);

router.get('/uits', uitController.getAll);
router.get('/uits/:id', uitController.getById);
router.post('/uits', uitController.create);
router.put('/uits/:id', uitController.update);
router.delete('/uits/:id', uitController.delete);

router.get('/accountingaccounts', accountingAccountController.getAll);
router.get('/accountingaccounts/:id', accountingAccountController.getById);
router.post('/accountingaccounts', accountingAccountController.create);
router.put('/accountingaccounts/:id', accountingAccountController.update);
router.delete('/accountingaccounts/:id', accountingAccountController.delete);

export default router;
