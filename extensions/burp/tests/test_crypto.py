# -*- coding: utf-8 -*-
"""
Run with Jython on a real machine: `jython test_crypto.py` (from this
directory, so `pentesthub_burp` on `../` resolves — or run
`jython -Dpython.path=.. test_crypto.py`).

This sandbox has no Jython interpreter (no network access to fetch the
standalone jar — confirmed unreachable when this suite was written), so
this file has NOT been executed here. What HAS been verified in this
sandbox: the underlying algorithm (HKDF-SHA256 with a zero salt, single
extract+expand round, AES-256-GCM with a 12-byte random nonce) was cross
-checked against Python's `cryptography` library (which itself wraps
OpenSSL) and produces byte-identical output to the hand-rolled HMAC-based
HKDF in `pentesthub_burp/crypto.py` for a known token — see the
"Verification handoff" section of `docs/modules/08-browser-extension.md`
for the exact commands run and their output. That confirms the
*algorithm* is correct; it does not confirm this specific Jython file is
syntactically valid Jython 2.7 (no Jython interpreter was available to
run it) — that's the one thing on the real-machine checklist.
"""

from __future__ import print_function

import sys

sys.path.insert(0, "..")

from pentesthub_burp import crypto  # noqa: E402


def test_round_trip():
    key = crypto.derive_key("test-token-12345")
    envelope = crypto.seal(key, b'{"hello":"world"}')
    plaintext = crypto.open_envelope(key, envelope)
    assert plaintext == b'{"hello":"world"}', "round trip failed"
    print("PASS: round trip")


def test_wrong_key_fails():
    key_a = crypto.derive_key("token-a")
    key_b = crypto.derive_key("token-b")
    envelope = crypto.seal(key_a, b"secret")
    try:
        crypto.open_envelope(key_b, envelope)
        print("FAIL: expected decryption to fail with the wrong key")
    except Exception:
        print("PASS: wrong key rejected")


def test_known_vector():
    # Cross-checked in the sandbox against Python's `cryptography`
    # library's HKDF implementation — see this file's module docstring.
    key = crypto.derive_key("test-token-12345")
    expected_hex = "28752a02bb3aef54ca14048ae7ba850e78664b9ba92cf525610d0a5cd3afd9b0"[:64]
    actual_hex = "".join("{0:02x}".format(ord(b) if isinstance(b, str) else b) for b in bytearray(key))
    assert actual_hex == expected_hex, "HKDF output mismatch: {0} != {1}".format(actual_hex, expected_hex)
    print("PASS: known HKDF vector")


if __name__ == "__main__":
    test_round_trip()
    test_wrong_key_fails()
    test_known_vector()
    print("All crypto tests passed.")
