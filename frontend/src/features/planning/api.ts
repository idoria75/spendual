import {
  allowanceOverviewSchema,
  billListSchema,
  billSchema,
  budgetOverviewSchema,
  dashboardSchema,
  installmentPlanDetailSchema,
  recurrenceRuleListSchema,
  setupStatusSchema,
  type AllowanceCreate,
  type AllowanceOverview,
  type Bill,
  type BillConfirm,
  type BillKind,
  type BillList,
  type BudgetEdit,
  type BudgetOverview,
  type Dashboard,
  type InstallmentPlanCreate,
  type InstallmentPlanDetail,
  type RecurrenceRuleCreate,
  type RecurrenceRuleList,
  type SetupStatus,
} from "@spendual/shared";
import { api } from "../../lib/api-client";

export const fetchDashboard = (month: string): Promise<Dashboard> =>
  api.get(`/dashboard?month=${month}`, dashboardSchema);

export const fetchBudgets = (month: string): Promise<BudgetOverview> =>
  api.get(`/budgets?month=${month}`, budgetOverviewSchema);
export const putBudget = (body: BudgetEdit): Promise<BudgetOverview> =>
  api.put("/budgets", body, budgetOverviewSchema);

export const fetchAllowances = (month: string): Promise<AllowanceOverview> =>
  api.get(`/allowances?month=${month}`, allowanceOverviewSchema);
export const createAllowance = (body: AllowanceCreate): Promise<AllowanceOverview> =>
  api.post("/allowances", body, allowanceOverviewSchema);

export const fetchBills = (month: string): Promise<BillList> =>
  api.get(`/bills?month=${month}`, billListSchema);
export const fetchRules = (): Promise<RecurrenceRuleList> =>
  api.get("/recurrence-rules", recurrenceRuleListSchema);
export const createRule = (body: RecurrenceRuleCreate): Promise<BillList> =>
  api.post("/recurrence-rules", body, billListSchema);
export const createPlan = (body: InstallmentPlanCreate): Promise<InstallmentPlanDetail> =>
  api.post("/installment-plans", body, installmentPlanDetailSchema);
export const confirmBill = (kind: BillKind, id: number, body: BillConfirm): Promise<Bill> =>
  api.post(`/bills/${kind}/${id}/confirm`, body, billSchema);
export const cancelBill = (kind: BillKind, id: number, reason: string): Promise<Bill> =>
  api.post(`/bills/${kind}/${id}/cancel`, { reason }, billSchema);

export const fetchSetup = (): Promise<SetupStatus> => api.get("/setup", setupStatusSchema);
export const completeSetup = (): Promise<SetupStatus> =>
  api.post("/setup/complete", {}, setupStatusSchema);
