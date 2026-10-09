// Client-side mirror of backend/app/dns_validation.py. The backend stays authoritative; these
// checks only exist to show the same messages inline before submitting.

export const MAX_DOMAIN_LENGTH = 253;
export const MAX_LABEL_LENGTH = 63;
export const MAX_DESCRIPTION_LENGTH = 256;
export const MAX_TAGS = 50;

const LABEL_RE = /^[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?$/;

function checkLabels(labels: string[], allowWildcard: boolean): string | null {
  for (const [index, label] of labels.entries()) {
    if (label === '') return 'Domain name labels cannot be empty (check for consecutive dots).';
    if (label === '*') {
      if (allowWildcard && index === 0) continue;
      return 'A wildcard (*) is only allowed as the leftmost label.';
    }
    if (label.length > MAX_LABEL_LENGTH) {
      return `Each label can have up to ${MAX_LABEL_LENGTH} characters.`;
    }
    if (label.startsWith('-') || label.endsWith('-')) {
      return 'Labels cannot start or end with a hyphen.';
    }
    // Non-ASCII labels are IDNA-encoded by the backend; only validate ASCII ones here.
    if (/^[\x00-\x7f]*$/.test(label) && !LABEL_RE.test(label)) {
      return 'Labels can contain only letters, digits, hyphens (-) and underscores (_).';
    }
  }
  return null;
}

/** Validates a hosted zone domain name. Returns an error message or null. */
export function validateDomainName(raw: string): string | null {
  let text = raw.trim();
  if (text.endsWith('.')) text = text.slice(0, -1);
  if (!text) return 'Enter a domain name.';
  if (text.length > MAX_DOMAIN_LENGTH) {
    return `The domain name can have up to ${MAX_DOMAIN_LENGTH} characters.`;
  }
  return checkLabels(text.toLowerCase().split('.'), false);
}

/** Validates the relative record name typed next to the ".zone" suffix (empty = apex). */
export function validateRecordName(raw: string, zoneFqdn: string): string | null {
  const text = raw.trim().toLowerCase();
  if (text === '' || text === '@') return null;
  if (text.endsWith('.')) return 'Enter the name relative to the hosted zone (no trailing dot).';
  if (text.length + zoneFqdn.length > MAX_DOMAIN_LENGTH + 1) {
    return `The record name can have up to ${MAX_DOMAIN_LENGTH} characters.`;
  }
  return checkLabels(text.split('.'), true);
}

export function validateDescription(text: string): string | null {
  return text.length > MAX_DESCRIPTION_LENGTH
    ? `The description can have up to ${MAX_DESCRIPTION_LENGTH} characters.`
    : null;
}

// --- record values (mirror of the per-type rules in dns_validation.py) ------------------

export const MAX_TTL = 2147483647;
const MAX_UINT16 = 65535;
const MAX_UINT32 = 4294967295;
const MAX_TXT_STRING = 255;
const CAA_TAGS = ['issue', 'issuewild', 'iodef'];
const TXT_STRING_RE = /"((?:[^"\\]|\\.)*)"/y;

class ValueError extends Error {}

function intInRange(text: string, low: number, high: number, what: string): number {
  if (!/^\d+$/.test(text))
    throw new ValueError(`${what} must be an integer between ${low} and ${high}.`);
  const value = Number(text);
  if (value < low || value > high) {
    throw new ValueError(`${what} must be an integer between ${low} and ${high}.`);
  }
  return value;
}

function targetDomain(value: string): void {
  const text = value.trim();
  if (!text) throw new ValueError('Enter a domain name.');
  const bare = text.endsWith('.') ? text.slice(0, -1) : text;
  if (!bare) throw new ValueError('Invalid domain name.');
  if (bare.length > MAX_DOMAIN_LENGTH) throw new ValueError('Invalid domain name: too long.');
  const error = checkLabels(bare.toLowerCase().split('.'), false);
  if (error) throw new ValueError(`Invalid domain name. ${error}`);
}

export function isIPv4(text: string): boolean {
  const parts = text.split('.');
  return (
    parts.length === 4 &&
    parts.every((part) => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255)
  );
}

export function isIPv6(text: string): boolean {
  if (!/^[0-9a-fA-F:.]+$/.test(text) || !text.includes(':')) return false;
  let address = text;
  let groupsNeeded = 8;
  const lastColon = address.lastIndexOf(':');
  const tail = address.slice(lastColon + 1);
  if (tail.includes('.')) {
    if (!isIPv4(tail)) return false;
    address = `${address.slice(0, lastColon + 1)}0:0`;
  }
  const doubleColon = address.split('::');
  if (doubleColon.length > 2) return false;
  const head = doubleColon[0] ? doubleColon[0].split(':') : [];
  const rest = doubleColon.length === 2 && doubleColon[1] ? doubleColon[1].split(':') : [];
  const groups = [...head, ...rest];
  if (!groups.every((group) => /^[0-9a-fA-F]{1,4}$/.test(group))) return false;
  if (doubleColon.length === 2) return groups.length < groupsNeeded;
  groupsNeeded -= groups.length;
  return groupsNeeded === 0;
}

