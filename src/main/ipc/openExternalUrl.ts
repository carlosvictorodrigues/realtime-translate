/**
 * URL validator for external links opened via shell.openExternal.
 *
 * Used by both the IPC handler (renderer-initiated opens) and the
 * setWindowOpenHandler closures on every BrowserWindow that renders
 * user-facing content. Single source of truth for the protocol allowlist.
 *
 * Rejects file:, javascript:, and any other non-http(s) protocol — without
 * this, a malformed URL like `file:///C:/Windows/System32/cmd.exe` could
 * trigger Windows to launch arbitrary files via the OS default-handler
 * machinery. Throws on malformed URLs (new URL() failure).
 */
const ALLOWED_PROTOCOLS = ['http:', 'https:'];

export function validateExternalUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    throw new Error(`Blocked protocol: ${parsed.protocol}`);
  }
  return parsed;
}
