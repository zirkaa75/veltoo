export type AuthPortal = "admin" | "business";

export function authCookieName(portal: AuthPortal) {
  return portal === "admin" ? "velto-admin-auth" : "velto-business-auth";
}
