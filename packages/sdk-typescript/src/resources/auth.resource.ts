import { AUTH_ENDPOINTS } from '@pentesthub/shared';
import type { AuthenticatedUserDto, AuthTokensDto, LoginRequestDto, MfaRequiredResponseDto, RefreshRequestDto } from '@pentesthub/shared';
import type { HttpClient } from '../http-client.js';

export class AuthResource {
  constructor(
    private readonly http: HttpClient,
    private readonly onLoginSuccess: (tokens: AuthTokensDto) => void,
  ) {}

  /// Returns either full tokens, or an `MfaRequiredResponseDto` the
  /// caller must resolve via `mfaChallenge()` before receiving tokens —
  /// mirrors exactly what `POST /auth/login` returns server-side.
  async login(request: LoginRequestDto): Promise<AuthTokensDto | MfaRequiredResponseDto> {
    const result = await this.http.post<AuthTokensDto | MfaRequiredResponseDto>(AUTH_ENDPOINTS.login, request);
    if ('accessToken' in result) this.onLoginSuccess(result);
    return result;
  }

  async refresh(request: RefreshRequestDto): Promise<AuthTokensDto> {
    const tokens = await this.http.post<AuthTokensDto>(AUTH_ENDPOINTS.refresh, request);
    this.onLoginSuccess(tokens);
    return tokens;
  }

  async logout(request: RefreshRequestDto): Promise<void> {
    await this.http.post<void>(AUTH_ENDPOINTS.logout, request);
  }

  me(): Promise<AuthenticatedUserDto> {
    return this.http.get<AuthenticatedUserDto>(AUTH_ENDPOINTS.me);
  }
}
