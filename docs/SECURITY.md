# Security Requirements

## Non-negotiables

- The app must be invite-only at launch.
- There must be one Platform Owner account.
- The Platform Owner account is seeded from PLATFORM_OWNER_EMAIL.
- No frontend action can create another owner.
- No admin can disable, delete, downgrade, or modify the owner.
- Every protected page and API route must check the user's active status.
- Every sensitive table should use tenant-aware access checks.
- Every major action should create an audit log.

## Instant access removal

Each user has a status:

- active
- suspended
- disabled

A suspended or disabled user should be blocked from:

- Viewing app pages
- Calling protected API routes
- Uploading files
- Downloading exports
- Viewing RFPs
- Submitting bids

Clerk can ban/revoke sessions at the authentication layer, but the app must also check app_users.status at the database/application layer.

## Carrier data isolation

Carrier users may only access:

- RFPs where their carrier organization has an invite
- Their own uploaded bid response
- Their own validation status
- Their own submission history

Carrier users may not access:

- Other carrier responses
- Bid comparison outputs unless explicitly published
- Routing guides unless shared by admin
- Customer-only reporting

## Customer data isolation

Customer users may only access:

- Their customer organization
- Their RFPs
- Reports/results explicitly published to them

## Audit log actions

Log at least:

- user.invited
- user.suspended
- user.reactivated
- organization.disabled
- rfp.created
- rfp.carrier_invited
- bid.uploaded
- bid.validated
- export.downloaded
- routing_guide.created
