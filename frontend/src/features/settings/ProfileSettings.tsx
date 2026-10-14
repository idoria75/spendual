import { TonePalette, type ThemePreference } from "@spendual/shared";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { ProfilePatch } from "@spendual/shared";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../auth/AuthContext";
import { messageKeyFor } from "../../auth/error-messages";
import { ApiError } from "../../lib/api-client";
import { Button } from "../../components/ui/button";
import { Field, Label } from "../../components/ui/field";
import { Segmented } from "../../components/ui/segmented";
import { cn } from "../../lib/cn";
import { useLookups } from "../transactions/lookups";
import { toneColor } from "../transactions/display";
import { patchMe } from "./api";

/** An ApiError is shown to the person. Anything else is a bug worth a log line. */
function report(error: unknown): void {
  if (!(error instanceof ApiError)) console.error(error);
}

const TONES = TonePalette.options;
const THEMES: ThemePreference[] = ["system", "light", "dark"];

/** Profile card: name, tone and theme. Each change is one PATCH /me. */
export function ProfileSettings() {
  const { t } = useTranslation();
  const { user, setUser } = useAuth();
  const { data: lookups, reload: reloadLookups } = useLookups();
  const [name, setName] = useState(user?.displayName ?? "");
  const [nameError, setNameError] = useState<string | undefined>();
  const [toneError, setToneError] = useState<string | undefined>();
  const [themeError, setThemeError] = useState<string | undefined>();
  // One PATCH at a time: controls stay disabled, so a late answer cannot undo a newer one.
  const [pending, setPending] = useState(false);
  const storedName = user?.displayName;

  // Fresh tones of the other person, every time the screen opens.
  useEffect(() => {
    void reloadLookups();
  }, [reloadLookups]);

  // The stored name is the base of the field. It changes after a save or a reload.
  useEffect(() => {
    if (storedName !== undefined) setName(storedName);
  }, [storedName]);

  if (!user) return null;

  async function save(patch: ProfilePatch, fail: (message: string) => void): Promise<void> {
    setPending(true);
    try {
      setUser(await patchMe(patch));
      await reloadLookups();
    } catch (error) {
      report(error);
      fail(t(messageKeyFor(error)));
    } finally {
      setPending(false);
    }
  }

  const takenByOther = new Set(
    (lookups?.users ?? []).filter((u) => u.id !== user.id).map((u) => u.tonePalette),
  );

  async function saveName(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 80) {
      setNameError(t("settings.profile.nameError"));
      return;
    }
    setNameError(undefined);
    await save({ displayName: trimmed }, setNameError);
  }

  async function pickTone(tone: TonePalette) {
    setToneError(undefined);
    // Pressing the selected tone clears it.
    await save({ tonePalette: user?.tonePalette === tone ? null : tone }, setToneError);
  }

  async function pickTheme(theme: ThemePreference) {
    setThemeError(undefined);
    await save({ theme }, setThemeError);
  }

  return (
    <div className="flex flex-col gap-4 rounded-card bg-surface p-4">
      <div>
        <p className="font-semibold">{user.displayName}</p>
        <p className="text-[0.8rem] text-muted">{user.username}</p>
      </div>
      <form className="flex items-end gap-2" onSubmit={(e) => void saveName(e)}>
        <div className="flex-1">
          <Field
            label={t("settings.profile.name")}
            value={name}
            maxLength={80}
            error={nameError}
            disabled={pending}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={pending || name.trim() === user.displayName}>
          {t("settings.save")}
        </Button>
      </form>
      <div role="group" aria-labelledby="tone-label" className="flex flex-col gap-[3px]">
        <Label id="tone-label">{t("settings.profile.tone")}</Label>
        <div className="flex flex-wrap gap-2">
          {TONES.map((tone) => {
            const selected = user.tonePalette === tone;
            const taken = takenByOther.has(tone);
            return (
              <button
                key={tone}
                type="button"
                aria-pressed={selected}
                disabled={taken || pending}
                onClick={() => void pickTone(tone)}
                className={cn(
                  "flex min-h-[44px] items-center gap-2 rounded-chip border border-line px-3 text-[0.8rem]",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  "disabled:cursor-not-allowed disabled:opacity-40",
                  selected && "border-accent font-semibold",
                )}
              >
                <span
                  aria-hidden
                  className="h-4 w-4 rounded-full"
                  style={{ backgroundColor: toneColor(tone) }}
                />
                {t(`settings.profile.tones.${tone}`)}
              </button>
            );
          })}
        </div>
        {toneError ? (
          <p role="alert" className="text-[0.75rem] text-err">
            {toneError}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-[3px]">
        <Label>{t("settings.profile.theme")}</Label>
        <Segmented
          label={t("settings.profile.theme")}
          value={user.theme}
          disabled={pending}
          onChange={(theme) => void pickTheme(theme)}
          options={THEMES.map((value) => ({
            value,
            label: t(`settings.profile.themes.${value}`),
          }))}
        />
        {themeError ? (
          <p role="alert" className="text-[0.75rem] text-err">
            {themeError}
          </p>
        ) : null}
      </div>
    </div>
  );
}
