export type ToastKind = 'success' | 'error';

export interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
}

const TOAST_DURATION_MS = 5000;

function createToastStore() {
  const items = $state<ToastItem[]>([]);

  function show({ kind, message }: { kind: ToastKind; message: string }) {
    const id = crypto.randomUUID();
    items.push({ id, kind, message });

    setTimeout(() => {
      dismiss(id);
    }, TOAST_DURATION_MS);
  }

  function dismiss(id: string) {
    const idx = items.findIndex((t) => t.id === id);
    if (idx !== -1) items.splice(idx, 1);
  }

  return {
    get items() {
      return items;
    },
    show,
    dismiss,
  };
}

export const toast = createToastStore();
