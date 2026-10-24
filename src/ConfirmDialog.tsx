import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export interface Confirmation {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => Promise<void>;
}

export default function ConfirmDialog({
  confirmation,
  busy,
  onClose,
  children,
  confirmDisabled = false,
}: {
  confirmation: Confirmation;
  busy: boolean;
  onClose: () => void;
  children?: ReactNode;
  confirmDisabled?: boolean;
}) {
  const panel = useRef<HTMLElement>(null);
  const previousFocus = useRef(document.activeElement as HTMLElement | null);
  useEffect(() => {
    panel.current?.querySelector<HTMLButtonElement>(".confirm-cancel")?.focus();
    return () => {
      if (previousFocus.current?.isConnected) previousFocus.current.focus();
    };
  }, []);
  return (
    <div className="overlay confirm-overlay" onClick={() => !busy && onClose()}>
      <section
        ref={panel}
        className="modal confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !busy) {
            e.preventDefault();
            onClose();
          }
          if (e.key === "Tab") {
            const buttons = Array.from(
              panel.current!.querySelectorAll<HTMLElement>(
                "button:not(:disabled),select:not(:disabled),input:not(:disabled)",
              ),
            );
            const first = buttons[0];
            const last = buttons[buttons.length - 1];
            if (!first) {
              e.preventDefault();
              return;
            }
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <div className="modal-head">
          <h2 id="confirm-title">{confirmation.title}</h2>
          <button
            disabled={busy}
            onClick={onClose}
            aria-label="Close confirmation"
          >
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          <p id="confirm-message">{confirmation.message}</p>
          {children}
          <div className="confirm-actions">
            <button
              className="btn secondary confirm-cancel"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className={"btn " + (confirmation.destructive ? "danger" : "")}
              disabled={busy || confirmDisabled}
              onClick={async () => {
                await confirmation.onConfirm();
                onClose();
              }}
            >
              {busy ? "Please wait…" : confirmation.confirmLabel}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
