import { Injectable } from '@nestjs/common';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { isScannerCompatibleWithTargetType } from './scanner-target-compatibility.js';
import type {
  ScannerRunner,
  ScannerRunTarget,
} from './scanner-runner.interface.js';
import type { Normalizer } from './normalizers/normalizer.interface.js';
import type { VulnScanner } from '../../../prisma-types.js';
import { NucleiScannerRunner } from './adapters/nuclei.scanner-runner.js';
import { FfufScannerRunner } from './adapters/ffuf.scanner-runner.js';
import { DirsearchScannerRunner } from './adapters/dirsearch.scanner-runner.js';
import { FeroxbusterScannerRunner } from './adapters/feroxbuster.scanner-runner.js';
import { NiktoScannerRunner } from './adapters/nikto.scanner-runner.js';
import { NucleiNormalizer } from './normalizers/nuclei.normalizer.js';
import { FfufNormalizer } from './normalizers/ffuf.normalizer.js';
import { DirsearchNormalizer } from './normalizers/dirsearch.normalizer.js';
import { FeroxbusterNormalizer } from './normalizers/feroxbuster.normalizer.js';
import { NiktoNormalizer } from './normalizers/nikto.normalizer.js';

/// Resolves a VulnScanner to its ScannerRunner + Normalizer pair —
/// identical role to Module 3's ToolRunnerRegistry. Adding a future
/// scanner (SQLMap, XSStrike, Dalfox, Wapiti, OWASP ZAP) means: one
/// ScannerRunner class, one Normalizer class, one entry here — nothing
/// else in the module changes. This registry, plus the enum value and the
/// migration adding it, are the *only* three places a new scanner ever
/// touches.
@Injectable()
export class ScannerRunnerRegistry {
  private readonly runners: Map<VulnScanner, ScannerRunner>;
  private readonly normalizers: Map<VulnScanner, Normalizer>;

  constructor(
    nuclei: NucleiScannerRunner,
    ffuf: FfufScannerRunner,
    dirsearch: DirsearchScannerRunner,
    feroxbuster: FeroxbusterScannerRunner,
    nikto: NiktoScannerRunner,
    nucleiNormalizer: NucleiNormalizer,
    ffufNormalizer: FfufNormalizer,
    dirsearchNormalizer: DirsearchNormalizer,
    feroxbusterNormalizer: FeroxbusterNormalizer,
    niktoNormalizer: NiktoNormalizer,
  ) {
    this.runners = new Map<VulnScanner, ScannerRunner>([
      [nuclei.scanner, nuclei],
      [ffuf.scanner, ffuf],
      [dirsearch.scanner, dirsearch],
      [feroxbuster.scanner, feroxbuster],
      [nikto.scanner, nikto],
    ]);
    this.normalizers = new Map<VulnScanner, Normalizer>([
      ['NUCLEI', nucleiNormalizer],
      ['FFUF', ffufNormalizer],
      ['DIRSEARCH', dirsearchNormalizer],
      ['FEROXBUSTER', feroxbusterNormalizer],
      ['NIKTO', niktoNormalizer],
    ]);
  }

  resolveRunner(scanner: VulnScanner, target: ScannerRunTarget): ScannerRunner {
    const runner = this.runners.get(scanner);
    if (!runner) {
      throw new AppException(
        'VULN_SCANNER_NOT_SUPPORTED_FOR_TARGET_TYPE',
        `No ScannerRunner registered for ${scanner}`,
      );
    }
    if (!isScannerCompatibleWithTargetType(scanner, target.type)) {
      throw new AppException(
        'VULN_SCANNER_NOT_SUPPORTED_FOR_TARGET_TYPE',
        `${scanner} does not support target type ${target.type}`,
      );
    }
    return runner;
  }

  resolveNormalizer(scanner: VulnScanner): Normalizer {
    const normalizer = this.normalizers.get(scanner);
    if (!normalizer) {
      throw new AppException(
        'VULN_SCANNER_NOT_SUPPORTED_FOR_TARGET_TYPE',
        `No Normalizer registered for ${scanner}`,
      );
    }
    return normalizer;
  }
}
