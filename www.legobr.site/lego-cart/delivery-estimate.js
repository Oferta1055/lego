/* Previsão de entrega por dias úteis — sem dependências externas. */
(function (root) {
  const holidayCache = new Map();
  const fixedHolidays = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25'];

  function keyOf(date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }

  function easterSunday(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(year, month - 1, day));
  }

  function nationalHolidays(year) {
    if (holidayCache.has(year)) return holidayCache.get(year);
    const dates = fixedHolidays.map((monthDay) => `${year}-${monthDay}`);
    if (year >= 2024) dates.push(`${year}-11-20`);
    const goodFriday = easterSunday(year);
    goodFriday.setUTCDate(goodFriday.getUTCDate() - 2);
    dates.push(keyOf(goodFriday));
    const holidays = new Set(dates);
    holidayCache.set(year, holidays);
    return holidays;
  }

  function isBusinessDay(date) {
    const weekday = date.getUTCDay();
    return weekday !== 0 && weekday !== 6 && !nationalHolidays(date.getUTCFullYear()).has(keyOf(date));
  }

  function addBusinessDays(startDate, amount) {
    const date = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
    let remaining = Math.max(0, Math.trunc(Number(amount) || 0));
    let guard = 0;
    while (remaining > 0) {
      date.setUTCDate(date.getUTCDate() + 1);
      if (isBusinessDay(date)) remaining -= 1;
      if (++guard > 370) throw new RangeError('Prazo de entrega fora do intervalo suportado.');
    }
    return date;
  }

  function todayInBrazil(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    return new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
  }

  function monthName(date) {
    return new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(date);
  }

  function formatRange(from, to) {
    const fromDay = from.getUTCDate();
    const toDay = to.getUTCDate();
    const fromMonth = monthName(from);
    const toMonth = monthName(to);
    const fromYear = from.getUTCFullYear();
    const toYear = to.getUTCFullYear();
    if (fromYear === toYear && from.getUTCMonth() === to.getUTCMonth()) {
      return `Chegará de ${fromDay} a ${toDay} de ${toMonth}`;
    }
    if (fromYear === toYear) {
      return `Chegará de ${fromDay} de ${fromMonth} a ${toDay} de ${toMonth}`;
    }
    return `Chegará de ${fromDay} de ${fromMonth} de ${fromYear} a ${toDay} de ${toMonth} de ${toYear}`;
  }

  function estimate(minBusinessDays, maxBusinessDays, baseDate) {
    let base;
    if (baseDate instanceof Date) base = baseDate;
    else if (typeof baseDate === 'string') base = new Date(`${baseDate}T12:00:00Z`);
    else base = todayInBrazil();
    if (Number.isNaN(base.getTime())) throw new TypeError('Data-base inválida para a previsão de entrega.');
    const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
    const minDays = Math.max(0, Math.trunc(Number(minBusinessDays) || 0));
    const maxDays = Math.max(minDays, Math.trunc(Number(maxBusinessDays) || 0));
    const from = addBusinessDays(start, minDays);
    const to = addBusinessDays(start, maxDays);
    return { from: keyOf(from), to: keyOf(to), label: formatRange(from, to) };
  }

  root.LegoDeliveryDates = { todayInBrazil, estimate };
})(window);
