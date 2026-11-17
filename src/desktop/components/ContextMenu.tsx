import { useLayoutEffect, useRef, type ReactNode } from 'react';

interface ContextMenuProps {
  x: number;
  y: number;
  label: string;
  children: ReactNode;
  contained?: boolean;
  onDismiss: () => void;
}

export function ContextMenu({ x, y, label, children, contained = false, onDismiss }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.querySelector('button')?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      ref={ref}
      className={`desktop-menu ui-panel ui-material ${contained ? 'file-menu' : ''}`}
      role="group"
      aria-label={label}
      style={{ left: x, top: y }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          trigger.current?.focus({ preventScroll: true });
          onDismiss();
          return;
        }
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'ArrowDown' ? (current + 1) % buttons.length
          : event.key === 'ArrowUp' ? (current - 1 + buttons.length) % buttons.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : -1;
        if (next < 0) return;
        event.preventDefault();
        buttons[next]?.focus({ preventScroll: true });
      }}
    >
      {children}
    </div>
  );
}
