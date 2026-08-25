import { ExternalTimeoutError } from "./errors";

export async function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  label = "External service",
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await operation(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ExternalTimeoutError(label);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
