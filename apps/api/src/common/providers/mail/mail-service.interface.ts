export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  /// Optional HTML alternative. The sender is responsible for escaping every
  /// value it interpolates; the plain-text part is always required.
  html?: string;
}

/// Port. See docs/adr/0001-auth-module.md — DevMailService is the only
/// implementation this sprint; swapping in a real provider (SendGrid, SES,
/// Postmark) later is a new class + one DI binding in providers.module.ts.
export interface MailService {
  send(message: MailMessage): Promise<void>;
}
