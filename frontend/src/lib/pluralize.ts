/** Russian noun pluralization: 1 vs 2-4 vs 5+ (with the 11-14 exception), not just singular/plural. */
function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return few;
  return many;
}

export function pluralTasks(n: number): string {
  return pluralize(n, "задача", "задачи", "задач");
}

export function pluralMembers(n: number): string {
  return pluralize(n, "участник", "участника", "участников");
}
