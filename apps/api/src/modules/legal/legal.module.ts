import { Global, Module } from '@nestjs/common';
import { LegalController } from './legal.controller.js';
import { LegalService } from './legal.service.js';
import { LegalAcceptanceGuard } from './legal-acceptance.guard.js';

/// Global so RegisterUseCase (auth) can record acceptance in the same
/// transaction as account creation, and so the app-wide
/// LegalAcceptanceGuard can resolve LegalService.
@Global()
@Module({
  controllers: [LegalController],
  providers: [LegalService, LegalAcceptanceGuard],
  exports: [LegalService, LegalAcceptanceGuard],
})
export class LegalModule {}
