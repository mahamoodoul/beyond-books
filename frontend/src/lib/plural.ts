/** "1 lesson", "3 lessons", "2 quizzes": a count with the right word form. */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
