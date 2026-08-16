import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { QuickAddSheet } from "../components/tasks/QuickAddSheet";
import type { Task } from "../types";

interface QuickAddOptions {
  workspaceId?: string;
  onCreated?: (task: Task) => void;
}

interface QuickAddContextValue {
  openQuickAdd: (options?: QuickAddOptions) => void;
}

const QuickAddContext = createContext<QuickAddContextValue | undefined>(undefined);

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<QuickAddOptions>({});

  const openQuickAdd = useCallback((opts: QuickAddOptions = {}) => {
    setOptions(opts);
    setOpen(true);
  }, []);

  return (
    <QuickAddContext.Provider value={{ openQuickAdd }}>
      {children}
      <QuickAddSheet
        open={open}
        onClose={() => setOpen(false)}
        defaultWorkspaceId={options.workspaceId}
        onCreated={(task) => options.onCreated?.(task)}
      />
    </QuickAddContext.Provider>
  );
}

export function useQuickAdd(): QuickAddContextValue {
  const ctx = useContext(QuickAddContext);
  if (!ctx) throw new Error("useQuickAdd must be used within QuickAddProvider");
  return ctx;
}
