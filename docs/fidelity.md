# UI fidelity pass (Phase 8)

No reference screenshots of a live AWS account were available for this pass, so each screen
was compared, at 1440 px in light mode, against the current Route 53 console as documented in
AGENTS.md §6–§7 and the AWS Route 53 Developer Guide. Every fix uses Cloudscape props or
content. No Cloudscape internals are overridden.

If reference screenshots are added later, put them in `docs/reference/` and repeat this
comparison.

## Shell (all console pages)

| Area | Before | After / status |
|---|---|---|
| Layout | — | `AppLayoutToolbar`: the current console layout, with the navigation toggle and breadcrumbs in a toolbar row and the help panel trigger on the right |
| Top navigation | — | Identity "Route 53 Clone" (no AWS logo, by design), search box, "Global" region menu, notifications, settings and user menu |
| Side navigation order | — | Dashboard, Hosted zones, Health checks, Profiles, then the IP-based routing, Traffic flow, Domains, Resolver and DNS Firewall sections |
| Breadcrumbs | — | Route 53 › Hosted zones › `<zone>` › Create record, with the same wording as the console |
| Info links | — | Every page header and key form field has an "Info" link that opens the help panel |

## Hosted zones list

| Element | Before | After / status |
|---|---|---|
| Header description | Extra sentence under "Hosted zones" | Removed (the console shows only title, counter and Info) |
| Header counter | `(16)` | ✓ |
| Actions, in order | View details, Edit, Delete, **Create hosted zone** (primary) | ✓ (disabled until a row is selected) |
| Table variant | full-page, sticky header | ✓ |
| Columns | Hosted zone name, Type, Created by, Record count, Description, Hosted zone ID | ✓ (Description not sortable) |
| Filter placeholder | "Filter hosted zones by property or value" | ✓ |
| Empty / no match | "No hosted zones" / "No matches" + "Clear filter" | ✓ |

## Create / edit hosted zone

| Element | Before | After / status |
|---|---|---|
| Header + description | "Create hosted zone" + container description sentence | ✓ |
| Container title | "Hosted zone configuration" | ✓ |
| Field labels | Domain name, Description - *optional*, Type | ✓ |
| Type control | Tiles: Public hosted zone / Private hosted zone | ✓ |
| Footer | Cancel (link) + **Create hosted zone** (primary) | ✓ |
| Edit page | "Save changes" primary, name and type read-only | ✓ |

## Hosted zone details

| Element | Before | After / status |
|---|---|---|
| Header actions | Delete zone, Test record, Configure query logging | ✓ (Test record and query logging disabled with a "Coming soon" tooltip) |
| "Hosted zone details" section | Expanded by default | **Collapsed by default**, as in the console (the state is remembered) |
| Tabs | Records (N), DNSSEC signing, Hosted zone tags (N) | ✓ |
| Records header actions | Delete record, Import zone file, (Export: bonus), **Create record** | ✓ |
| Records columns | Record name, Type, Routing policy, Differentiator, Alias, Value/Route traffic to, TTL (seconds), Health check ID, Evaluate target health, Record ID (hidden) | ✓ |
| Column widths | Names wrapped mid-word | Fixed column widths |
| Default SOA/NS rows | Not selectable | ✓ |
| Split panel | Record details with Edit record / Delete record buttons | ✓ |

## Create record

| Element | Before | After / status |
|---|---|---|
| "Switch to wizard" | Segmented control in the page header | **Button in the "Quick create record" container header** (disabled, "Coming soon"), where the console puts it |
| Record name | Zone suffix wrapped under the input | Suffix `.example.com` shown inline to the right of the input |
| Type labels | "A – Routes traffic to an IPv4 address and some AWS resources", … | ✓ (all 9) |
| TTL | Input + 1m / 1h / 1d, "Recommended values: 60 to 172800 (two days)" | ✓ |
| Footer | Cancel + **Create records** | ✓ |

## Intentional differences

* No AWS logo and no copy of the AWS sign-in page (AGENTS.md §1.5). The login page is a
  Cloudscape form with a demo-environment notice.
* "Export" (JSON/BIND), multi-record containers, keyboard shortcuts and the record type
  quick filter are bonus features that the real console doesn't have in this form.
