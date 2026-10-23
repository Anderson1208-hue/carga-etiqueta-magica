# Architecture rules

- OK Entrega portal consultation is isolated from image transmission; authenticate approved operators and return only allowlisted business data, never portal HTML or authentication responses, to prevent credential leakage and accidental retransmission.
- OK Entrega portal parsing uses a tested shared parser for document-link IDs and validation-result arrays; mirror the portal's actual fields rather than assuming HTML quoting or scalar statuses.

- OK Entrega date consultation uses the vehicle routing date and fetches queue results for those invoices independently of the recent technical-history limit; historical statuses must not disappear because of that limit.

- Keep operator navigation grouped in lateral flyouts within the existing desktop Sidebar, retaining existing route targets and access-hook filters; this reduces menu clutter without changing business workflows or the driver application.
- In RLS policies always wrap no-argument helper checks as `(SELECT public.is_admin())` / `(SELECT public.is_active_operator())`; bare calls run once per row and saturated the database (outages Oct/2026).
- Geocode-cache reads require active profiles in RLS; geocoding endpoints using service credentials must validate the caller and protected profile approval through the shared operator guard, because service credentials bypass RLS.