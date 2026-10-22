import {
  allowanceOverviewSchema,
  billListSchema,
  billSchema,
  budgetOverviewSchema,
  categoryTrendsSchema,
  dashboardSchema,
  installmentPlanDetailSchema,
  installmentPlanListSchema,
  installmentPlanSummarySchema,
  recurrenceRuleSchema,
  recurrenceRuleListSchema,
  setupStatusSchema,
  personalHistorySchema,
  trendMonthsSchema,
  type AllowanceCreate,
  type AllowanceOverview,
  type Bill,
  type BillConfirm,
  type BillKind,
  type BillList,
  type BudgetEdit,
  type BudgetOverview,
  type CategoryTrends,
  type Dashboard,
  type InstallmentPlanCreate,
  type InstallmentPlanDetail,
  type InstallmentPlanList,
  type InstallmentPlanPatch,
  type InstallmentPlanSummary,
  type RecurrenceRule,
  type RecurrenceRulePatch,
  type RecurrenceRuleCreate,
  type RecurrenceRuleList,
  type SetupStatus,
  type PersonalHistory,
  type TrendMonths,
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
export const patchRule = (id: number, body: RecurrenceRulePatch): Promise<RecurrenceRule> =>
  api.patch(`/recurrence-rules/${id}`, body, recurrenceRuleSchema);
export const fetchPlans = (): Promise<InstallmentPlanList> =>
  api.get("/installment-plans", installmentPlanListSchema);
export const patchPlan = (
  id: number,
  body: InstallmentPlanPatch,
): Promise<InstallmentPlanSummary> =>
  api.patch(`/installment-plans/${id}`, body, installmentPlanSummarySchema);
export const cancelPlan = (id: number, reason: string): Promise<InstallmentPlanSummary> =>
  api.post(`/installment-plans/${id}/cancel`, { reason }, installmentPlanSummarySchema);
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

export const fetchCategoryTrends = (from: string, to: string): Promise<CategoryTrends> =>
  api.get(`/analytics/categories?from=${from}&to=${to}`, categoryTrendsSchema);

export const fetchPersonalHistory = (
  userId: number,
  from: string,
  to: string,
): Promise<PersonalHistory> =>
  api.get(`/personal/history?userId=${userId}&from=${from}&to=${to}`, personalHistorySchema);

export const fetchTrendMonths = (): Promise<TrendMonths> =>
  api.get("/analytics/months", trendMonthsSchema);
