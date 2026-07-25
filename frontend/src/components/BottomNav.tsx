import { NavLink, useNavigate } from "react-router-dom";

const items = [
  { to: "/", label: "Главная", icon: "🏠" },
  { to: "/my-tasks", label: "Мои задачи", icon: "✅" },
  { to: "/workspaces", label: "Группы", icon: "👥" },
  { to: "/profile", label: "Профиль", icon: "👤" },
];

export function BottomNav() {
  const navigate = useNavigate();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-black/5 bg-tg-bg pb-[env(safe-area-inset-bottom)]">
      <div className="relative mx-auto flex max-w-md items-center justify-around px-2 py-1.5">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-xs ${
                isActive ? "text-tg-link" : "text-tg-hint"
              }`
            }
          >
            <span className="text-lg leading-none">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </div>
      <button
        onClick={() => navigate("/tasks/new")}
        aria-label="Создать задачу"
        className="absolute -top-7 left-1/2 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-tg-button text-3xl text-tg-buttonText shadow-lg"
      >
        +
      </button>
    </nav>
  );
}
