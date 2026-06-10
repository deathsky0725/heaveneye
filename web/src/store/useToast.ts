import { useMemo } from 'react';
import { useToastStore, type ToastType } from './toastStore';

/**
 * Stable toast hook — returns a memoised object so it can safely appear in
 * useEffect dependency arrays without triggering re-runs every render.
 *
 * addToast/removeToast from zustand are stable references already, so we can
 * memoise with an empty dep array.
 */
export function useToast() {
  return useMemo(() => {
    const { addToast, removeToast } = useToastStore.getState();
    return {
      success: (message: string) => addToast(message, 'success'),
      error:   (message: string) => addToast(message, 'error'),
      info:    (message: string) => addToast(message, 'info'),
      warning: (message: string) => addToast(message, 'warning'),
      toast:   (message: string, type?: ToastType) => addToast(message, type),
      dismiss: removeToast,
    };
  }, []);
}