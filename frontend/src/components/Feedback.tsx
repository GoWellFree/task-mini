export function Loading({ label = "Загрузка..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-tg-hint">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-tg-hint border-t-transparent" />
      <p className="mt-3 text-sm">{label}</p>
    </div>
  );
}

export function ErrorMessage({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="mx-4 my-4 rounded-xl bg-red-50 p-4 text-red-700">
      <p className="text-sm">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-2 text-sm font-medium underline">
          Повторить
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center text-tg-hint">
      <p className="text-base font-medium">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-sm">{hint}</p>}
    </div>
  );
}
