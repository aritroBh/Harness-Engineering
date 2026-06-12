import { VisionProviderName } from "./types";

export type VisionErrorCode =
  | "PROVIDER_NOT_CONFIGURED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_HTTP_ERROR"
  | "PROVIDER_PARSE_ERROR"
  | "PROVIDER_INVALID_RESPONSE"
  | "PROVIDER_UNSUPPORTED_IMAGE"
  | "PROVIDER_RATE_LIMITED"
  | "VISION_PROVIDER_NOT_ALLOWED"
  | "UNKNOWN_VISION_ERROR";

export class VisionProviderError extends Error {
  public code: VisionErrorCode;
  public provider: VisionProviderName;
  public safeDetails?: string;
  public cause?: Error;

  constructor(
    code: VisionErrorCode,
    provider: VisionProviderName,
    message: string,
    safeDetails?: string,
    cause?: Error,
  ) {
    super(message);
    this.name = "VisionProviderError";
    this.code = code;
    this.provider = provider;
    this.safeDetails = safeDetails;
    if (cause) {
      this.cause = cause;
    }

    // Ensure the prototype is set correctly for custom errors in TS
    Object.setPrototypeOf(this, VisionProviderError.prototype);
  }
}
