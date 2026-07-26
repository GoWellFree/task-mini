import { useAuth } from "../lib/AuthContext";
import { PageLayout } from "../components/PageLayout";

export function Profile() {
  const { user, logout, logoutEverywhere } = useAuth();

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
