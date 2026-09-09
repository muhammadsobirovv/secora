// Package pentesthub is the official Go client for the PentestHub AI
// REST API. It covers the same v1 resource scope as the TypeScript
// (packages/sdk-typescript) and Python (sdks/python) SDKs: Auth,
// Organizations, the Distributed Job System, the Plugin registry/
// installations, Integrations, (Module 16) the Knowledge Graph query
// layer and Extension API registry, (Module 17, task #491) the
// SOC/Assets/Threat-Intel/Incidents/Remediation/Risk/SLA surfaces, and
// (Module 20) API Keys (ApiKeysResource — live on the server since
// Module 15 task #336 but never wrapped in this SDK until this parity
// pass).
//
// It has zero third-party dependencies — built entirely on net/http and
// encoding/json from the standard library — following the same
// "no dependency this environment can't verify installs cleanly"
// posture as the Python SDK's urllib-only implementation.
package pentesthub

import "net/http"

// Options configures a new Client.
type Options struct {
	// BaseURL is the PentestHub AI API origin, e.g.
	// "https://api.your-company.com". Required.
	BaseURL string
	// AccessToken, if set, is used as the initial bearer token (e.g. when
	// restoring a persisted session). Login/Refresh will overwrite it.
	AccessToken string
	// APIKey, if set, authenticates as a service account / worker via the
	// X-API-Key header instead of a user JWT. Takes precedence over
	// AccessToken on every request.
	APIKey string
	// HTTPClient overrides the underlying *http.Client (timeouts,
	// transport, proxying, etc.). Defaults to a client with a 30s request
	// timeout (see defaultRequestTimeout in http_client.go) — not
	// http.DefaultClient, which has no timeout at all.
	HTTPClient *http.Client
	// OnTokenRefreshed is called whenever the client obtains or updates
	// its access token, so callers can persist it (e.g. to a keychain or
	// config file) between process runs.
	OnTokenRefreshed TokenRefreshedFunc
}

// Client is the top-level PentestHub AI SDK entry point, grouping every
// resource under one struct — mirrors the TypeScript SDK's
// PentestHubClient and the Python SDK's PentestHubClient.
type Client struct {
	http *HttpClient

	Auth            *AuthResource
	Organizations   *OrganizationsResource
	DistributedJobs *DistributedJobsResource
	Plugins         *PluginsResource
	Integrations    *IntegrationsResource
	KnowledgeGraph  *KnowledgeGraphResource
	Extensions      *ExtensionsResource
	Soc             *SocResource
	Assets          *AssetsResource
	ThreatIntel     *ThreatIntelResource
	Incidents       *IncidentsResource
	Remediation     *RemediationResource
	Risk            *RiskResource
	Sla             *SlaResource
	ApiKeys         *ApiKeysResource
}

// New constructs a Client from Options.
func New(opts Options) *Client {
	httpClient := NewHttpClient(HttpClientOptions{
		BaseURL:          opts.BaseURL,
		AccessToken:      opts.AccessToken,
		APIKey:           opts.APIKey,
		HTTPClient:       opts.HTTPClient,
		OnTokenRefreshed: opts.OnTokenRefreshed,
	})

	return &Client{
		http:            httpClient,
		Auth:            &AuthResource{http: httpClient},
		Organizations:   &OrganizationsResource{http: httpClient},
		DistributedJobs: &DistributedJobsResource{http: httpClient},
		Plugins:         &PluginsResource{http: httpClient},
		Integrations:    &IntegrationsResource{http: httpClient},
		KnowledgeGraph:  &KnowledgeGraphResource{http: httpClient},
		Extensions:      &ExtensionsResource{http: httpClient},
		Soc:             &SocResource{http: httpClient},
		Assets:          &AssetsResource{http: httpClient},
		ThreatIntel:     &ThreatIntelResource{http: httpClient},
		Incidents:       &IncidentsResource{http: httpClient},
		Remediation:     &RemediationResource{http: httpClient},
		Risk:            &RiskResource{http: httpClient},
		Sla:             &SlaResource{http: httpClient},
		ApiKeys:         &ApiKeysResource{http: httpClient},
	}
}

// SetAccessToken manually sets the bearer token used for subsequent
// requests — useful when restoring a session without calling Login.
func (c *Client) SetAccessToken(token string) {
	c.http.SetAccessToken(token)
}

// SetAPIKey switches the client to service-account / worker
// authentication (X-API-Key header).
func (c *Client) SetAPIKey(key string) {
	c.http.SetAPIKey(key)
}
