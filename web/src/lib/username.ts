import type { UsernameCheck } from "@/lib/api/types";

/** The spec's Username rules, in words for the sign-up form. */
export const USERNAME_RULES = "3 to 20 letters, numbers and underscores. No underscore at the start or end, or two in a row.";

/** Same rule as the spec's Username pattern, explained one problem at a time. */
export function usernameProblem(name: string): string | null {
  if (name.length < 3) return "Use at least 3 characters.";
  if (name.length > 20) return "Use 20 characters or fewer.";
  if (!/^[A-Za-z0-9_]+$/.test(name)) return "Use only letters, numbers and underscores.";
  if (/^_|_$/.test(name)) return "Start and end with a letter or number.";
  if (/__/.test(name)) return "Use one underscore at a time.";
  return null;
}

/** Plain words for the spec's UsernameCheck reasons. */
export function usernameReason(reason: UsernameCheck["reason"]): string {
  switch (reason) {
    case "taken":
      return "Someone already has that username.";
    case "reserved":
      return "That username is reserved.";
    case "released_recently":
      return "That username was given up recently and cannot be taken for 90 days.";
    case "not_allowed":
      return "That username is not allowed.";
    case "invalid":
      return USERNAME_RULES;
    default:
      return "That username is not available.";
  }
}
