import type { AuthUser, LoginRequest, SignupRequest } from "@spendual/shared";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ApiError } from "../lib/api-client";
import * as authApi from "./auth-api";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

interface AuthValue {
  status: AuthStatus;
  user: AuthUser | null;
  login: (body: LoginRequest) => Promise<void>;
  signup: (body: SignupRequest) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let active = true;
    authApi
      .fetchMe()
      .then((me) => {
        if (!active) return;
        setUser(me);
        setStatus("authenticated");
      })
      .catch((error: unknown) => {
        if (!active) return;
        // Only a clear 401 means "not signed in"; other errors also leave the app locked out.
        if (!(error instanceof ApiError) || error.status !== 401) {
          console.error(error);
        }
        setUser(null);
        setStatus("anonymous");
      });
    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback((me: AuthUser) => {
    setUser(me);
    setStatus("authenticated");
  }, []);

  const login = useCallback(
    async (body: LoginRequest) => signIn(await authApi.login(body)),
    [signIn],
  );
  const signup = useCallback(
    async (body: SignupRequest) => signIn(await authApi.signup(body)),
    [signIn],
  );
  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
    setStatus("anonymous");
  }, []);

  const value = useMemo(
    () => ({ status, user, login, signup, logout }),
    [status, user, login, signup, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
