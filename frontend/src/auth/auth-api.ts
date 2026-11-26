import {
  authUserSchema,
  type AuthUser,
  type LoginRequest,
  type SignupRequest,
} from "@spendual/shared";
import { api } from "../lib/api-client";

export const fetchMe = (): Promise<AuthUser> => api.get("/auth/me", authUserSchema);
export const login = (body: LoginRequest): Promise<AuthUser> =>
  api.post("/auth/login", body, authUserSchema);
export const signup = (body: SignupRequest): Promise<AuthUser> =>
  api.post("/auth/signup", body, authUserSchema);
export const logout = (): Promise<void> => api.post("/auth/logout");
