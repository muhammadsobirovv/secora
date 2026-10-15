"""Unit tests for the Python SDK, run against a real local HTTP server
(``http.server``) so the transport layer (``urllib.request``-based
``HttpClient``) is genuinely exercised end-to-end rather than mocked —
the same "real, working code over a mock" standard as the rest of this
project's tests.
"""

from __future__ import annotations

import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pentesthub_ai import SecoraApiError, SecoraClient  # noqa: E402


class _FakeApiHandler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:  # noqa: A002 - silence test server logs
        pass

    def _send_json(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler naming convention
        if self.path == "/enterprise/organizations":
            auth_header = self.headers.get("Authorization")
            if auth_header != "Bearer test-access-token":
                self._send_json(401, {"statusCode": 401, "code": "INVALID_OR_EXPIRED_TOKEN", "message": "Missing/invalid token."})
                return
            self._send_json(200, [{"id": "org-1", "name": "Acme Security", "slug": "acme-security"}])
            return
        if self.path.startswith("/enterprise/organizations/org-404"):
            self._send_json(404, {"statusCode": 404, "code": "ORGANIZATION_NOT_FOUND", "message": "Organization not found."})
            return
        self._send_json(404, {"statusCode": 404, "code": "UNKNOWN_ERROR", "message": "no route"})

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length)) if length else {}
        if self.path == "/auth/login":
            if body.get("email") == "user@example.com" and body.get("password") == "correct-password":
                self._send_json(200, {"accessToken": "test-access-token", "refreshToken": "test-refresh-token", "expiresIn": 900})
            else:
                self._send_json(401, {"statusCode": 401, "code": "INVALID_CREDENTIALS", "message": "Invalid email or password."})
            return
        self._send_json(404, {"statusCode": 404, "code": "UNKNOWN_ERROR", "message": "no route"})


class SecoraClientTests(unittest.TestCase):
    server: HTTPServer
    thread: threading.Thread
    base_url: str

    @classmethod
    def setUpClass(cls) -> None:
        cls.server = HTTPServer(("127.0.0.1", 0), _FakeApiHandler)
        cls.base_url = f"http://127.0.0.1:{cls.server.server_port}"
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.thread.join(timeout=5)

    def test_login_success_sets_access_token_and_subsequent_calls_authenticate(self) -> None:
        client = SecoraClient(base_url=self.base_url)
        tokens = client.auth.login(email="user@example.com", password="correct-password")
        self.assertEqual(tokens["accessToken"], "test-access-token")

        orgs = client.organizations.list()
        self.assertEqual(len(orgs), 1)
        self.assertEqual(orgs[0]["slug"], "acme-security")

    def test_login_failure_raises_pentesthub_api_error_with_code(self) -> None:
        client = SecoraClient(base_url=self.base_url)
        with self.assertRaises(SecoraApiError) as ctx:
            client.auth.login(email="user@example.com", password="wrong-password")
        self.assertEqual(ctx.exception.code, "INVALID_CREDENTIALS")
        self.assertEqual(ctx.exception.status_code, 401)

    def test_unauthenticated_request_raises_401(self) -> None:
        client = SecoraClient(base_url=self.base_url)
        with self.assertRaises(SecoraApiError) as ctx:
            client.organizations.list()
        self.assertEqual(ctx.exception.status_code, 401)

    def test_set_access_token_directly(self) -> None:
        client = SecoraClient(base_url=self.base_url)
        client.set_access_token("test-access-token")
        orgs = client.organizations.list()
        self.assertEqual(orgs[0]["id"], "org-1")

    def test_not_found_error_propagates_code(self) -> None:
        client = SecoraClient(base_url=self.base_url, access_token="test-access-token")
        with self.assertRaises(SecoraApiError) as ctx:
            client.organizations.get("org-404")
        self.assertEqual(ctx.exception.code, "ORGANIZATION_NOT_FOUND")


if __name__ == "__main__":
    unittest.main()
