import localClient from "@/api/localClient";

// La API revalida los datos y guarda la renovación completa en una transacción.
export async function renewContractWithRmv({ contract, employee, activeRmv, rule }) {
  try {
    const response = await localClient.post(`/api/contracts/${encodeURIComponent(contract.id)}/renew-rmv`, {
      rmv_id: activeRmv?.id,
      rmv_amount: activeRmv?.amount,
      base_salary: employee.base_salary,
      rule_id: rule?.id,
    });
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.error || "No se pudo renovar el contrato");
  }
}
