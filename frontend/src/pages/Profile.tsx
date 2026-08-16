import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Avatar } from "../components/ui/Avatar";
import { Switch } from "../components/ui/Switch";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { TimePicker } from "../components/ui/TimePicker";
import { Input } from "../components/ui/Input";
import { ActionSheet } from "../components/ui/ActionSheet";
import { useToast } from "../components/ui/Toast";
import { getThemePreference, setThemePreference, type ThemePreference } from "../lib/theme";
import type { UserSettings } from "../types";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "telegram", label: "Как в Telegram" },
  { value: "light", label: "Светлая" },
  { value: "dark", label: "Тёмная" },
];

export function Profile() {
  const { user, logout, logoutEverywhere } = useAuth();
  const { showToast } = useToast();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [timezone, setTimezone] = useState("");
  const [theme, setTheme] = useState<ThemePreference>(getThemePreference());
  const [confirmingLogoutEverywhere, setConfirmingLogoutEverywhere] = useState(false);

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
    try {
      const res = await api.patch<{ settings: UserSettings }>("/api/v1/users/me/settings", patch);
      setSettings(res.settings);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Не удалось сохранить настройку", { tone: "error" });
    }
  }

  async function saveTimezone(tz: string) {
    try {
      await api.patch("/api/v1/users/me", { timezone: tz });
      showToast("Часовой пояс сохранён", { tone: "success" });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Не удалось сохранить часовой пояс", { tone: "error" });
    }
  }

  function detectTimezone() {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setTimezone(detected);
    void saveTimezone(detected);
  }

  function changeTheme(next: ThemePreference) {
    setTheme(next);
    setThemePreference(next);
  }

  if (!user) return null;

  return (
    <div className="mx-auto min-h-full w-full max-w-content px-4 pb-28 pt-[calc(env(safe-area-inset-top)+16px)]">
      <PageHeader title="Профиль" />

      <div className="flex flex-col items-center py-2">
        <Avatar firstName={user.first_name} lastName={user.last_name} size={48} className="text-xl" />
        <p className="mt-3 text-lg font-semibold text-content-primary">
          {user.first_name} {user.last_name ?? ""}
        </p>
        {user.username && <p className="text-sm text-content-tertiary">@{user.username}</p>}
      </div>

      <Section title="Аккаунт">
        <Row label="Telegram ID" value={String(user.telegram_id)} />
      </Section>

      <Section title="Тема">
        <SegmentedControl options={THEME_OPTIONS} value={theme} onChange={changeTheme} />
      </Section>

      <Section title="Часовой пояс">
        <div className="flex gap-2">
          <Input
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            onBlur={() => timezone && timezone !== user.timezone && void saveTimezone(timezone)}
            placeholder="Europe/Moscow"
            className="flex-1"
          />
          <button onClick={detectTimezone} className="shrink-0 rounded-lg bg-accent px-3 text-sm font-medium text-white">
            Определить
          </button>
        </div>
      </Section>

      {settings && (
        <Section title="Настройки задач">
          <label className="flex items-center justify-between gap-3 py-1">
            <span className="text-sm text-content-primary">Напоминать о сроке за (мин)</span>
            <input
              type="number"
              min={0}
              max={60 * 24 * 7}
              value={settings.default_reminder_minutes}
              onChange={(e) => setSettings({ ...settings, default_reminder_minutes: Number(e.target.value) })}
              onBlur={() => saveSettings({ defaultReminderMinutes: settings.default_reminder_minutes })}
              className="h-9 w-20 rounded-lg border border-border-subtle bg-surface-primary px-2 text-right text-sm"
            />
          </label>
        </Section>
      )}

      {settings && (
        <Section title="Уведомления и сводки">
          <ToggleRow label="Утренняя сводка" checked={settings.daily_digest_enabled} onChange={(v) => saveSettings({ dailyDigestEnabled: v })} />
          {settings.daily_digest_enabled && (
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-content-secondary">Время</span>
              <div className="w-32">
                <TimePicker
                  value={settings.daily_digest_time.slice(0, 5)}
                  onChange={(v) => {
                    setSettings({ ...settings, daily_digest_time: v });
                    saveSettings({ dailyDigestTime: v });
                  }}
                />
              </div>
            </div>
          )}

          <ToggleRow label="Вечерняя сводка (18:00)" checked={settings.evening_digest_enabled} onChange={(v) => saveSettings({ eveningDigestEnabled: v })} />

          <div className="flex items-center justify-between py-1">
            <span className="text-sm text-content-secondary">Не беспокоить с</span>
            <div className="w-32">
              <TimePicker
                value={settings.quiet_hours_start?.slice(0, 5) ?? ""}
                onChange={(v) => {
                  setSettings({ ...settings, quiet_hours_start: v || null });
                  saveSettings({ quietHoursStart: v || null });
                }}
              />
            </div>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-sm text-content-secondary">до</span>
            <div className="w-32">
              <TimePicker
                value={settings.quiet_hours_end?.slice(0, 5) ?? ""}
                onChange={(v) => {
                  setSettings({ ...settings, quiet_hours_end: v || null });
                  saveSettings({ quietHoursEnd: v || null });
                }}
              />
            </div>
          </div>
        </Section>
      )}

      <div className="mt-6 flex flex-col gap-2">
        <button onClick={logout} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-surface-secondary text-sm font-medium text-danger">
          <LogOut size={16} /> Выйти
        </button>
        <button onClick={() => setConfirmingLogoutEverywhere(true)} className="h-11 w-full rounded-lg text-sm font-medium text-danger">
          Выйти на всех устройствах
        </button>
      </div>

      <ActionSheet
        open={confirmingLogoutEverywhere}
        onClose={() => setConfirmingLogoutEverywhere(false)}
        title="Выйти на всех устройствах? Все активные сессии будут завершены."
        items={[{ label: "Выйти на всех устройствах", tone: "danger", onSelect: logoutEverywhere }]}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-content-secondary">{title}</h3>
      <Card className="flex flex-col gap-2.5 divide-y divide-border-subtle p-4">{children}</Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1 text-sm">
      <span className="text-content-secondary">{label}</span>
      <span className="font-medium text-content-primary">{value}</span>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-content-primary">{label}</span>
      <Switch checked={checked} onChange={onChange} aria-label={label} />
    </div>
  );
}
