/**
 * Invokes the iteratee n times, returning an array of the results of each invocation.
 * The iteratee is invoked with one argument; (index).
 */
export const times = <T>(length: number, iteratee: (index: number) => T): T[] =>
  Array.from<T, number>({ length }, (_, k) => k).map(iteratee);

export function autoFormatDuration(seconds: number): string {
  if (seconds < 60) {
    const s = Math.round(seconds);
    return `${s} sec${s !== 1 ? "s" : ""}`;
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes} min${minutes !== 1 ? "s" : ""}`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `${hours} hr${hours !== 1 ? "s" : ""}`;
  }

  return `${hours} hr${hours !== 1 ? "s" : ""} ${remainingMinutes} min${remainingMinutes !== 1 ? "s" : ""}`;
}

// we need the date in the form yyyy-MM-dd to pass to the input
export function toSimpleDateString(date: Date | string): string {
  const _date = typeof date === "string" ? new Date(date) : date;
  return _date.toISOString().split("T")[0];
}
