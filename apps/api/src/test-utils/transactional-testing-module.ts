import { Test, type TestingModule } from '@nestjs/testing';
import type { Provider } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';
import {
  ClsPluginTransactional,
  NoOpTransactionalAdapter,
} from '@nestjs-cls/transactional';

/// For unit-testing a use-case whose execute() is @Transactional(): that
/// decorator needs a live TransactionHost, which only exists after
/// ClsPluginTransactional's onModuleInit hook runs — bare `new
/// SomeUseCase(...)` throws "TransactionHost not initialized".
/// NoOpTransactionalAdapter is the package's own answer for exactly this:
/// a real transaction host that never touches a database, so tests built
/// on this stay unit tests — every repository/service dependency is still
/// a plain jest mock supplied via `providers`.
export async function compileTransactionalTestingModule(
  providers: Provider[],
): Promise<TestingModule> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ClsModule.forRoot({
        plugins: [
          new ClsPluginTransactional({
            imports: [],
            adapter: new NoOpTransactionalAdapter({
              tx: {},
              disableWarning: true,
            }),
          }),
        ],
      }),
    ],
    providers,
  }).compile();

  // ClsPluginTransactional registers TransactionHost in an onModuleInit
  // lifecycle hook — compile() alone doesn't run those.
  await moduleRef.init();
  return moduleRef;
}
