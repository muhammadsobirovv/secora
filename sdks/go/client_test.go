package pentesthub

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// These tests run against a real local httptest.Server — no mocking of
// the HTTP transport — the same "genuinely exercise the transport layer"
// standard used by the Python SDK's tests (sdks/python/tests/test_client.py,
// which runs against a real http.server.HTTPServer). NOTE: this file has
// NOT been verified with `go test` in this sandbox because the Go
// toolchain is not installed here (`go: command not found`); it must be
// run in a real environment before this SDK is published. See
// sdks/go/README.md's "Verification status" section for the full
// disclosure.
func newTestServer(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()

	mux.HandleFunc("/auth/login", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		var body map[string]string
		_ = json.NewDecoder(r.Body).Decode(&body)
		w.Header().Set("Content-Type", "application/json")
		if body["email"] == "user@example.com" && body["password"] == "correct-password" {
			w.WriteHeader(http.StatusOK)
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"accessToken":  "test-access-token",
				"refreshToken": "test-refresh-token",
				"expiresIn":    900,
			})
			return
		}
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"statusCode": 401,
			"code":       "INVALID_CREDENTIALS",
			"message":    "Invalid email or password.",
		})
	})

	mux.HandleFunc("/enterprise/organizations", func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		if auth != "Bearer test-access-token" {
			w.WriteHeader(http.StatusUnauthorized)
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"statusCode": 401,
				"code":       "INVALID_OR_EXPIRED_TOKEN",
				"message":    "Missing/invalid token.",
			})
			return
		}
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode([]map[string]interface{}{
			{"id": "org-1", "name": "Acme Security", "slug": "acme-security", "status": "ACTIVE"},
		})
	})

	mux.HandleFunc("/enterprise/organizations/org-404", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"statusCode": 404,
			"code":       "ORGANIZATION_NOT_FOUND",
			"message":    "Organization not found.",
		})
	})

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return server
}

func TestLoginSuccessSetsAccessTokenAndSubsequentCallsAuthenticate(t *testing.T) {
	server := newTestServer(t)
	client := New(Options{BaseURL: server.URL})

	tokens, mfa, err := client.Auth.Login(context.Background(), LoginRequest{Email: "user@example.com", Password: "correct-password"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if mfa.MfaRequired {
		t.Fatalf("expected no MFA challenge")
	}
	if tokens.AccessToken != "test-access-token" {
		t.Fatalf("expected access token to be set, got %q", tokens.AccessToken)
	}

	orgs, err := client.Organizations.List(context.Background())
	if err != nil {
		t.Fatalf("unexpected error listing organizations: %v", err)
	}
	if len(orgs) != 1 || orgs[0].Slug != "acme-security" {
		t.Fatalf("unexpected organizations response: %+v", orgs)
	}
}

func TestLoginFailureReturnsAPIErrorWithCode(t *testing.T) {
	server := newTestServer(t)
	client := New(Options{BaseURL: server.URL})

	_, _, err := client.Auth.Login(context.Background(), LoginRequest{Email: "user@example.com", Password: "wrong-password"})
	if err == nil {
		t.Fatal("expected an error")
	}
	apiErr, ok := err.(*APIError)
	if !ok {
		t.Fatalf("expected *APIError, got %T", err)
	}
	if apiErr.Code != "INVALID_CREDENTIALS" || apiErr.StatusCode != 401 {
		t.Fatalf("unexpected APIError: %+v", apiErr)
	}
}

func TestUnauthenticatedRequestReturns401(t *testing.T) {
	server := newTestServer(t)
	client := New(Options{BaseURL: server.URL})

	_, err := client.Organizations.List(context.Background())
	if err == nil {
		t.Fatal("expected an error")
	}
	apiErr, ok := err.(*APIError)
	if !ok || apiErr.StatusCode != 401 {
		t.Fatalf("expected 401 *APIError, got %+v", err)
	}
}

func TestSetAccessTokenDirectly(t *testing.T) {
	server := newTestServer(t)
	client := New(Options{BaseURL: server.URL})
	client.SetAccessToken("test-access-token")

	orgs, err := client.Organizations.List(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(orgs) != 1 || orgs[0].ID != "org-1" {
		t.Fatalf("unexpected organizations response: %+v", orgs)
	}
}

func TestNotFoundErrorPropagatesCode(t *testing.T) {
	server := newTestServer(t)
	client := New(Options{BaseURL: server.URL, AccessToken: "test-access-token"})

	_, err := client.Organizations.Get(context.Background(), "org-404")
	if err == nil {
		t.Fatal("expected an error")
	}
	apiErr, ok := err.(*APIError)
	if !ok || apiErr.Code != "ORGANIZATION_NOT_FOUND" {
		t.Fatalf("unexpected error: %+v", err)
	}
}
