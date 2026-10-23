export type ArLogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

export type ArLogEntry = {
  timestamp: number;
  level: ArLogLevel;
  category: string;
  message: string;
  data?: unknown;
};

const MAX_LOGS = 200;

class ArDebugger {
  private readonly entries: ArLogEntry[] = [];

  private enabled(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      return import.meta.env.DEV || localStorage.getItem('campusar_ar_debug') === '1';
    } catch {
      return false;
    }
  }

  private write(level: ArLogLevel, category: string, message: string, data?: unknown): void {
    const entry = { timestamp: Date.now(), level, category, message, data };
    this.entries.unshift(entry);
    if (this.entries.length > MAX_LOGS) this.entries.length = MAX_LOGS;
    if (!this.enabled()) return;
    const prefix = `[AR ${level}] [${category}] ${message}`;
    if (level === 'ERROR') console.error(prefix, data ?? '');
    else if (level === 'WARN') console.warn(prefix, data ?? '');
    else if (level === 'DEBUG') console.debug(prefix, data ?? '');
    else console.info(prefix, data ?? '');
  }

  info(category: string, message: string, data?: unknown): void {
    this.write('INFO', category, message, data);
  }

  warn(category: string, message: string, data?: unknown): void {
    this.write('WARN', category, message, data);
  }

  error(category: string, message: string, data?: unknown): void {
    this.write('ERROR', category, message, data);
  }

  debug(category: string, message: string, data?: unknown): void {
    this.write('DEBUG', category, message, data);
  }

  getEntries(): readonly ArLogEntry[] {
    return this.entries;
  }

  exportLogs(): string {
    return this.entries
      .slice()
      .reverse()
      .map((entry) => {
        const data = entry.data === undefined ? '' : ` ${JSON.stringify(entry.data)}`;
        return `[${new Date(entry.timestamp).toISOString()}] [${entry.level}] [${entry.category}] ${entry.message}${data}`;
      })
      .join('\n');
  }
}

export const arDebugger = new ArDebugger();

if (typeof window !== 'undefined') {
  (window as Window & { getCampusArLogs?: () => string }).getCampusArLogs = () =>
    arDebugger.exportLogs();
}