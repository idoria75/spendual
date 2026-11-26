import { loginRequestSchema, signupRequestSchema } from "@spendual/shared";
import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { messageKeyFor } from "../auth/error-messages";
import { Button } from "../components/ui/button";
import { Field } from "../components/ui/field";
import { Logo } from "../components/ui/logo";
import { ApiError } from "../lib/api-client";
import { cn } from "../lib/cn";

type Mode = "login" | "signup";
type FieldName = "displayName" | "username" | "password";
type FieldKey =
  | "fieldErrors.displayName"
  | "fieldErrors.username"
  | "fieldErrors.usernameRequired"
  | "fieldErrors.password"
  | "fieldErrors.passwordRequired"
  | "fieldErrors.invalid";
type FieldErrors = Partial<Record<FieldName, FieldKey>>;

function validate(mode: Mode, values: Record<FieldName, string>): FieldErrors {
  const errors: FieldErrors = {};
  if (mode === "signup") {
    const r = signupRequestSchema.safeParse(values);
    if (!r.success) {
      for (const issue of r.error.issues) {
        const name = issue.path[0];
        if (name === "displayName") errors.displayName = "fieldErrors.displayName";
        if (name === "username") errors.username = "fieldErrors.username";
        if (name === "password") errors.password = "fieldErrors.password";
      }
    }
  } else {
    const r = loginRequestSchema.safeParse(values);
    if (!r.success) {
      for (const issue of r.error.issues) {
        if (issue.path[0] === "username") errors.username = "fieldErrors.usernameRequired";
        if (issue.path[0] === "password") errors.password = "fieldErrors.passwordRequired";
      }
    }
  }
  return errors;
}

export function LoginPage() {
  const { t } = useTranslation();
  const { status, login, signup } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [values, setValues] = useState<Record<FieldName, string>>({
    displayName: "",
    username: "",
    password: "",
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<ReturnType<typeof messageKeyFor> | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === "authenticated") return <Navigate to="/" replace />;

  const switchMode = (next: Mode) => {
    setMode(next);
    setFieldErrors({});
    setFormError(null);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    const errors = validate(mode, values);
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login({ username: values.username, password: values.password });
      } else {
        await signup(values);
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === "username_taken") {
        setFieldErrors({ username: "fieldErrors.invalid" });
      } else if (error instanceof ApiError && error.code === "validation_error" && error.fields) {
        const fromServer: FieldErrors = {};
        for (const name of Object.keys(error.fields)) {
          if (name === "displayName" || name === "username" || name === "password") {
            fromServer[name] = "fieldErrors.invalid";
          }
        }
        setFieldErrors(fromServer);
      }
      setFormError(messageKeyFor(error));
    } finally {
      setSubmitting(false);
    }
  };

  const set = (name: FieldName) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [name]: e.target.value }));
  const fieldError = (name: FieldName) => {
    const key = fieldErrors[name];
    return key ? t(key) : undefined;
  };

  const tabs: Mode[] = ["login", "signup"];

  return (
    <main className="mx-auto flex min-h-screen max-w-[420px] flex-col justify-center gap-[14px] px-4 py-8">
      <header className="flex flex-col items-center text-center">
        <Logo size={72} className="mb-2" />
        <h1 className="text-[1.6rem] font-bold">{t("app.title")}</h1>
        <p className="text-[0.8rem] text-muted">{t("app.tagline")}</p>
      </header>

      <div
        role="group"
        aria-label={t("auth.modeLabel")}
        className="grid grid-flow-col auto-cols-fr rounded-input bg-surface-2 p-[3px] text-[0.8rem]"
      >
        {tabs.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => switchMode(m)}
            className={cn(
              "min-h-[44px] whitespace-nowrap rounded-[8px] px-2",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              mode === m ? "bg-surface font-semibold text-fg shadow-sm" : "text-muted",
            )}
          >
            {t(`auth.${m}`)}
          </button>
        ))}
      </div>

      <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-[14px]">
        {mode === "signup" ? (
          <Field
            label={t("auth.displayName")}
            value={values.displayName}
            onChange={set("displayName")}
            error={fieldError("displayName")}
            autoComplete="name"
          />
        ) : null}
        <Field
          label={t("auth.username")}
          value={values.username}
          onChange={set("username")}
          error={fieldError("username")}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
        />
        <Field
          label={t("auth.password")}
          type="password"
          value={values.password}
          onChange={set("password")}
          error={fieldError("password")}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
        {formError ? (
          <p role="alert" className="text-[0.85rem] text-err">
            {t(formError)}
          </p>
        ) : null}
        <Button type="submit" disabled={submitting}>
          {submitting
            ? t("auth.submitting")
            : mode === "login"
              ? t("auth.submitLogin")
              : t("auth.submitSignup")}
        </Button>
      </form>
      <p className="text-center text-[0.8rem] text-muted">{t("auth.householdHint")}</p>
    </main>
  );
}
