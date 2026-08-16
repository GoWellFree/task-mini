import { useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "./ui/PageHeader";
import { bindTelegramBackButton } from "../lib/telegram";

interface PageLayoutProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Detail/drill-down screen: compact header with a back arrow (wired to Telegram's native BackButton), no bottom-nav spacing reserved. */
  onBack?: boolean;
  headerAction?: ReactNode;
  children: ReactNode;
}

export function PageLayout({ title, subtitle, onBack, headerAction, children }: PageLayoutProps) {
  const navigate = useNavigate();
  const goBack = onBack ? () => navigate(-1) : undefined;

  useEffect(() => {
    if (!goBack) return;
    return bindTelegramBackButton(goBack);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onBack]);

  return (
    <div className={`mx-auto min-h-full w-full max-w-content px-4 ${onBack ? "pb-10" : "pb-28"}`}>
      {onBack ? (
        <header className="sticky top-0 z-10 -mx-4 flex items-center gap-1 bg-surface-secondary/95 px-2 pb-2 pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur">
          <button
            onClick={goBack}
            aria-label="Назад"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-content-primary active:bg-surface-secondary"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-[17px] font-semibold text-content-primary">{title}</h1>
          {headerAction && <div className="shrink-0">{headerAction}</div>}
        </header>
      ) : (
        <div className="pt-[calc(env(safe-area-inset-top)+16px)]">
          <PageHeader title={title} subtitle={subtitle} action={headerAction} />
        </div>
      )}
      <main>{children}</main>
    </div>
  );
}
