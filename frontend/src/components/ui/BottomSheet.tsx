import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Centers as a dialog instead of docking to the bottom — used by Modal. */
  centered?: boolean;
}

export function BottomSheet({ open, onClose, title, children, centered }: BottomSheetProps) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-40 flex bg-surface-overlay animate-nova-fade-in ${
        centered ? "items-center justify-center p-4" : "items-end justify-center sm:items-center sm:p-4"
      }`}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-h-[88vh] overflow-y-auto bg-surface-elevated shadow-sheet ${
          centered
            ? "max-w-sm animate-nova-scale-in rounded-xl"
            : "max-w-lg animate-nova-sheet-in rounded-t-xl pb-[env(safe-area-inset-bottom)] sm:animate-nova-scale-in sm:rounded-xl"
        }`}
      >
        {!centered && (
          <div className="flex justify-center pb-1 pt-2.5 sm:hidden">
            <div className="h-1.5 w-10 rounded-pill bg-border-subtle" />
          </div>
        )}
        {title && (
          <div className="px-5 pb-3 pt-3 sm:pt-5">
            <h2 className="text-lg font-semibold text-content-primary">{title}</h2>
          </div>
        )}
        <div className="px-5 pb-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function Modal(props: Omit<BottomSheetProps, "centered">) {
  return <BottomSheet {...props} centered />;
}
