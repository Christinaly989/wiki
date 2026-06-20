const easternTimeZone = "America/New_York";

function getFormatter(timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function getParts(date, timeZone) {
  const formatter = getFormatter(timeZone);
  const values = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function getTimeZoneOffsetMs(date, timeZone) {
  const parts = getParts(date, timeZone);
  const zonedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return zonedAsUtc - date.getTime();
}

export function zonedDateTimeToUtc({ year, month, day, hour = 0, minute = 0, second = 0 }, timeZone) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const initialOffset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  let adjusted = utcGuess - initialOffset;
  const secondOffset = getTimeZoneOffsetMs(new Date(adjusted), timeZone);
  if (secondOffset !== initialOffset) {
    adjusted = utcGuess - secondOffset;
  }
  return new Date(adjusted);
}

export function parseEasternDateTime(dateText, timeText = "08:30 AM") {
  const cleanDate = dateText
    .replace(/\./g, "")
    .replace(/,/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const parsed = new Date(`${cleanDate} ${timeText} ${easternTimeZone}`);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  const [monthName, dayText, yearText] = cleanDate.split(" ");
  const monthIndex = new Date(`${monthName} 1, 2000`).getMonth() + 1;
  const [timePart, meridiem] = timeText.trim().split(" ");
  let [hour, minute] = timePart.split(":").map(Number);
  if (meridiem?.toUpperCase() === "PM" && hour !== 12) {
    hour += 12;
  }
  if (meridiem?.toUpperCase() === "AM" && hour === 12) {
    hour = 0;
  }

  return zonedDateTimeToUtc(
    {
      year: Number(yearText),
      month: monthIndex,
      day: Number(dayText),
      hour,
      minute,
    },
    easternTimeZone,
  );
}

export function formatInTimeZone(input, timeZone, options = {}) {
  const date = typeof input === "string" ? new Date(input) : input;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...options,
  }).format(date);
}

export function nowInTimeZone(timeZone) {
  return getParts(new Date(), timeZone);
}

export function currentDateKey(timeZone) {
  const parts = nowInTimeZone(timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function withinDays(from, target, days) {
  const diff = new Date(target).getTime() - new Date(from).getTime();
  return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000;
}

export function safeIso(date) {
  return new Date(date).toISOString();
}
