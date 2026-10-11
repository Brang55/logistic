import { useCallback, useEffect, useState } from "react";

const VISIBLE_MS = 6000;

export interface ToastMessage {
  text: string;
  action?: { label: string; run: () => void };
}

/** A short confirmation at the bottom of the screen, optionally with an action such as Undo. */
export const useToast = () => {
  const [toast, setToast] = useState<ToastMessage>();
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(undefined), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [toast]);
  const show = useCallback((text: string, action?: ToastMessage["action"]) => setToast({ text, action }), []);
  const dismiss = useCallback(() => setToast(undefined), []);
  return { toast, show, dismiss };
};
