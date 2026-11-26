"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { XIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils/cn";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  maxWidthClass?: string;
  closeDisabled?: boolean;
}

/**
 * Accessible high-contrast Neubrutalism modal dialog with Escape key & focus restoration.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidthClass = "max-w-lg",
  closeDisabled = false,
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const closeDisabledRef = useRef(closeDisabled);

  useEffect(() => {
    onCloseRef.current = onClose;
    closeDisabledRef.current = closeDisabled;
  }, [onClose, closeDisabled]);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !closeDisabledRef.current) {
        onCloseRef.current();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
      previousFocusRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4 bg-black/55"
      onClick={() => {
        if (!closeDisabled) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "w-full bg-[var(--color-surface)] nb-border-strong nb-shadow-lg rounded-[var(--radius-md)]",
          "focus:outline-none max-h-[90vh] flex flex-col",
          maxWidthClass
        )}
      >
        <div className="flex items-start justify-between gap-3 p-4 sm:p-5 border-b-2 border-[var(--border-color)]">
          <div>
            <h2 id={titleId} className="text-lg font-bold text-[var(--color-ink)]">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-sm text-[var(--color-muted)]">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            disabled={closeDisabled}
            onClick={onClose}
            aria-label="Tutup dialog"
            className="p-1.5 rounded-[var(--radius-sm)] nb-border bg-[var(--color-surface)] hover:bg-[var(--color-surface-subtle)] disabled:opacity-50 cursor-pointer"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {children && (
          <div className="p-4 sm:p-5 overflow-y-auto text-sm sm:text-base">{children}</div>
        )}

        {footer && (
          <div className="p-4 sm:p-5 border-t-2 border-[var(--border-color)] flex flex-wrap justify-end gap-2.5 bg-[var(--color-bg)] rounded-b-[calc(var(--radius-md)-2px)]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: ButtonVariant;
  isConfirming?: boolean;
  children?: ReactNode;
}

/**
 * Confirmation dialog required for critical mutations (FRONTEND_SPEC_PINJAM.md §11).
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Konfirmasi",
  cancelLabel = "Batal",
  confirmVariant = "primary",
  isConfirming = false,
  children,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      closeDisabled={isConfirming}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isConfirming}>
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            onClick={onConfirm}
            isLoading={isConfirming}
            loadingText="Memproses..."
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
