// NSE market hours (IST = UTC+5:30)
// Pre-market:  09:00–09:15 IST
// Market open: 09:15–15:30 IST
// Post-market: 15:30–16:00 IST

// NSE holidays 2025 & 2026 (from NSE circulars)
const NSE_HOLIDAYS: { date: string; name: string }[] = [
  // 2025
  { date: "2025-01-26", name: "Republic Day" },
  { date: "2025-02-26", name: "Mahashivratri" },
  { date: "2025-03-14", name: "Holi" },
  { date: "2025-04-10", name: "Id-Ul-Fitr (Ramadan Eid)" },
  { date: "2025-04-14", name: "Dr. Baba Saheb Ambedkar Jayanti" },
  { date: "2025-04-18", name: "Good Friday" },
  { date: "2025-05-01", name: "Maharashtra Day" },
  { date: "2025-08-15", name: "Independence Day" },
  { date: "2025-08-27", name: "Ganesh Chaturthi" },
  { date: "2025-10-02", name: "Mahatma Gandhi Jayanti" },
  { date: "2025-10-02", name: "Dussehra" },
  { date: "2025-10-20", name: "Diwali Laxmi Pujan" },
  { date: "2025-10-21", name: "Diwali Balipratipada" },
  { date: "2025-11-05", name: "Guru Nanak Jayanti" },
  { date: "2025-12-25", name: "Christmas" },
  // 2026
  { date: "2026-01-26", name: "Republic Day" },
  { date: "2026-03-03", name: "Holi" },
  { date: "2026-03-20", name: "Gudi Padwa" },
  { date: "2026-03-30", name: "Id-Ul-Fitr (Ramadan Eid)" },
  { date: "2026-04-03", name: "Good Friday" },
  { date: "2026-04-14", name: "Dr. Baba Saheb Ambedkar Jayanti" },
  { date: "2026-05-01", name: "Maharashtra Day" },
  { date: "2026-08-15", name: "Independence Day" },
  { date: "2026-09-17", name: "Ganesh Chaturthi" },
  { date: "2026-10-02", name: "Mahatma Gandhi Jayanti" },
  { date: "2026-10-08", name: "Dussehra" },
  { date: "2026-11-09", name: "Diwali Laxmi Pujan" },
  { date: "2026-11-10", name: "Diwali Balipratipada" },
  { date: "2026-11-24", name: "Guru Nanak Jayanti" },
  { date: "2026-12-25", name: "Christmas" },
];

const HOLIDAY_SET = new Set(NSE_HOLIDAYS.map((h) => h.date));

function toIST(date: Date): Date {
  // IST = UTC + 5:30
  const utcMs = date.getTime() + date.getTimezoneOffset() * 60000;
  return new Date(utcMs + 5.5 * 60 * 60 * 1000);
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function isTradingDay(dateStr?: string): { date: string; is_trading_day: boolean; reason: string } {
  let date: Date;
  if (dateStr) {
    date = new Date(`${dateStr}T00:00:00+05:30`);
  } else {
    date = toIST(new Date());
  }

  const dayOfWeek = date.getDay(); // 0=Sun, 6=Sat
  const iso = formatDate(date);

  if (dayOfWeek === 0) return { date: iso, is_trading_day: false, reason: "Sunday" };
  if (dayOfWeek === 6) return { date: iso, is_trading_day: false, reason: "Saturday" };
  if (HOLIDAY_SET.has(iso)) {
    const holiday = NSE_HOLIDAYS.find((h) => h.date === iso);
    return { date: iso, is_trading_day: false, reason: `NSE holiday: ${holiday?.name ?? "Holiday"}` };
  }
  return { date: iso, is_trading_day: true, reason: "Regular trading day" };
}

export type SessionPhase = "pre_market" | "open" | "post_market" | "closed";

export function getMarketStatus() {
  const now = toIST(new Date());
  const dateStr = formatDate(now);
  const timeStr = formatTime(now);

  const totalMinutes = now.getHours() * 60 + now.getMinutes();
  const preOpen = 9 * 60;       // 09:00
  const marketOpen = 9 * 60 + 15; // 09:15
  const marketClose = 15 * 60 + 30; // 15:30
  const postClose = 16 * 60;    // 16:00

  const { is_trading_day } = isTradingDay(dateStr);

  let session: SessionPhase;
  let minutes_to_open: number | null = null;
  let minutes_to_close: number | null = null;

  if (!is_trading_day) {
    session = "closed";
  } else if (totalMinutes < preOpen) {
    session = "closed";
    minutes_to_open = preOpen - totalMinutes;
  } else if (totalMinutes < marketOpen) {
    session = "pre_market";
    minutes_to_open = marketOpen - totalMinutes;
  } else if (totalMinutes < marketClose) {
    session = "open";
    minutes_to_close = marketClose - totalMinutes;
  } else if (totalMinutes < postClose) {
    session = "post_market";
  } else {
    session = "closed";
  }

  // Compute next open (next trading day 09:15 IST)
  let nextOpenDate = new Date(now);
  if (session !== "closed" || totalMinutes < marketOpen) {
    // If market hasn't opened yet today, next open is today
    if (!is_trading_day || totalMinutes >= marketClose) {
      nextOpenDate.setDate(nextOpenDate.getDate() + 1);
    }
  } else if (totalMinutes >= marketClose) {
    nextOpenDate.setDate(nextOpenDate.getDate() + 1);
  }

  // Find next trading day
  let attempts = 0;
  while (attempts < 10) {
    const check = isTradingDay(formatDate(nextOpenDate));
    if (check.is_trading_day) break;
    nextOpenDate.setDate(nextOpenDate.getDate() + 1);
    attempts++;
  }

  const next_open = `${formatDate(nextOpenDate)} 09:15 IST`;

  return {
    date: dateStr,
    time_ist: timeStr,
    session,
    is_trading_day,
    minutes_to_open,
    minutes_to_close,
    next_open,
  };
}

export function getUpcomingHolidays(n = 5): { date: string; name: string }[] {
  const today = formatDate(toIST(new Date()));
  return NSE_HOLIDAYS.filter((h) => h.date >= today).slice(0, n);
}
