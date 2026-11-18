/**
 * The farm's clock: today and the time of day in the zone the backend counts
 * "today" in (farmDailyTasks: Africa/Nairobi), whatever the device says.
 *
 * Shared by Daily Tasks and the Dashboard's "Leo" card, which must agree on
 * what today is and which task is next. Assets, Costs and Profit still carry
 * their own copies of farmToday() - see the farm-timezone-split debt.
 */
const FARM_TIME_ZONE = 'Africa/Nairobi';

/**
 * Today as YYYY-MM-DD in the farm's timezone.
 *
 * Built from `formatToParts` rather than from a formatted string, so the
 * layout is ours and not the runtime's: `toLocaleDateString` with a locale
 * tag would be at the mercy of whichever ICU data the browser ships. If Intl
 * refuses the zone outright, the browser's own day is the honest fallback - a
 * date one day out beats a screen that will not render.
 */
export function farmToday(): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: FARM_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());

    const part = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
    const year = part('year');
    const month = part('month');
    const day = part('day');
    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // Falls through to the local day below.
  }

  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** HH:mm now in the farm's timezone. */
export function farmNowTime(): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: FARM_TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    const hour = parts.find((p) => p.type === 'hour')?.value;
    const minute = parts.find((p) => p.type === 'minute')?.value;
    if (hour && minute) {
      return `${hour}:${minute}`;
    }
  } catch {
    // Falls through to the local clock below.
  }
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}
