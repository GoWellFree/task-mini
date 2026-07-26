import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { PageLayout } from "../components/PageLayout";

interface UserSettings {
  default_reminder_minutes: number;
}

export function Profile() {
  const { user, logout, logoutEverywhere } = useAuth();
  const [reminderMinutes, setReminderMinutes] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api
      .get<{ settings: UserSettings }>("/api/v1/users/me/settings")
      .then((res) => setReminderMinutes(res.settings.default_reminder_minutes))
      .catch(() => {});
  }, []);

  async function saveReminderMinutes(value: number) {
    setSaving(true);
    setSaved(false);
    try {
      const res = await api.patch<{ settings: UserSettings }>("/api/v1/users/me/settings", {
        defaultReminderMinutes: value,
      });
      setReminderMinutes(res.settings.default_reminder_minutes);
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

      {reminderMinutes !== null && (
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
              value={reminderMinutes}
              onChange={(e) => setReminderMinutes(Number(e.target.value))}
              onBlur={() => saveReminderMinutes(reminderMinutes)}
              disabled={saving}
              className="w-full rounded-xl bg-tg-bg px-3.5 py-2.5 text-sm disabled:opacity-50"
            />
          </label>
        </div>
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
