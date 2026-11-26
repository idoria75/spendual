import * as RadixToast from "@radix-ui/react-toast";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

interface ToastValue {
  showToast: (message: string) => void;
}

const ToastContext = createContext<ToastValue | null>(null);

/** Short success toast (ui-guidelines §6.9). One at a time, gone after 4 seconds. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const showToast = useCallback((message: string) => {
    setToast((prev) => ({ id: (prev?.id ?? 0) + 1, message }));
  }, []);
  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      <RadixToast.Provider duration={4000} swipeDirection="down">
        {children}
        {toast ? (
          <RadixToast.Root
            key={toast.id}
            onOpenChange={(open) => {
              if (!open) setToast(null);
            }}
            className="rounded-card bg-fg px-4 py-3 text-[0.88rem] font-semibold text-bg"
          >
            <RadixToast.Description>{toast.message}</RadixToast.Description>
          </RadixToast.Root>
        ) : null}
        <RadixToast.Viewport className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] m-0 flex list-none justify-center px-4 outline-none md:bottom-6" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
