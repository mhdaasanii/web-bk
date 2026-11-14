export function formatDateId(dateStr?: string): string {
  if (!dateStr) return '-';
  const parsed = new Date(`${dateStr}T00:00:00+07:00`);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(parsed);
}

export function formatTimestampId(ts: any): string {
  if (!ts) return '-';
  const d = typeof ts?.toDate === 'function' ? ts.toDate() : new Date(ts);
  if (Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  }).format(d);
}

export function isScheduleJoinable(
  date: string,
  startTime: string,
  endTime: string,
  status: string,
  method: string,
  windowMinutesBefore = 15
): { joinable: boolean; reason?: string } {
  if (method !== 'online') {
    return { joinable: false, reason: 'Sesi tatap muka (offline)' };
  }
  if (status !== 'confirmed' && status !== 'in_progress') {
    return { joinable: false, reason: 'Jadwal belum dikonfirmasi atau sudah selesai' };
  }
  const startMs = Date.parse(`${date}T${startTime}:00+07:00`);
  const endMs = Date.parse(`${date}T${endTime}:00+07:00`);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return { joinable: false, reason: 'Format tanggal atau jam tidak valid' };
  }
  const now = Date.now();
  const openAt = startMs - windowMinutesBefore * 60 * 1000;
  const closeAt = endMs + 60 * 60 * 1000;

  if (now < openAt) {
    return {
      joinable: false,
      reason: `Ruang dibuka ${windowMinutesBefore} menit sebelum sesi (${startTime} WIB)`,
    };
  }
  if (now > closeAt) {
    return { joinable: false, reason: 'Rentang waktu sesi telah berakhir' };
  }
  return { joinable: true };
}

export function hasTimeOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  return startA < endB && endA > startB;
}

export function todayDateWIB(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return parts;
}

export function currentTimeWIB(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

export function addMinutesToTime(timeStr: string, minutes: number): string {
  const [h, m] = timeStr.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return timeStr;
  const total = h * 60 + m + minutes;
  const clamped = Math.min(23 * 60 + 59, Math.max(0, total));
  const hh = String(Math.floor(clamped / 60)).padStart(2, '0');
  const mm = String(clamped % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}
