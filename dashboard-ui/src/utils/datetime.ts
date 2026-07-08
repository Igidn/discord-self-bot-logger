export type TimestampValue = string | number | Date | null | undefined;

function isValidDate(date: Date): boolean {
  return Number.isFinite(date.getTime());
}

export function parseTimestamp(value: TimestampValue): Date | null {
  if (value == null) return null;

  if (value instanceof Date) {
    return isValidDate(value) ? value : null;
  }

  if (typeof value === 'number') {
    const normalized = value < 1e12 ? value * 1000 : value;
    const date = new Date(normalized);
    return isValidDate(date) ? date : null;
  }

  const numericValue = Number(value);
  if (!Number.isNaN(numericValue) && value.trim() !== '') {
    const normalized = numericValue < 1e12 ? numericValue * 1000 : numericValue;
    const date = new Date(normalized);
    return isValidDate(date) ? date : null;
  }

  const date = new Date(value);
  return isValidDate(date) ? date : null;
}

export function timestampMs(value: TimestampValue): number {
  return parseTimestamp(value)?.getTime() ?? 0;
}

export function formatDate(value: TimestampValue): string {
  return parseTimestamp(value)?.toLocaleDateString() ?? '-';
}

export function formatDateTime(value: TimestampValue): string {
  return parseTimestamp(value)?.toLocaleString() ?? '-';
}

export function formatDateAndTime(value: TimestampValue): string {
  const date = parseTimestamp(value);
  return date ? `${date.toLocaleDateString()} ${date.toLocaleTimeString()}` : '-';
}

/** Relative time like "3m ago" / "in 5h". Stable across past and future. */
export function formatRelativeTime(value: TimestampValue): string {
  const date = parseTimestamp(value);
  if (!date) return 'unknown';
  const diff = Date.now() - date.getTime();
  const abs = Math.abs(diff);
  if (abs < 60_000) return 'just now';
  const mins = Math.floor(abs / 60_000);
  if (mins < 60) return diff >= 0 ? `${mins}m ago` : `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return diff >= 0 ? `${hrs}h ago` : `in ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return diff >= 0 ? `${days}d ago` : `in ${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return diff >= 0 ? `${months}mo ago` : `in ${months}mo`;
  const years = Math.floor(days / 365);
  return diff >= 0 ? `${years}y ago` : `in ${years}y`;
}
