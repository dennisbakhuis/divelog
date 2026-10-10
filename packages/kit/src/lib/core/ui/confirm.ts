/**
 * A promise-returning replacement for `window.confirm()`:
 * `if (await confirmDialog({ title: 'Delete dive #650?', danger: true })) …`.
 *
 * `DivelogProvider` mounts the dialog that answers these requests. Without a
 * mounted dialog (a page rendered outside a provider, a unit test) it falls
 * back to the browser's `confirm()`, or to `false` where there is none.
 */

export interface ConfirmOptions {
  title: string;
  /** One or two sentences under the title. */
  body?: string;
  /** The confirming button; default "Confirm", or "Delete" when `danger`. */
  confirmLabel?: string;
  cancelLabel?: string;
  /** A destructive action: the confirm button is styled as danger. */
  danger?: boolean;
}

export interface ConfirmRequest extends Required<Omit<ConfirmOptions, 'body'>> {
  body: string;
  id: number;
  resolve: (ok: boolean) => void;
}

type Host = (request: ConfirmRequest) => void;

let hosts: { id: number; show: Host }[] = [];
let nextHost = 1;
let nextRequest = 1;

/** Register the dialog that shows confirm requests; returns the unregister function. */
export function registerConfirmHost(show: Host): () => void {
  const host = { id: nextHost++, show };
  hosts.push(host);
  return () => {
    hosts = hosts.filter((h) => h.id !== host.id);
  };
}

/** Normalise options into a request with every label filled in. */
export function confirmRequest(
  options: ConfirmOptions,
  resolve: (ok: boolean) => void,
): ConfirmRequest {
  const danger = options.danger ?? false;
  return {
    id: nextRequest++,
    title: options.title,
    body: options.body ?? '',
    confirmLabel: options.confirmLabel ?? (danger ? 'Delete' : 'Confirm'),
    cancelLabel: options.cancelLabel ?? 'Cancel',
    danger,
    resolve,
  };
}

/** Ask the owner to confirm; resolves `true` for confirm, `false` for cancel or Escape. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  const host = hosts[0];
  if (!host) {
    const text = options.body ? `${options.title}\n\n${options.body}` : options.title;
    const native = typeof globalThis.confirm === 'function' ? globalThis.confirm : null;
    return Promise.resolve(native ? native(text) : false);
  }
  return new Promise((resolve) => host.show(confirmRequest(options, resolve)));
}
