export function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}
export async function readText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) fail("Europe PMC returned an empty response", 502);
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 8 * 1024 * 1024) fail("Europe PMC response exceeds 8 MiB; narrow the request", 502);
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  if (!response.ok || /^\s*(?:<!doctype\s+html|<html\b)/i.test(text)) {
    let native: unknown = text;
    try { native = JSON.parse(text.replace(/^\uFEFF/, "")); } catch { /* Keep non-JSON provider evidence verbatim. */ }
    throw Object.assign(new Error(`Europe PMC HTTP ${response.status}; inspect provider_response`), {
      status: response.ok ? 502 : response.status, data: {provider_response: native, response_sha256: await hash(text)},
    });
  }
  return text;
}
export function parseJson(text: string): Record<string, unknown> | unknown[] {
  let data: unknown;
  try { data = JSON.parse(text.replace(/^\uFEFF/, "")); } catch {
    throw Object.assign(new Error("Europe PMC returned invalid JSON"), {status: 502, data: {provider_response: text}});
  }
  if (!data || typeof data !== "object") fail("Invalid Europe PMC response envelope", 502);
  if (("error" in data && data.error) || ("errMsg" in data && data.errMsg)) {
    throw Object.assign(new Error("Europe PMC returned a provider error; inspect provider_response"), {status: 502, data: {provider_response: data}});
  }
  return data as Record<string, unknown> | unknown[];
}
export async function hash(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}
