/** Strip a value down to characters safe for a downloaded filename. */
export function safeFilePart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}
