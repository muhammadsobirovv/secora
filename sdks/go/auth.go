package pentesthub

import "context"

// AuthResource covers /auth/* — mirrors AUTH_ENDPOINTS in
// packages/shared/src/auth-endpoints.ts. Only the subset the SDK v1
// surface needs (login/refresh/logout/me) is wrapped; registration,
// email verification, and password reset stay REST/web-flow-only for
// now, consistent with the TypeScript and Python SDKs' v1 scope.
type AuthResource struct {
	http *HttpClient
}

// LoginRequest mirrors LoginRequestDto.
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// RefreshRequest mirrors RefreshRequestDto.
type RefreshRequest struct {
	RefreshToken string `json:"refreshToken"`
}

// AuthTokens mirrors AuthTokensDto.
type AuthTokens struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
	ExpiresIn    int    `json:"expiresIn"`
}

// MfaRequiredResponse mirrors MfaRequiredResponseDto — returned by
// Login instead of AuthTokens when the account has MFA enabled.
type MfaRequiredResponse struct {
	MfaRequired  bool   `json:"mfaRequired"`
	MfaChallenge string `json:"mfaChallengeToken"`
}

// AuthenticatedUser mirrors the fields of AuthenticatedUserDto that are
// stable across the REST/GraphQL/SDK surfaces.
type AuthenticatedUser struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
}

// loginResponse is used to detect, via the presence of accessToken,
// whether the server returned full tokens or an MFA challenge — Go has
// no discriminated union, so both fields are declared and only one set
// will be populated, matching the 'accessToken' in result check the
// TypeScript SDK performs at runtime.
type loginResponse struct {
	AuthTokens
	MfaRequired  bool   `json:"mfaRequired"`
	MfaChallenge string `json:"mfaChallengeToken"`
}

// Login exchanges credentials for tokens. If the account has MFA
// enabled, mfaRequired will be true on the returned struct and
// AccessToken will be empty — the caller must complete the MFA
// challenge via the REST API directly (not yet wrapped in this SDK).
func (a *AuthResource) Login(ctx context.Context, req LoginRequest) (AuthTokens, MfaRequiredResponse, error) {
	var resp loginResponse
	if err := a.http.Post(ctx, "/auth/login", req, &resp); err != nil {
		return AuthTokens{}, MfaRequiredResponse{}, err
	}
	if resp.AccessToken != "" {
		a.http.SetAccessToken(resp.AccessToken)
		return resp.AuthTokens, MfaRequiredResponse{}, nil
	}
	return AuthTokens{}, MfaRequiredResponse{MfaRequired: resp.MfaRequired, MfaChallenge: resp.MfaChallenge}, nil
}

// Refresh exchanges a refresh token for a new token pair and updates
// the client's stored access token.
func (a *AuthResource) Refresh(ctx context.Context, req RefreshRequest) (AuthTokens, error) {
	var resp AuthTokens
	if err := a.http.Post(ctx, "/auth/refresh", req, &resp); err != nil {
		return AuthTokens{}, err
	}
	a.http.SetAccessToken(resp.AccessToken)
	return resp, nil
}

// Logout invalidates the given refresh token server-side.
func (a *AuthResource) Logout(ctx context.Context, req RefreshRequest) error {
	return a.http.Post(ctx, "/auth/logout", req, nil)
}

// Me returns the profile of the currently authenticated user.
func (a *AuthResource) Me(ctx context.Context) (AuthenticatedUser, error) {
	var out AuthenticatedUser
	err := a.http.Get(ctx, "/auth/me", nil, &out)
	return out, err
}
