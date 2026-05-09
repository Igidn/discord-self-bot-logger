const DISCORD_EPOCH = 1420070400000;

/**
 * Convert a Discord snowflake string to a JavaScript Date.
 * Snowflakes encode the timestamp in the top 42 bits.
 */
export function snowflakeToTimestamp(snowflake: string): Date {
  const id = BigInt.asUintN(64, BigInt(snowflake));
  const timestamp = Number(id >> 22n) + DISCORD_EPOCH;
  return new Date(timestamp);
}

/**
 * Convert a JavaScript Date (or millisecond timestamp) to a Discord-compatible snowflake.
 * Worker ID and sequence are set to 0.
 */
export function timestampToSnowflake(timestamp: Date | number): string {
  const ms = typeof timestamp === 'number' ? timestamp : timestamp.getTime();
  const snowflake = (BigInt(ms - DISCORD_EPOCH) << 22n) | 0n;
  return snowflake.toString();
}

/**
 * Convert a snowflake to an ISO 8601 date string.
 */
export function snowflakeToDateString(snowflake: string): string {
  return snowflakeToTimestamp(snowflake).toISOString();
}

/**
 * Extract the timestamp component from a snowflake as milliseconds since epoch.
 */
export function snowflakeToMilliseconds(snowflake: string): number {
  const id = BigInt.asUintN(64, BigInt(snowflake));
  return Number(id >> 22n) + DISCORD_EPOCH;
}
