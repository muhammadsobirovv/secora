package pentesthub

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
)

// TokenRefreshedFunc is invoked whenever the client establishes or updates
// its access token (e.g. after Auth.Login or a manual SetAccessToken call),
// mirroring the onTokenRefreshed hook exposed by the TypeScript SDK's
// HttpClientOptions.
type TokenRefreshedFunc func(accessToken string)

// HttpClientOptions configures a new HttpClient. BaseURL is required;
// AccessToken/APIKey are optional and mutually usable (a caller may start
// unauthenticated, then call SetAccessToken after Auth.Login).
type HttpClientOptions struct {
	BaseURL            string
	AccessToken        string
	APIKey             string
	HTTPClient         *http.Client
	OnTokenRefreshed   TokenRefreshedFunc
}

// HttpClient is the shared transport used by every resource group. It is
// safe for concurrent use: the bearer token is guarded by a mutex since
// SetAccessToken may be called from a login flow concurrently with other
// in-flight requests.
type HttpClient struct {
	baseURL          string
	httpClient       *http.Client
	onTokenRefreshed TokenRefreshedFunc

	mu          sync.RWMutex
	accessToken string
	apiKey      string
}

// NewHttpClient constructs an HttpClient from HttpClientOptions.
func NewHttpClient(opts HttpClientOptions) *HttpClient {
	client := opts.HTTPClient
	if client == nil {
		client = http.DefaultClient
	}
	return &HttpClient{
		baseURL:          strings.TrimRight(opts.BaseURL, "/"),
		httpClient:       client,
		onTokenRefreshed: opts.OnTokenRefreshed,
		accessToken:      opts.AccessToken,
		apiKey:           opts.APIKey,
	}
}

// SetAccessToken updates the bearer token used for subsequent requests and
// fires OnTokenRefreshed if configured — used by Auth.Login/Auth.Refresh
// and by callers restoring a persisted session.
func (c *HttpClient) SetAccessToken(token string) {
	c.mu.Lock()
	c.accessToken = token
	c.mu.Unlock()
	if c.onTokenRefreshed != nil {
		c.onTokenRefreshed(token)
	}
}

// SetAPIKey switches the client to service-account / worker authentication
// (X-API-Key header) instead of a user JWT bearer token.
func (c *HttpClient) SetAPIKey(key string) {
	c.mu.Lock()
	c.apiKey = key
	c.mu.Unlock()
}

func (c *HttpClient) authHeaders() (bearer string, apiKey string) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.accessToken, c.apiKey
}

// Query is a small helper for building url.Values from a plain map,
// skipping empty values — used by resource methods that take optional
// filters (status, cursor, limit, etc.), mirroring the TypeScript SDK's
// buildQuery helper.
func Query(params map[string]string) url.Values {
	values := url.Values{}
	for k, v := range params {
		if v != "" {
			values.Set(k, v)
		}
	}
	return values
}

// Request performs a single HTTP call against the API and decodes the JSON
// response body into out (which may be nil for responses with no body,
// e.g. 204 No Content). On a non-2xx response it parses the standard
// AppErrorResponseDto body and returns an *APIError.
func (c *HttpClient) Request(ctx context.Context, method, path string, query url.Values, body interface{}, out interface{}) error {
	fullURL := c.baseURL + path
	if query != nil && len(query) > 0 {
		fullURL += "?" + query.Encode()
	}

	var reqBody io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("pentesthub: failed to encode request body: %w", err)
		}
		reqBody = bytes.NewReader(encoded)
	}

	req, err := http.NewRequestWithContext(ctx, method, fullURL, reqBody)
	if err != nil {
		return fmt.Errorf("pentesthub: failed to build request: %w", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Accept", "application/json")

	bearer, apiKey := c.authHeaders()
	if apiKey != "" {
		req.Header.Set("X-API-Key", apiKey)
	} else if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("pentesthub: request failed: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("pentesthub: failed to read response body: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		apiErr := &APIError{StatusCode: resp.StatusCode}
		// Best-effort parse of AppErrorResponseDto; if the body isn't JSON
		// (e.g. an upstream proxy error page), fall back to the raw text
		// as the message, same fallback behavior as the Python SDK.
		if jsonErr := json.Unmarshal(respBytes, apiErr); jsonErr != nil || apiErr.Code == "" {
			apiErr.Code = "UNKNOWN_ERROR"
			if len(respBytes) > 0 {
				apiErr.Message = string(respBytes)
			}
		}
		return apiErr
	}

	if out == nil || len(respBytes) == 0 {
		return nil
	}
	if err := json.Unmarshal(respBytes, out); err != nil {
		return fmt.Errorf("pentesthub: failed to decode response body: %w", err)
	}
	return nil
}

func (c *HttpClient) Get(ctx context.Context, path string, query url.Values, out interface{}) error {
	return c.Request(ctx, http.MethodGet, path, query, nil, out)
}

func (c *HttpClient) Post(ctx context.Context, path string, body interface{}, out interface{}) error {
	return c.Request(ctx, http.MethodPost, path, nil, body, out)
}

func (c *HttpClient) Patch(ctx context.Context, path string, body interface{}, out interface{}) error {
	return c.Request(ctx, http.MethodPatch, path, nil, body, out)
}

func (c *HttpClient) Delete(ctx context.Context, path string, out interface{}) error {
	return c.Request(ctx, http.MethodDelete, path, nil, nil, out)
}
