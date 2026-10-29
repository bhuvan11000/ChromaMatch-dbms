import type { ErrorCode } from "@/lib/errors";

/** Standard error envelope returned by every non-2xx API response (Architecture §5.10.1). */
export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}
