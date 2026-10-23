import { Module } from '@nestjs/common';
import { RoeCoverageService } from './roe-coverage.service.js';

/// The read-only side of client engagements (ROE): "does an approved
/// engagement cover this target now?". Imported by the authorization gate and
/// by the scan worker; has no controllers and no dependency on either.
@Module({
  providers: [RoeCoverageService],
  exports: [RoeCoverageService],
})
export class RoeCoreModule {}
