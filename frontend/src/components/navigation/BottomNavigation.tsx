import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Sun, CheckSquare, Folder, User } from "lucide-react";
import { FloatingActionButton } from "./FloatingActionButton";
import { haptics } from "../../lib/haptics";

const TOP_LEVEL_ROUTES = ["/", "/my-tasks", "/workspaces", "/profile"];

const items = [
  { to: "/", label: "Сегодня", icon: Sun },
  { to: "/my-tasks", label: "Задачи", icon: CheckSquare },
  { to: "/workspaces", label: "Проекты", icon: Folder },
  { to: "/profile", label: "Профиль", icon: User },
];

/** Only shown on the four primary tab destinations — detail/drill-down screens take over the full screen instead. */
export function isTopLevelRoute(pathname: string): boolean {
  return TOP_LEVEL_ROUTES.includes(pathname);
}

export function BottomNavigation() {
  const location = useLocation();
  const navigate = useNavigate();

  if (!isTopLevelRoute(location.pathname)) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border-subtle bg-surface-primary/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <div className="relative mx-auto grid max-w-content grid-cols-5 items-center px-1 sm:px-4">
        {items.slice(0, 2).map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
        <div className="flex items-center justify-center">
          <FloatingActionButton onClick={() => navigate("/tasks/new")} className="-mt-6" />
        </div>
        {items.slice(2).map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </div>
    </nav>
  );
}

function NavItem({ to, label, icon: Icon }: { to: string; label: string; icon: typeof Sun }) {
  return (
    <NavLink
      to={to}
      end
      onClick={() => haptics.selection()}
      className={({ isActive }) =>
        `flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors duration-150 ${
          isActive ? "text-accent" : "text-content-tertiary"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={22} strokeWidth={isActive ? 2.3 : 1.8} />
          {label}
        </>
      )}
    </NavLink>
  );
}
