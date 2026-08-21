export type BuilderCommandKind =
  | 'create'
  | 'update'
  | 'delete'
  | 'bulk-delete'
  | 'bulk-update'
  | 'geometry'
  | 'edge-split';

export type BuilderCommand = {
  id: string;
  kind: BuilderCommandKind;
  /** Generated once when the command is first created; reused on retries of the same forward op. */
  idempotencyKey: string;
  label: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
};

/** In-memory session undo/redo stack (cleared on reload). */
export function createCommandStack(limit = 50) {
  let undoStack: BuilderCommand[] = [];
  let redoStack: BuilderCommand[] = [];
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const l of listeners) l();
  };

  return {
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    peekUndo: () => undoStack[undoStack.length - 1] ?? null,
    peekRedo: () => redoStack[redoStack.length - 1] ?? null,
    push(cmd: BuilderCommand) {
      undoStack.push(cmd);
      if (undoStack.length > limit) undoStack.shift();
      redoStack = [];
      notify();
    },
    async undo() {
      const cmd = undoStack.pop();
      if (!cmd) return null;
      await cmd.undo();
      redoStack.push(cmd);
      notify();
      return cmd;
    },
    async redo() {
      const cmd = redoStack.pop();
      if (!cmd) return null;
      await cmd.redo();
      undoStack.push(cmd);
      notify();
      return cmd;
    },
    clear() {
      undoStack = [];
      redoStack = [];
      notify();
    },
  };
}

export type CommandStack = ReturnType<typeof createCommandStack>;

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
