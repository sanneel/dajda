/**
 * One error vocabulary for server actions, route handlers and services, so
 * that every failure reaches the UI in the same shape.
 */

export const ERROR_CODES = {
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  /** A published prediction was modified outside the correction flow. */
  IMMUTABLE: 'IMMUTABLE',
  /** A provider label has no active canonical mapping. */
  PAYMENT_ERROR: 'PAYMENT_ERROR',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

const HTTP_STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  IMMUTABLE: 409,
  PAYMENT_ERROR: 402,
  INTERNAL: 500,
};

/** Georgian fallbacks. Safe to show to an end user - they leak no internals. */
const DEFAULT_MESSAGE_KA: Record<ErrorCode, string> = {
  UNAUTHENTICATED: 'გთხოვთ გაიაროთ ავტორიზაცია.',
  FORBIDDEN: 'ამ მოქმედების ნებართვა არ გაქვთ.',
  NOT_FOUND: 'მოთხოვნილი ჩანაწერი ვერ მოიძებნა.',
  VALIDATION_ERROR: 'შეყვანილი მონაცემები არასწორია.',
  CONFLICT: 'ეს მოქმედება ეწინააღმდეგება არსებულ ჩანაწერს.',
  RATE_LIMITED: 'ძალიან ბევრი მცდელობა. სცადეთ მოგვიანებით.',
  IMMUTABLE: 'გამოქვეყნებული ფსონის შეცვლა შეუძლებელია.',
  PAYMENT_ERROR: 'გადახდის დამუშავება ვერ მოხერხდა.',
  INTERNAL: 'დაფიქსირდა შეცდომა. სცადეთ მოგვიანებით.',
};

export type FieldErrors = Record<string, string[]>;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fieldErrors?: FieldErrors;
  /** Detail intended for logs only - never serialised to the client. */
  readonly internalDetail?: string;

  constructor(
    code: ErrorCode,
    message?: string,
    options?: { fieldErrors?: FieldErrors; internalDetail?: string },
  ) {
    super(message ?? DEFAULT_MESSAGE_KA[code]);
    this.name = 'AppError';
    this.code = code;
    this.status = HTTP_STATUS[code];
    this.fieldErrors = options?.fieldErrors;
    this.internalDetail = options?.internalDetail;
  }
}

export type ActionSuccess<T> = { ok: true; data: T };
export type ActionFailure = {
  ok: false;
  error: { code: ErrorCode; message: string; fieldErrors?: FieldErrors };
};
export type ActionResult<T> = ActionSuccess<T> | ActionFailure;

export function ok<T>(data: T): ActionSuccess<T> {
  return { ok: true, data };
}

export function fail(
  code: ErrorCode,
  message?: string,
  fieldErrors?: FieldErrors,
): ActionFailure {
  return {
    ok: false,
    error: {
      code,
      message: message ?? DEFAULT_MESSAGE_KA[code],
      fieldErrors,
    },
  };
}

/**
 * Convert any thrown value into a client-safe failure. Unknown errors are
 * flattened to INTERNAL so that stack traces and driver messages never escape.
 */
export function toActionFailure(error: unknown): ActionFailure {
  if (error instanceof AppError) {
    return fail(error.code, error.message, error.fieldErrors);
  }
  if (process.env.NODE_ENV !== 'test') {
    console.error('[dajda] unhandled error', error);
  }
  return fail(ERROR_CODES.INTERNAL);
}

export function errorResponse(error: unknown): Response {
  const failure = toActionFailure(error);
  const status =
    error instanceof AppError ? error.status : HTTP_STATUS.INTERNAL;

  return Response.json(failure, { status });
}

export function jsonResponse<T>(data: T, status = 200): Response {
  return Response.json(ok(data), { status });
}
