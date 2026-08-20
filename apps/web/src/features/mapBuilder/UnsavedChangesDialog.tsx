type Props = {
  open: boolean;
  title: string;
  message: string;
  onStay: () => void;
  onDiscard: () => void;
  onSave: () => void;
};

export function UnsavedChangesDialog({ open, title, message, onStay, onDiscard, onSave }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-lg border border-line bg-paper-raised p-5 shadow-lg"
      >
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <p className="mt-2 text-sm text-muted">{message}</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onStay}>
            Stay
          </button>
          <button type="button" className="btn-danger" onClick={onDiscard}>
            Discard changes
          </button>
          <button type="button" className="btn-primary" onClick={onSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
