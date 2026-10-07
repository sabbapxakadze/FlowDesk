/** "2 hours", "1 hour", "45 minutes": how long a demo copy lives, for the sentence the visitor reads. */
export function formatLifetime(minutes: number): string {
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

/** "1 h 40 min", "25 min", "less than a minute": time left, rounded up to the minute once there is more than a minute. */
export function formatTimeLeft(milliseconds: number): string {
  if (milliseconds < 60_000) return "less than a minute";
  const minutes = Math.ceil(milliseconds / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
