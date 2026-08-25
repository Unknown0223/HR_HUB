'use client';

/**
 * App-wide custom confirm / alert dialogs (replaces window.confirm / alert).
 */

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  /** danger = red confirm (delete), primary = blue */
  variant?: 'default' | 'danger' | 'primary';
};

export type AlertOptions = {
  title?: string;
  message: string;
  okText?: string;
  variant?: 'default' | 'danger' | 'primary' | 'success';
};

type PendingConfirm = {
  kind: 'confirm';
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
};

type PendingAlert = {
  kind: 'alert';
  options: AlertOptions;
  resolve: () => void;
};

type Pending = PendingConfirm | PendingAlert;

type Listener = (pending: Pending | null) => void;

let listener: Listener | null = null;
let queue: Pending[] = [];
let current: Pending | null = null;

function flush() {
  if (current || !queue.length) {
    listener?.(current);
    return;
  }
  current = queue.shift() || null;
  listener?.(current);
}

export function __bindDialogHost(fn: Listener | null) {
  listener = fn;
  listener?.(current);
}

export function __resolveDialog(result: boolean | void) {
  if (!current) return;
  if (current.kind === 'confirm') {
    current.resolve(Boolean(result));
  } else {
    current.resolve();
  }
  current = null;
  flush();
}

function isDeleteMessage(message: string) {
  return /удал|уволить|delete|o'chir|o‘chir|ochir/i.test(message);
}

/**
 * Styled confirmation. Default buttons: Подтвердить / Отмена.
 * Delete-like messages get danger styling and Да / Нет.
 */
export function confirm(
  messageOrOptions: string | ConfirmOptions,
  maybeOptions?: Omit<ConfirmOptions, 'message'>,
): Promise<boolean> {
  const base: ConfirmOptions =
    typeof messageOrOptions === 'string'
      ? { message: messageOrOptions, ...maybeOptions }
      : { ...messageOrOptions };

  const destructive = base.variant === 'danger' || isDeleteMessage(base.message);
  const options: ConfirmOptions = {
    title: base.title ?? (destructive ? 'Удаление' : 'Подтверждение'),
    message: base.message,
    confirmText: base.confirmText ?? (destructive ? 'Да' : 'Подтвердить'),
    cancelText: base.cancelText ?? (destructive ? 'Нет' : 'Отмена'),
    variant: base.variant ?? (destructive ? 'danger' : 'primary'),
  };

  return new Promise<boolean>((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }
    if (!listener) {
      // Host not mounted (rare) — last resort native confirm
      resolve(window.confirm(options.message));
      return;
    }
    queue.push({ kind: 'confirm', options, resolve });
    flush();
  });
}

/** Styled alert (OK only). */
export function alert(
  messageOrOptions: string | AlertOptions,
  maybeOptions?: Omit<AlertOptions, 'message'>,
): Promise<void> {
  const base: AlertOptions =
    typeof messageOrOptions === 'string'
      ? { message: messageOrOptions, ...maybeOptions }
      : { ...messageOrOptions };

  const options: AlertOptions = {
    title: base.title ?? 'Сообщение',
    message: base.message,
    okText: base.okText ?? 'OK',
    variant: base.variant ?? 'default',
  };

  return new Promise<void>((resolve) => {
    if (typeof window === 'undefined') {
      resolve();
      return;
    }
    if (!listener) {
      window.alert(options.message);
      resolve();
      return;
    }
    queue.push({ kind: 'alert', options, resolve });
    flush();
  });
}
