import { Injectable } from '@nestjs/common';
import { UAParser } from 'ua-parser-js';

export interface ParsedDevice {
  browser?: string;
  os?: string;
}

/// Parsed locally from the User-Agent header — no external geo-IP/device
/// API involved. Feeds Session.browser/os (see decision 8,
/// docs/adr/0001-auth-module.md); Session.location is left unpopulated.
@Injectable()
export class DeviceParserService {
  parse(userAgent: string): ParsedDevice {
    const result = UAParser(userAgent);
    const browser = result.browser.name
      ? [result.browser.name, result.browser.version].filter(Boolean).join(' ')
      : undefined;
    const os = result.os.name
      ? [result.os.name, result.os.version].filter(Boolean).join(' ')
      : undefined;
    return { browser, os };
  }
}
