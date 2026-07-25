import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

export function PageLayout({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack?: boolean;
  children: ReactNode;
}) {
  const navigate = useNavigate();

  return (
    <div className="mx-auto min-h-full max-w-md pb-24">
      <header className="sticky top-0 z-10 flex items-center gap-2 bg-tg-bg px-4 py-3">
        {onBack && (
          <button onClick={() => navigate(-1)} className="text-xl leading-none text-tg-link">
            ←
          </button>
        )}
        <h1 className="text-lg font-semibold">{title}</h1>
      </header>
      <main className="px-4">{children}</main>
    </div>
  );
}
