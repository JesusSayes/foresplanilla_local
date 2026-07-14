import {
  listEligibleContractRecipients,
  notifyExpiringContracts,
} from '../services/contractNotificationService.js';

export const listRecipients = async (req, res) => {
  try {
    res.json(await listEligibleContractRecipients());
  } catch (error) {
    console.error('Error listando destinatarios de contratos:', error);
    res.status(500).json({ error: 'No se pudieron listar los destinatarios', detail: error.message });
  }
};

export const runNow = async (req, res) => {
  try {
    const result = await notifyExpiringContracts({ triggeredBy: req.user?.email || 'system' });
    res.status(result.success ? 200 : 502).json(result);
  } catch (error) {
    console.error('Error notificando vencimientos de contratos:', error);
    res.status(500).json({ error: 'No se pudo ejecutar la notificación de contratos', detail: error.message });
  }
};

export default { listRecipients, runNow };
