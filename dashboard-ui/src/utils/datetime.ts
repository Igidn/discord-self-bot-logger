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
