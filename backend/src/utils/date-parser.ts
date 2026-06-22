export function parseNaturalDate(text: string): { date: string; error?: string } {
  const lower = text.toLowerCase().trim();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // "tomorrow"
  if (lower === 'tomorrow') {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + 1);
    return { date: d.toISOString().split('T')[0] };
  }

  // "day after tomorrow"
  if (lower === 'day after tomorrow') {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + 2);
    return { date: d.toISOString().split('T')[0] };
  }

  // "next monday", "next tuesday", etc.
  const dayNames: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6,
  };
  const nextMatch = lower.match(/^next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/);
  if (nextMatch) {
    const targetDay = dayNames[nextMatch[1]];
    const currentDay = today.getUTCDay();
    let daysUntil = targetDay - currentDay;
    if (daysUntil <= 0) daysUntil += 7;
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + daysUntil);
    return { date: d.toISOString().split('T')[0] };
  }

  // "this monday", "this friday", etc.
  const thisMatch = lower.match(/^this\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/);
  if (thisMatch) {
    const targetDay = dayNames[thisMatch[1]];
    const currentDay = today.getUTCDay();
    let daysUntil = targetDay - currentDay;
    if (daysUntil < 0) daysUntil += 7;
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + daysUntil);
    return { date: d.toISOString().split('T')[0] };
  }

  // Just a day name: "monday", "friday"
  const dayMatch = lower.match(/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/);
  if (dayMatch) {
    const targetDay = dayNames[dayMatch[1]];
    const currentDay = today.getUTCDay();
    let daysUntil = targetDay - currentDay;
    if (daysUntil <= 0) daysUntil += 7;
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + daysUntil);
    return { date: d.toISOString().split('T')[0] };
  }

  // Word-number to digit mapping
  const wordNumMap: Record<string, string> = {
    first: '1', second: '2', third: '3', fourth: '4', fifth: '5',
    sixth: '6', seventh: '7', eighth: '8', ninth: '9', tenth: '10',
    eleventh: '11', twelfth: '12', thirteenth: '13', fourteenth: '14', fifteenth: '15',
    sixteenth: '16', seventeenth: '17', eighteenth: '18', nineteenth: '19', twentieth: '20',
    'twenty first': '21', 'twenty second': '22', 'twenty third': '23', 'twenty fourth': '24', 'twenty fifth': '25',
    'twenty sixth': '26', 'twenty seventh': '27', 'twenty eighth': '28', 'twenty ninth': '29', 'thirtieth': '30',
    'thirty first': '31',
  };

  // Handle word-number dates: "twenty second june" => "22 june"
  const wordDateMatch = lower.match(new RegExp(`^(${Object.keys(wordNumMap).join('|')})\\s+(january|february|march|april|may|june|july|august|september|october|november|december)(?:\\s+(\\d{4}))?$`));
  if (wordDateMatch) {
    const day = wordNumMap[wordDateMatch[1]];
    const month = wordDateMatch[2];
    const year = wordDateMatch[3];
    const reconstructed = `${day} ${month}${year ? ' ' + year : ''}`;
    return parseNaturalDate(reconstructed);
  }

  // "dd month" or "dd month yyyy" — e.g., "20 June", "20 June 2026"
  const dateMatch = lower.match(/^(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?$/);
  if (dateMatch) {
    const months: Record<string, number> = {
      january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
      july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
    };
    const day = parseInt(dateMatch[1]);
    const month = months[dateMatch[2]];
    const year = dateMatch[3] ? parseInt(dateMatch[3]) : today.getFullYear();
    const d = new Date(year, month, day);
    if (isNaN(d.getTime())) {
      return { date: '', error: `Could not parse date: ${text}` };
    }
    return { date: d.toISOString().split('T')[0] };
  }

  // ISO date already (YYYY-MM-DD)
  const isoMatch = lower.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return { date: lower };
  }

  // "in 2 days", "in 3 days"
  const inMatch = lower.match(/^in\s+(\d+)\s+days?$/);
  if (inMatch) {
    const days = parseInt(inMatch[1]);
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + days);
    return { date: d.toISOString().split('T')[0] };
  }

  return { date: '', error: `Could not understand date: "${text}". Try "tomorrow", "next Monday", or a specific date.` };
}
