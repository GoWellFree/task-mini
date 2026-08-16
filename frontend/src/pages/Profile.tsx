import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { PageLayout } from "../components/PageLayout";
import type { UserSettings } from "../types";

export function Profile() {
  const { user, logout, logoutEverywhere } = useAuth();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [timezone, setTimezone] = useState("");
  const [timezoneSaved, setTimezoneSaved] = useState(false);
  const [timezoneError, setTimezoneError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ settings: UserSettings }>("/api/v1/users/me/settings")
      .then((res) => setSettings(res.settings))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (user) setTimezone(user.timezone);
  }, [user]);

  async function saveSettings(patch: Record<string, unknown>) {
    setSaving(true);
    setSaved(false);
    try {
      const res = await api.patch<{ settings: UserSettings }>("/api/v1/users/me/settings", patch);
      setSettings(res.settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      // Non-critical setting — surfacing a full-page error would be
      // disproportionate; the value just silently doesn't update.
      console.error(err instanceof ApiError ? err.message : err);
    } finally {
      setSaving(false);
    }
  }

  async function saveTimezone(tz: string) {
    setTimezoneError(null);
    try {
      await api.patch("/api/v1/users/me", { timezone: tz });
      setTimezoneSaved(true);
      setTimeout(() => setTimezoneSaved(false), 2000);
    } catch (err) {
      setTimezoneError(err instanceof ApiError ? err.message : "Не удалось сохранить часовой пояс");
    }
  }

  function detectTimezone() {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setTimezone(detected);
    void saveTimezone(detected);
  }

  if (!user) return null;

  return (
    <PageLayout title="Профиль">
      <div className="flex flex-col items-center py-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-tg-button text-2xl font-semibold text-tg-buttonText">
          {user.first_name.charAt(0)}
        </div>
        <p className="mt-3 text-lg font-semibold">
          {user.first_name} {user.last_name ?? ""}
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-2 rounded-xl bg-tg-secondaryBg p-4 text-sm">
        <Row label="Telegram username" value={user.username ? `@${user.username}` : "—"} />
        <Row label="Telegram ID" value={String(user.telegram_id)} />
      </div>

      {settings && (
        <>
          <div className="mt-4 rounded-xl bg-tg-secondaryBg p-4">
            <label className="block">
              <span className="mb-1.5 flex items-center justify-between text-sm font-medium text-tg-hint">
                <span>Напоминать о сроке за (минут)</span>
                {saved && <span className="text-xs text-green-600">Сохранено ✓</span>}
              </span>
              <input
                type="number"
                min={0}
                max={60 * 24 * 7}
                value={settings.default_reminder_minutes}
                onChange={(e) => setSettings({ ...settings, default_reminder_minutes: Number(e.target.value) })}
                onBlur={() => saveSettings({ defaultReminderMinutes: settings.default_reminder_minutes })}
                disabled={saving}
                className="w-full rounded-xl bg-tg-bg px-3.5 py-2.5 text-sm disabled:opacity-50"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-col gap-3 rounded-xl bg-tg-secondaryBg p-4">
            <h3 className="text-sm font-medium text-tg-hint">Сводки и часовой пояс</h3>

            <div className="flex flex-col gap-2 rounded-lg bg-tg-bg px-3.5 py-2.5">
              <label className="text-xs text-tg-hint">Часовой пояс</label>
              <div className="flex gap-2">
                <input
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  onBlur={() => timezone && timezone !== user.timezone && void saveTimezone(timezone)}
                  placeholder="Europe/Moscow"
                  className="flex-1 rounded-lg border border-tg-hint/30 bg-tg-secondaryBg px-2.5 py-1.5 text-sm"
                />
                <button
                  onClick={detectTimezone}
                  className="shrink-0 rounded-lg bg-tg-button px-2.5 py-1.5 text-xs font-medium text-tg-buttonText"
                >
                  Определить
                </button>
              </div>
              {timezoneSaved && <span className="text-xs text-green-600">Сохранено ✓</span>}
              {timezoneError && <span className="text-xs text-red-600">{timezoneError}</span>}
            </div>

            <ToggleRow
              label="Утренняя сводка"
              checked={settings.daily_digest_enabled}
              onChange={(v) => saveSettings({ dailyDigestEnabled: v })}
            />
            {settings.daily_digest_enabled && (
              <label className="flex items-center justify-between gap-2 rounded-lg bg-tg-bg px-3.5 py-2.5 text-sm">
                <span className="text-tg-hint">Время</span>
                <input
                  type="time"
                  value={settings.daily_digest_time.slice(0, 5)}
                  onChange={(e) => setSettings({ ...settings, daily_digest_time: e.target.value })}
                  onBlur={() => saveSettings({ dailyDigestTime: settings.daily_digest_time })}
                  className="rounded-lg border border-tg-hint/30 bg-tg-secondaryBg px-2.5 py-1.5 text-sm"
                />
              </label>
            )}

            <ToggleRow
              label="Вечерняя сводка (18:00)"
              checked={settings.evening_digest_enabled}
              onChange={(v) => saveSettings({ eveningDigestEnabled: v })}
            />

            <div className="flex items-center justify-between gap-2 rounded-lg bg-tg-bg px-3.5 py-2.5 text-sm">
              <span className="text-tg-hint">Не беспокоить с</span>
              <input
                type="time"
                value={settings.quiet_hours_start?.slice(0, 5) ?? ""}
                onChange={(e) => setSettings({ ...settings, quiet_hours_start: e.target.value || null })}
                onBlur={() => saveSettings({ quietHoursStart: settings.quiet_hours_start })}
                className="rounded-lg border border-tg-hint/30 bg-tg-secondaryBg px-2.5 py-1.5 text-sm"
              />
            </div>
            <div className="flex items-center justify-between gap-2 rounded-lg bg-tg-bg px-3.5 py-2.5 text-sm">
              <span className="text-tg-hint">до</span>
              <input
                type="time"
                value={settings.quiet_hours_end?.slice(0, 5) ?? ""}
                onChange={(e) => setSettings({ ...settings, quiet_hours_end: e.target.value || null })}
                onBlur={() => saveSettings({ quietHoursEnd: settings.quiet_hours_end })}
                className="rounded-lg border border-tg-hint/30 bg-tg-secondaryBg px-2.5 py-1.5 text-sm"
              />
            </div>
          </div>
        </>
      )}

      <button
        onClick={logout}
        className="mt-6 w-full rounded-xl bg-tg-secondaryBg py-3 text-sm font-medium text-red-600"
      >
        Выйти
      </button>

      <button
        onClick={logoutEverywhere}
        className="mt-2 w-full rounded-xl bg-tg-secondaryBg py-3 text-sm font-medium text-red-600"
      >
        Выйти на всех устройствах
      </button>
    </PageLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-tg-hint">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 rounded-lg bg-tg-bg px-3.5 py-2.5 text-sm">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
    </label>
  );
}
