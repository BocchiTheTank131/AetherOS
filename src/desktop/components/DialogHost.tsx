// AetherOS - System Dialog Host Component
// Renders native desktop modal dialogs with focus trapping, keyboard navigation, and theme awareness.
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { dialogService, type DialogRequest } from '../../core/dialog';
import { useSystem } from '../../core/context';
import {
  Info,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  X,
} from 'lucide-react';

export const DialogHost: React.FC = () => {
  const { theme } = useSystem();
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

  // Auto-focus on open
  useEffect(() => {
    if (!currentDialog) return;

    const timer = setTimeout(() => {
      if (currentDialog.type === 'prompt' && inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      } else if (confirmBtnRef.current) {
        confirmBtnRef.current.focus();
      }
    }, 50);

    return () => clearTimeout(timer);
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

      if (e.key === 'Enter') {
        // If in input and Enter pressed, confirm
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

        if (e.shiftKey && document.activeElement === first) {
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

  const isLight = theme.mode === 'light';

  const getLevelIcon = () => {
    switch (currentDialog.level) {
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-amber-400" />;
      case 'error':
        return <AlertOctagon className="w-5 h-5 text-red-400" />;
      case 'info':
      default:
        return <Info className="w-5 h-5 text-cyan-400" />;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="aether-dialog-title"
      aria-describedby="aether-dialog-message"
      className="fixed inset-0 z-[100000] flex items-center justify-center p-4 select-none font-sans bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && currentDialog.type === 'alert') {
          handleCancel();
        }
      }}
    >
      <div
        ref={dialogCardRef}
        className={`w-full max-w-md rounded-2xl shadow-2xl border overflow-hidden flex flex-col transition-all duration-150 ${
          isLight
            ? 'bg-white/95 border-gray-300 text-gray-900 shadow-xl'
            : theme.blur
            ? 'glass-panel text-white'
            : 'bg-[#151b28] border-gray-700/80 text-white'
        }`}
      >
        {/* Header */}
        <div
          className={`px-5 py-3.5 flex items-center justify-between border-b ${
            isLight ? 'bg-gray-100/80 border-gray-200' : 'bg-gray-900/60 border-gray-800'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {getLevelIcon()}
            <h2
              id="aether-dialog-title"
              className={`text-sm font-semibold truncate ${isLight ? 'text-gray-900' : 'text-gray-100'}`}
            >
              {currentDialog.title}
            </h2>
          </div>
          <button
            onClick={handleCancel}
            aria-label="Close dialog"
            className={`p-1 rounded-lg transition-colors ${
              isLight ? 'hover:bg-gray-200 text-gray-500' : 'hover:bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message & Body */}
        <div className="p-5 flex-1 flex flex-col gap-3">
          <p
            id="aether-dialog-message"
            className={`text-xs leading-relaxed break-words whitespace-pre-wrap ${
              isLight ? 'text-gray-700' : 'text-gray-300'
            }`}
          >
            {currentDialog.message}
          </p>

          {currentDialog.type === 'prompt' && (
            <div className="mt-1 flex flex-col gap-1.5">
              <input
                ref={inputRef}
                type={currentDialog.inputType || 'text'}
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  if (validationError) setValidationError(null);
                }}
                placeholder={currentDialog.placeholder}
                className={`w-full px-3 py-2 rounded-lg text-xs font-mono outline-none border transition-colors ${
                  validationError
                    ? 'border-red-500 bg-red-500/10'
                    : isLight
                    ? 'bg-gray-50 border-gray-300 focus:border-cyan-500 text-gray-900'
                    : 'bg-gray-900/80 border-gray-700 focus:border-cyan-400 text-white'
                }`}
              />
              {validationError && (
                <span className="text-[11px] text-red-400 font-medium">{validationError}</span>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          className={`px-5 py-3.5 flex items-center justify-end gap-2.5 border-t ${
            isLight ? 'bg-gray-50 border-gray-200' : 'bg-gray-900/40 border-gray-800/80'
          }`}
        >
          {currentDialog.type !== 'alert' && (
            <button
              ref={cancelBtnRef}
              onClick={handleCancel}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isLight
                  ? 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                  : 'bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white'
              }`}
            >
              {currentDialog.cancelText || 'Cancel'}
            </button>
          )}

          <button
            ref={confirmBtnRef}
            onClick={handleConfirm}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold shadow-md transition-all active:scale-95 ${
              currentDialog.danger
                ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-500/20'
                : 'bg-cyan-500 hover:bg-cyan-400 text-black shadow-cyan-500/20'
            }`}
          >
            {currentDialog.confirmText || (currentDialog.type === 'alert' ? 'OK' : 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  );
};
