export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly userMessage: string;

  constructor(
    code: string,
    userMessage: string,
    status = 400,
    cause?: unknown,
  ) {
    super(userMessage);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.userMessage = userMessage;
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

export function toUserErrorMessage(error: unknown): string {
  if (error instanceof AppError) return error.userMessage;
  if (error instanceof Error && error.message) {
    return "Si è verificato un problema. Riprova tra poco.";
  }
  return "Errore sconosciuto. Riprova.";
}

/** Safe JSON for API responses — never includes secrets. */
export function apiErrorResponse(error: unknown): {
  error: string;
  code: string;
  status: number;
} {
  if (error instanceof AppError) {
    return {
      error: error.userMessage,
      code: error.code,
      status: error.status,
    };
  }
  console.error("[api]", error instanceof Error ? error.name : "unknown");
  return {
    error: "Servizio temporaneamente non disponibile.",
    code: "INTERNAL",
    status: 500,
  };
}
