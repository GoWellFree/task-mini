import type { ReactNode } from "react";
import { BottomSheet } from "./BottomSheet";

export interface ActionSheetItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
}

/**
 * The mobile-native equivalent of a desktop dropdown menu: a bottom sheet
 * listing tappable actions (long-press quick actions, "⋮" overflow menus).
 * Floating popovers fight z-index/overflow inside a scrollable Mini App
 * page far more than they help here.
 */
export function ActionSheet({
  open,
  onClose,
  title,
  items,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  items: ActionSheetItem[];
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-1">
        {items.map((item, i) => (
          <button
            key={i}
            disabled={item.disabled}
            onClick={() => {
              item.onSelect();
              onClose();
            }}
            className={`flex items-center gap-3 rounded-lg px-3 py-3 text-left text-[15px] font-medium transition-colors duration-150 active:bg-surface-secondary disabled:opacity-40 ${
              item.tone === "danger" ? "text-danger" : "text-content-primary"
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