function validateTxt(value: string): void {
  const text = value.trim();
  if (!text.startsWith('"')) {
    if (text.length > MAX_TXT_STRING) {
      throw new ValueError(
        `Each TXT string can have up to ${MAX_TXT_STRING} characters. Split longer values into multiple quoted strings: "part1" "part2".`,
      );
    }
    return;
  }
  let position = 0;
  let count = 0;
  while (position < text.length) {
    if (/\s/.test(text[position] ?? '')) {
      position += 1;
      continue;
    }
    TXT_STRING_RE.lastIndex = position;
    const match = TXT_STRING_RE.exec(text);
    if (!match) {
      throw new ValueError(
        'Invalid TXT value. Enclose each string in double quotes, e.g. "v=spf1 -all".',
      );
    }
    if ((match[1] ?? '').replace(/\\(.)/g, '$1').length > MAX_TXT_STRING) {
      throw new ValueError(`Each TXT string can have up to ${MAX_TXT_STRING} characters.`);
    }
    count += 1;
    position = TXT_STRING_RE.lastIndex;
  }
  if (count === 0) throw new ValueError('Enter a TXT value.');
}

const VALUE_VALIDATORS: Record<string, (value: string) => void> = {
  A: (value) => {
    if (!isIPv4(value.trim())) throw new ValueError('Invalid IPv4 address.');
  },
  AAAA: (value) => {
    if (!isIPv6(value.trim())) throw new ValueError('Invalid IPv6 address.');
  },
  CNAME: targetDomain,
  NS: targetDomain,
  PTR: targetDomain,
  TXT: validateTxt,
  MX: (value) => {
    const parts = value.trim().split(/\s+/);
    if (parts.length !== 2) {
      throw new ValueError(
        'MX value must have the format "priority mail-server", e.g. "10 mail.example.com".',
      );
    }
    intInRange(parts[0] ?? '', 0, MAX_UINT16, 'Priority');
    targetDomain(parts[1] ?? '');
  },
  SRV: (value) => {
    const parts = value.trim().split(/\s+/);
    if (parts.length !== 4) {
      throw new ValueError(
        'SRV value must have the format "priority weight port target", e.g. "1 10 5269 xmpp-server.example.com."',
      );
    }
    intInRange(parts[0] ?? '', 0, MAX_UINT16, 'Priority');
    intInRange(parts[1] ?? '', 0, MAX_UINT16, 'Weight');
    intInRange(parts[2] ?? '', 0, MAX_UINT16, 'Port');
    targetDomain(parts[3] ?? '');
  },
  CAA: (value) => {
    const match = /^\s*(\S+)\s+(\S+)\s+(.+?)\s*$/.exec(value);
    if (!match) {
      throw new ValueError(
        'CAA value must have the format: flags tag "value", e.g. 0 issue "amazon.com".',
      );
    }
    intInRange(match[1] ?? '', 0, 255, 'Flags');
    if (!CAA_TAGS.includes((match[2] ?? '').toLowerCase())) {
      throw new ValueError('CAA tag must be one of: issue, issuewild, iodef.');
    }
    const raw = match[3] ?? '';
    if (!(raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"'))) {
      throw new ValueError('The CAA value must be enclosed in double quotes, e.g. "amazon.com".');
    }
    if (/(^|[^\\])"/.test(raw.slice(1, -1))) {
      throw new ValueError('The CAA value must be a single quoted string.');
    }
  },
  SOA: (value) => {
    const parts = value.trim().split(/\s+/);
    if (parts.length !== 7) {
      throw new ValueError(
        'SOA value must have the format: primary-ns hostmaster serial refresh retry expire minimum.',
      );
    }
    targetDomain(parts[0] ?? '');
    targetDomain(parts[1] ?? '');
    ['Serial number', 'Refresh time', 'Retry interval', 'Expire time', 'Minimum TTL'].forEach(
      (label, index) => intInRange(parts[index + 2] ?? '', 0, MAX_UINT32, label),
    );
  },
};

/** Validates one value line. Returns the error message or null. */
export function validateValue(type: string, value: string): string | null {
  const validator = VALUE_VALIDATORS[type];
  if (!validator) return `Unsupported record type: ${type}.`;
  try {
    validator(value);
    return null;
  } catch (error) {
    if (error instanceof ValueError) return error.message;
    throw error;
  }
}

/** Validates every non-blank line; returns `Line n: message` for each invalid line. */
export function validateValueLines(type: string, lines: string[]): string[] {
  const problems: string[] = [];
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    const error = validateValue(type, line);
    if (error) problems.push(`Line ${index + 1}: ${error}`);
  });
  return problems;
}

export function validateTtl(text: string): string | null {
  if (!/^\d+$/.test(text.trim())) return `TTL must be a whole number between 0 and ${MAX_TTL}.`;
  const value = Number(text);
  return value > MAX_TTL ? `TTL must be between 0 and ${MAX_TTL}.` : null;
}

export const GEO_CONTINENTS = ['AF', 'AN', 'AS', 'EU', 'NA', 'OC', 'SA'];
