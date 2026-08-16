import { AlertCircle } from "lucide-react";

export function Loading({ label = "Загрузка..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-content-tertiary">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-content-tertiary border-t-transparent" />
      <p className="mt-3 text-sm">{label}</p>
    </div>
  );
}

export function ErrorMessage({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="mx-4 my-4 flex flex-col items-center gap-2 rounded-lg bg-danger-soft p-5 text-center">
      <AlertCircle size={22} className="text-danger" />
      <p className="text-sm text-danger">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-1 text-sm font-semibold text-danger underline underline-offset-2">
          Повторить
        </button>
      )}
    </div>
  );
}

