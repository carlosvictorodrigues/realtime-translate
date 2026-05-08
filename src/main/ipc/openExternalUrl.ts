/**
 * URL validator for external links opened via shell.openExternal.
 *
 * Used by both the IPC handler (renderer-initiated opens) and the
 * setWindowOpenHandler closures on every BrowserWindow that renders
 * user-facing content. Single source of truth for the protocol allowlist.
 *
 * Rejects file:, javascript:, data:, and any other non-http(s) protocol —
 * without this, a malformed URL like `file:///C:/Windows/System32/cmd.exe`
 * could trigger Windows to launch arbitrary files via the OS default-handler
 * machinery. Throws on malformed URLs (new URL() failure).
 *
 * Scope: validates protocol only. Callers passing user-controlled URL
 * fragments/queries should sanitize those separately — this function does
 * not protect against open-redirect or query-injection in the destination.
 */
const ALLOWED_PROTOCOLS = ['http:', 'https:'];

export function validateExternalUrl(url: string): URL {
  if (typeof url !== 'string') {
    // The IpcInvokeMap signature already enforces string at compile time,
    // but a malicious renderer could bypass via raw ipcRenderer.invoke.
    throw new Error(`Invalid URL: not a string (${typeof url})`);
  }
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
