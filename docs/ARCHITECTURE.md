# LaneForge RFP Architecture

## Product intent

LaneForge is designed as a true B2B SaaS platform for LTL and FTL RFP bid management.

The first build focuses on:

- Customer organizations
- Carrier organizations
- Invite-only access
- Shipment/lane uploads
- Carrier bid submissions
- Bid comparison
- Routing guide generation
- Exportable outputs
- Platform-owner access control

## Recommended stack

- Next.js + TypeScript for app and API routes
- Clerk for authentication, organizations, invitations, and user sessions
- Supabase Postgres for relational data
- Supabase Storage or Cloudflare R2 for files
- Netlify Free for early hosting
- Tailwind CSS for UI
- ExcelJS for Excel exports
- PapaParse/SheetJS for CSV/XLSX parsing

## Tenant model

The system has three organization types:

1. Platform organization
2. Customer organization
3. Carrier organization

A user can belong to one or more organizations through memberships. Every data object should be scoped through a customer, carrier, RFP, or organization relationship.

## Access model

- Platform Owner: one protected account controlled by PLATFORM_OWNER_EMAIL.
- Platform Admin: can manage assigned platform operations but cannot modify the owner.
- Customer Admin/User: can only access their customer organization and allowed RFPs/results.
- Carrier Admin/User: can only access invited RFPs and their own bid responses.

Carrier users must never see competitor pricing.

## Core workflow

1. Platform Owner/Admin creates customer.
2. Platform Owner/Admin creates RFP.
3. Shipment/lane file is uploaded and normalized.
4. Carrier bid template is generated.
5. Carriers are invited.
6. Carriers upload bid responses.
7. Responses are validated and parsed.
8. Bid comparison identifies lowest/top 3 carriers.
9. Routing guide is generated.
10. Exports are created for internal, customer, or carrier-facing views.
