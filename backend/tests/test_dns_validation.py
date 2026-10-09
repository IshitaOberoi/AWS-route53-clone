"""Unit tests for the pure DNS validation module."""

import pytest

from app.dns_validation import (
    DnsValueError,
    normalize_domain_name,
    record_fqdn,
    relative_name,
    validate_geo_location,
    validate_value,
    validate_values,
)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("example.com", "example.com."),
        ("Example.COM.", "example.com."),
        ("  sub.example.co.uk ", "sub.example.co.uk."),
        ("_acme.example.com", "_acme.example.com."),
        ("bücher.de", "xn--bcher-kva.de."),
        ("localhost", "localhost."),
    ],
)
def test_normalize_domain_name_ok(raw: str, expected: str) -> None:
    assert normalize_domain_name(raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "",
        ".",
        "a..b",
        "-a.com",
        "a-.com",
        "a b.com",
        "a!.com",
        "x" * 64 + ".com",
        "*.example.com",
        ("a" * 60 + ".") * 5 + "com",
    ],
)
def test_normalize_domain_name_invalid(raw: str) -> None:
    with pytest.raises(DnsValueError):
        normalize_domain_name(raw)


def test_record_fqdn() -> None:
    zone = "example.com."
    assert record_fqdn("", zone) == zone
    assert record_fqdn("@", zone) == zone
    assert record_fqdn("WWW", zone) == "www.example.com."
    assert record_fqdn("*", zone) == "*.example.com."
    assert record_fqdn("*.dev", zone) == "*.dev.example.com."
    assert record_fqdn("api.example.com.", zone) == "api.example.com."
    for bad in ["a.*", "dev.*.x", "other.org.", "-x", "a..b"]:
        with pytest.raises(DnsValueError):
            record_fqdn(bad, zone)
    assert relative_name("www.example.com.", zone) == "www"
    assert relative_name(zone, zone) == ""


VALID = {
    "A": [("192.0.2.1", "192.0.2.1")],
    "AAAA": [("2001:0db8:0000:0000:0000:0000:0000:0001", "2001:db8::1")],
    "CNAME": [
        ("target.example.com", "target.example.com"),
        ("Target.Example.com.", "target.example.com."),
    ],
    "TXT": [
        ("hello world", '"hello world"'),
        ('"v=spf1 -all"', '"v=spf1 -all"'),
        ('"part one" "part two"', '"part one" "part two"'),
        ('say "hi"', '"say \\"hi\\""'),
    ],
    "MX": [("10 mail.example.com", "10 mail.example.com")],
    "NS": [("ns1.example.net.", "ns1.example.net.")],
    "PTR": [("host.example.com", "host.example.com")],
    "SRV": [("1 10 5269 xmpp.example.com.", "1 10 5269 xmpp.example.com.")],
    "CAA": [
        ('0 issue "amazon.com"', '0 issue "amazon.com"'),
        ('128 IODEF "mailto:a@b.c"', '128 iodef "mailto:a@b.c"'),
    ],
    "SOA": [
        (
            "ns-1.awsdns-01.com. awsdns-hostmaster.amazon.com. 1 7200 900 1209600 86400",
            "ns-1.awsdns-01.com. awsdns-hostmaster.amazon.com. 1 7200 900 1209600 86400",
        )
    ],
}

INVALID = {
    "A": ["256.1.1.1", "1.2.3", "::1", "01.2.3.4", "abc"],
    "AAAA": ["192.0.2.1", "2001:db8::g", "1:2:3"],
    "CNAME": ["bad host.com", "-x.com", "a..b"],
    "TXT": ['"unterminated', '"a" junk', "x" * 256, '"' + "y" * 256 + '"'],
    "MX": ["mail.example.com", "70000 mail.example.com", "-1 mail.example.com", "10"],
    "NS": ["", "a b"],
    "PTR": ["not valid!"],
    "SRV": ["1 10 5269", "1 10 70000 x.com", "a b c d"],
    "CAA": ["0 issue amazon.com", '0 badtag "x"', '256 issue "x"', "0 issue"],
    "SOA": ["ns. host. 1 2 3", "ns. host. 1 2 3 4 x"],
}


@pytest.mark.parametrize(
    ("rtype", "raw", "expected"), [(t, r, e) for t, cases in VALID.items() for r, e in cases]
)
def test_valid_values(rtype: str, raw: str, expected: str) -> None:
    assert validate_value(rtype, raw) == expected


@pytest.mark.parametrize(("rtype", "raw"), [(t, r) for t, cases in INVALID.items() for r in cases])
def test_invalid_values(rtype: str, raw: str) -> None:
    with pytest.raises(DnsValueError):
        validate_value(rtype, raw)


def test_validate_values_drops_blank_lines_and_keeps_indexes() -> None:
    values, errors = validate_values("A", ["192.0.2.1", "", "  ", "999.0.0.1", " 192.0.2.2 "])
    assert values == ["192.0.2.1", "192.0.2.2"]
    assert errors == {3: "Invalid IPv4 address."}


def test_geo_location() -> None:
    assert validate_geo_location("eu") == "EU"
    assert validate_geo_location("IN") == "IN"
    assert validate_geo_location("US-CA") == "US-CA"
    assert validate_geo_location("*") == "*"
    with pytest.raises(DnsValueError):
        validate_geo_location("Europe")
