const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

export function createRequestId(): string {
  return crypto.randomUUID();
}

export function resolveRequestId(headers?: Headers): string {
  const supplied = headers?.get("x-request-id")?.trim();
  return supplied && REQUEST_ID_PATTERN.test(supplied) ? supplied : createRequestId();
}
