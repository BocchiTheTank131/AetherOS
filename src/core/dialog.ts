// AetherOS - Centralized System Dialog Service
// Replaces native browser alert(), confirm(), and prompt() with accessible, themeable desktop modal dialogs.

export type DialogLevel = 'info' | 'success' | 'warning' | 'error';

export interface DialogButton {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
  value?: unknown;
}

export interface DialogRequest {
  id: string;
  type: 'alert' | 'confirm' | 'prompt';
  title?: string;
  message: string;
  level?: DialogLevel;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  defaultValue?: string;
  placeholder?: string;
  inputType?: 'text' | 'password';
  validate?: (val: string) => string | null;
  resolve: (val: any) => void;
}

type DialogListener = (dialog: DialogRequest | null) => void;

class DialogService {
  private queue: DialogRequest[] = [];
  private current: DialogRequest | null = null;
  private listeners: Set<DialogListener> = new Set();

  public subscribe(listener: DialogListener): () => void {
    this.listeners.add(listener);
    listener(this.current);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(this.current);
    }
  }

  private processQueue() {
    if (this.current || this.queue.length === 0) return;
    this.current = this.queue.shift() || null;
    this.notify();
  }

  public alert(options: {
    title?: string;
    message: string;
    level?: DialogLevel;
    okText?: string;
  } | string): Promise<void> {
    return new Promise<void>((resolve) => {
      const opts = typeof options === 'string' ? { message: options } : options;
      const req: DialogRequest = {
        id: `dlg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'alert',
        title: opts.title || (opts.level === 'error' ? 'Error' : opts.level === 'warning' ? 'Warning' : 'Information'),
        message: opts.message,
        level: opts.level || 'info',
        confirmText: opts.okText || 'OK',
        resolve: () => {
          this.close(req.id);
          resolve();
        },
      };
      this.queue.push(req);
      this.processQueue();
    });
  }

  public confirm(options: {
    title?: string;
    message: string;
    level?: DialogLevel;
    confirmText?: string;
    cancelText?: string;
    danger?: boolean;
  } | string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const opts = typeof options === 'string' ? { message: options } : options;
      const req: DialogRequest = {
        id: `dlg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'confirm',
        title: opts.title || (opts.danger ? 'Confirm Action' : 'Confirmation'),
        message: opts.message,
        level: opts.level || (opts.danger ? 'warning' : 'info'),
        confirmText: opts.confirmText || 'Confirm',
        cancelText: opts.cancelText || 'Cancel',
        danger: opts.danger ?? false,
        resolve: (val: boolean) => {
          this.close(req.id);
          resolve(val);
        },
      };
      this.queue.push(req);
      this.processQueue();
    });
  }

  public prompt(options: {
    title?: string;
    message: string;
    defaultValue?: string;
    placeholder?: string;
    confirmText?: string;
    cancelText?: string;
    inputType?: 'text' | 'password';
    validate?: (val: string) => string | null;
  } | string): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      const opts = typeof options === 'string' ? { message: options } : options;
      const req: DialogRequest = {
        id: `dlg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'prompt',
        title: opts.title || 'Input Required',
        message: opts.message,
        defaultValue: opts.defaultValue || '',
        placeholder: opts.placeholder || '',
        confirmText: opts.confirmText || 'OK',
        cancelText: opts.cancelText || 'Cancel',
        inputType: opts.inputType || 'text',
        validate: opts.validate,
        resolve: (val: string | null) => {
          this.close(req.id);
          resolve(val);
        },
      };
      this.queue.push(req);
      this.processQueue();
    });
  }

  public close(dialogId?: string) {
    if (this.current && (!dialogId || this.current.id === dialogId)) {
      this.current = null;
      this.notify();
      this.processQueue();
    }
  }

  public getCurrent(): DialogRequest | null {
    return this.current;
  }

  public isOpen(): boolean {
    return this.current !== null;
  }
}

export const dialogService = new DialogService();
