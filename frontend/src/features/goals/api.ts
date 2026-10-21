import {
  goalEntryListSchema,
  goalListSchema,
  goalSchema,
  type Goal,
  type GoalCreate,
  type GoalEntryList,
  type GoalList,
  type GoalMove,
  type GoalPatch,
} from "@spendual/shared";
import { api } from "../../lib/api-client";

export const fetchGoals = (): Promise<GoalList> => api.get("/goals", goalListSchema);
export const fetchGoalEntries = (id: number): Promise<GoalEntryList> =>
  api.get(`/goals/${id}/entries`, goalEntryListSchema);
export const createGoal = (body: GoalCreate): Promise<Goal> => api.post("/goals", body, goalSchema);
export const patchGoal = (id: number, body: GoalPatch): Promise<Goal> =>
  api.patch(`/goals/${id}`, body, goalSchema);
export const allocateGoal = (id: number, body: GoalMove): Promise<Goal> =>
  api.post(`/goals/${id}/allocations`, body, goalSchema);
export const withdrawGoal = (id: number, body: GoalMove): Promise<Goal> =>
  api.post(`/goals/${id}/withdrawals`, body, goalSchema);
export const goalAction = (id: number, name: "complete" | "reopen" | "archive"): Promise<Goal> =>
  api.post(`/goals/${id}/${name}`, {}, goalSchema);
