package pentesthub

import "fmt"

// APIError is returned for any non-2xx REST response. It carries the
// parsed AppErrorResponseDto shape (statusCode/code/message) every
// Secora AI API handler produces on error — see
// packages/shared/src/errors.ts's AppErrorCode union — so callers can
// branch on Code instead of string-matching Message, the same contract
// the TypeScript and Python SDKs expose as SecoraApiError.
type APIError struct {
	StatusCode int    `json:"statusCode"`
	Code       string `json:"code"`
	Message    string `json:"message"`
}

func (e *APIError) Error() string {
	if e.Message != "" {
		return fmt.Sprintf("pentesthub: %s (code=%s, status=%d)", e.Message, e.Code, e.StatusCode)
	}
	return fmt.Sprintf("pentesthub: request failed with status %d", e.StatusCode)
}
