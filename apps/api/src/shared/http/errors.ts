export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

export function asErrorPayload(error: unknown): { statusCode: number; body: { error: string; code?: string; details?: unknown } } {
  if (error instanceof HttpError) {
    return {
      statusCode: error.statusCode,
      body: { error: error.message, code: error.code, details: error.details }
    };
  }

  if (error instanceof Error) {
    return { statusCode: 500, body: { error: error.message, code: "INTERNAL_ERROR" } };
  }

  return { statusCode: 500, body: { error: "Unexpected error", code: "INTERNAL_ERROR" } };
}
