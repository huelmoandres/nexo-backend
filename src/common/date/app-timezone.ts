import { formatInTimeZone } from 'date-fns-tz';

export const DEFAULT_APP_TIMEZONE = 'America/Montevideo';

/** Fecha calendario AAAA-MM-DD en la zona de negocio de la app. */
export function calendarDateString(
  timeZone: string,
  at: Date = new Date(),
): string {
  return formatInTimeZone(at, timeZone, 'yyyy-MM-dd');
}

/** `true` si la fecha efectiva de la tasa es anterior a “hoy” en la zona de negocio. */
export function isEffectiveDateStale(
  effectiveDate: Date,
  timeZone: string,
  at: Date = new Date(),
): boolean {
  return (
    formatInTimeZone(effectiveDate, timeZone, 'yyyy-MM-dd') <
    calendarDateString(timeZone, at)
  );
}
