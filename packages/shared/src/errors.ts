export interface AppErrorResponseDto {
  statusCode: number;
  code: AppErrorCode;
  message: string;
}

/// The closed set of error codes every use-case/command/query handler in
/// the API can throw via AppException — lets the frontend branch on error
/// type instead of string-matching messages. Grouped by the module that
/// introduced each code; Module 1 codes are unchanged, Module 2 adds the
/// resource-oriented ones below.
export type AppErrorCode =
  // Module 1 — auth
  | "EMAIL_ALREADY_REGISTERED"
  | "INVALID_CREDENTIALS"
  | "ACCOUNT_LOCKED"
  | "ACCOUNT_SUSPENDED"
  | "EMAIL_NOT_VERIFIED"
  | "INVALID_OR_EXPIRED_TOKEN"
  | "MFA_CODE_INVALID"
  | "MFA_CHALLENGE_EXPIRED"
  | "MFA_NOT_ENABLED"
  | "MFA_ALREADY_ENABLED"
  | "RATE_LIMITED"
  // Module 2 — workspace foundation
  | "WORKSPACE_NOT_FOUND"
  | "PROJECT_NOT_FOUND"
  | "TARGET_NOT_FOUND"
  | "NOTE_NOT_FOUND"
  | "EVIDENCE_NOT_FOUND"
  | "ATTACHMENT_NOT_FOUND"
  | "TAG_NOT_FOUND"
  | "TAG_ALREADY_EXISTS"
  | "PROJECT_MEMBER_NOT_FOUND"
  | "PROJECT_MEMBER_ALREADY_EXISTS"
  | "INVALID_REFERENCE"
  | "FORBIDDEN_RESOURCE_ACCESS"
  | "PREFERENCES_NOT_FOUND"
  // Module 3 — recon engine
  | "RECON_JOB_NOT_FOUND"
  | "RECON_FINDING_NOT_FOUND"
  | "RECON_JOB_NOT_CANCELLABLE"
  | "RECON_JOB_NOT_RETRYABLE"
  | "RECON_FINDING_ALREADY_PROMOTED"
  | "RECON_FINDING_NOT_PROMOTABLE"
  | "RECON_TOOL_NOT_SUPPORTED_FOR_TARGET_TYPE";
