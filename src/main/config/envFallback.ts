export function readEnvApiKey(): string | undefined {
  const v = process.env.OPENAI_API_KEY;
  return v && v.trim().length > 0 ? v.trim() : undefined;
}
