// AetherOS - System Dialog Host Component
// Renders native desktop modal dialogs with focus trapping, keyboard navigation, and theme awareness.
import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { dialogService, type DialogRequest } from '../../core/dialog';
import {
  Info,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  X,
} from 'lucide-react';

export const DialogHost: React.FC = () => {
  const [currentDialog, setCurrentDialog] = useState<DialogRequest | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const dialogCardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    return dialogService.subscribe((dlg) => {
      setCurrentDialog(dlg);
      if (dlg && dlg.type === 'prompt') {
        setInputValue(dlg.defaultValue || '');
        setValidationError(null);
      }
    });
  }, []);

  useLayoutEffect(() => {
    if (!currentDialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (currentDialog.type === 'prompt') {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else {
      (currentDialog.danger ? cancelBtnRef.current : confirmBtnRef.current)?.focus();
    }
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [currentDialog]);

  const handleConfirm = useCallback(() => {
    if (!currentDialog) return;
    if (currentDialog.type === 'prompt') {
      if (currentDialog.validate) {
        const error = currentDialog.validate(inputValue);
        if (error) {
          setValidationError(error);
          return;
        }
      }
      currentDialog.resolve(inputValue);
    } else if (currentDialog.type === 'confirm') {
      currentDialog.resolve(true);
    } else {
      currentDialog.resolve(undefined);
    }
  }, [currentDialog, inputValue]);

  const handleCancel = useCallback(() => {
    if (!currentDialog) return;
    if (currentDialog.type === 'prompt') {
      currentDialog.resolve(null);
    } else if (currentDialog.type === 'confirm') {
      currentDialog.resolve(false);
    } else {
      currentDialog.resolve(undefined);
    }
  }, [currentDialog]);

  // Keyboard navigation & Focus Trapping
  useEffect(() => {
    if (!currentDialog) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleCancel();
        return;
      }

      if (e.key === 'Enter' && e.target === inputRef.current) {
        e.preventDefault();
        e.stopPropagation();
        handleConfirm();
        return;
      }

      // Tab trap
      if (e.key === 'Tab') {
        const focusableElements = dialogCardRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusableElements || focusableElements.length === 0) return;

        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];

        if (!dialogCardRef.current?.contains(document.activeElement)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [currentDialog, handleConfirm, handleCancel]);

  if (!currentDialog) return null;


  const getLevelIcon = () => {
    switch (currentDialog.level) {
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-positive" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-caution" />;
      case 'error':
        return <AlertOctagon className="w-5 h-5 text-danger" />;
      case 'info':
      default:
        return <Info className="w-5 h-5 text-accent" />;
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="aether-dialog-title" aria-describedby="aether-dialog-message"
      className="system-dialog-scrim" onClick={(event) => {
        if (event.target === event.currentTarget && currentDialog.type === 'alert') handleCancel();
      }}>
      <div ref={dialogCardRef} className="system-dialog ui-material ui-panel">
        <header className="panel-heading">
          {getLevelIcon()}
          <h2 className="flex-1 min-w-0" id="aether-dialog-title">{currentDialog.title}</h2>
          <button onClick={handleCancel} aria-label="Close dialog" className="dock-system-button"><X size={17} /></button>
        </header>
        <div className="system-dialog-message space-y-3">
          <p id="aether-dialog-message" className="text-secondary break-words whitespace-pre-wrap">{currentDialog.message}</p>
          {currentDialog.type === 'prompt' && (
            <>
              <input ref={inputRef} className="ui-input w-full" aria-label={currentDialog.title}
                aria-invalid={Boolean(validationError)} aria-describedby={validationError ? 'aether-dialog-error' : undefined}
                type={currentDialog.inputType || 'text'} value={inputValue} placeholder={currentDialog.placeholder}
                onChange={(event) => { setInputValue(event.target.value); if (validationError) setValidationError(null); }} />
              {validationError && <p className="text-xs text-danger" id="aether-dialog-error" role="alert">{validationError}</p>}
            </>
          )}
        </div>
        <footer className="system-dialog-actions">
          {currentDialog.type !== 'alert' && <button ref={cancelBtnRef} className="ui-button" onClick={handleCancel}>{currentDialog.cancelText || 'Cancel'}</button>}
          <button ref={confirmBtnRef} className={`ui-button ${currentDialog.danger ? 'danger' : 'primary'}`} onClick={handleConfirm}>
            {currentDialog.confirmText || (currentDialog.type === 'alert' ? 'OK' : 'Confirm')}
          </button>
        </footer>
      </div>
    </div>
  );
};
