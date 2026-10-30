/** Username rules shown on the sign-up form and checked before asking the API. */
export const USERNAME_RULES = "3 to 20 characters: letters, numbers, dots and underscores.";

export function usernameProblem(name: string): string | null {
  if (name.length < 3) return "Use at least 3 characters.";
  if (name.length > 20) return "Use 20 characters or fewer.";
  if (!/^[A-Za-z0-9._]+$/.test(name)) return "Only letters, numbers, dots and underscores.";
  if (/^[._]|[._]$/.test(name)) return "Start and end with a letter or number.";
  return null;
}
