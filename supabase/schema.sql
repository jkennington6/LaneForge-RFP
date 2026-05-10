-- LaneForge RFP SaaS foundational schema
-- Run this in Supabase SQL Editor after creating your project.
-- This schema is designed for Clerk + Supabase Postgres.
-- Clerk user IDs should be included in Supabase JWTs as the `sub` claim through a Clerk JWT template before using RLS in production.

create extension if not exists "uuid-ossp";

create type organization_type as enum ('platform', 'customer', 'carrier');
create type platform_role as enum ('owner', 'platform_admin', 'customer_admin', 'customer_user', 'carrier_admin', 'carrier_user');
create type user_status as enum ('active', 'suspended', 'disabled');
create type rfp_mode as enum ('LTL', 'FTL', 'BOTH');
create type rfp_status as enum ('draft', 'active', 'closed', 'archived');

create table if not exists organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  type organization_type not null,
  status user_status not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_users (
  id uuid primary key default uuid_generate_v4(),
  clerk_user_id text unique not null,
  email text unique not null,
  full_name text,
  status user_status not null default 'active',
  is_platform_owner boolean not null default false,
  disabled_at timestamptz,
  disabled_by uuid references app_users(id),
  disabled_reason text,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owner_cannot_be_disabled check (not (is_platform_owner = true and status <> 'active'))
);

create table if not exists organization_memberships (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  role platform_role not null,
  status user_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists customers (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  industry text,
  contact_name text,
  contact_email text,
  mode_focus rfp_mode not null default 'LTL',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists carriers (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references organizations(id) on delete cascade,
  scac text,
  service_type text,
  contact_name text,
  contact_email text,
  coverage_notes text,
  is_excluded boolean not null default false,
  inactive boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists rfps (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references customers(id) on delete cascade,
  name text not null,
  mode rfp_mode not null default 'LTL',
  status rfp_status not null default 'draft',
  bid_due_date date,
  effective_date date,
  expiration_date date,
  description text,
  internal_notes text,
  carrier_instructions text,
  accessorial_assumptions text,
  fuel_assumptions text,
  required_pricing_format text,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists rfp_carrier_invites (
  id uuid primary key default uuid_generate_v4(),
  rfp_id uuid not null references rfps(id) on delete cascade,
  carrier_id uuid not null references carriers(id) on delete cascade,
  status text not null default 'invited',
  invited_by uuid references app_users(id),
  invited_at timestamptz not null default now(),
  submitted_at timestamptz,
  unique (rfp_id, carrier_id)
);

create table if not exists shipment_lanes (
  id uuid primary key default uuid_generate_v4(),
  rfp_id uuid not null references rfps(id) on delete cascade,
  origin_zip text,
  origin_zip3 text,
  origin_city text,
  origin_state text,
  destination_zip text,
  destination_zip3 text,
  destination_city text,
  destination_state text,
  lane_state_pair text,
  weight numeric,
  weight_break text,
  freight_class text,
  handling_units numeric,
  pallet_count numeric,
  length_in numeric,
  width_in numeric,
  height_in numeric,
  shipment_count integer not null default 1,
  historical_spend numeric,
  accessorials numeric,
  current_carrier text,
  ship_date date,
  validation_status text default 'pending',
  validation_errors jsonb default '[]'::jsonb,
  raw_payload jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists bid_responses (
  id uuid primary key default uuid_generate_v4(),
  rfp_id uuid not null references rfps(id) on delete cascade,
  carrier_id uuid not null references carriers(id) on delete cascade,
  uploaded_by uuid references app_users(id),
  status text not null default 'submitted',
  original_file_path text,
  validation_errors jsonb default '[]'::jsonb,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rfp_id, carrier_id)
);

create table if not exists bid_response_lines (
  id uuid primary key default uuid_generate_v4(),
  bid_response_id uuid not null references bid_responses(id) on delete cascade,
  shipment_lane_id uuid references shipment_lanes(id) on delete set null,
  carrier_id uuid not null references carriers(id) on delete cascade,
  origin_state text,
  destination_state text,
  origin_zip3 text,
  destination_zip3 text,
  weight_break text,
  freight_class text,
  discount_percent numeric,
  minimum_charge numeric,
  base_rate numeric,
  net_linehaul numeric,
  fuel_surcharge_percent numeric,
  fuel_charge numeric,
  accessorial_charge numeric,
  total_charge numeric,
  all_in_charge numeric,
  transit_days integer,
  direct_indicator boolean,
  notes text,
  raw_payload jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists routing_guides (
  id uuid primary key default uuid_generate_v4(),
  rfp_id uuid not null references rfps(id) on delete cascade,
  name text not null,
  award_logic text,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists routing_guide_lines (
  id uuid primary key default uuid_generate_v4(),
  routing_guide_id uuid not null references routing_guides(id) on delete cascade,
  shipment_lane_id uuid references shipment_lanes(id) on delete set null,
  lane_key text not null,
  primary_carrier_id uuid references carriers(id),
  backup_1_carrier_id uuid references carriers(id),
  backup_2_carrier_id uuid references carriers(id),
  manual_override boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default uuid_generate_v4(),
  actor_user_id uuid references app_users(id),
  organization_id uuid references organizations(id),
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Helper: current app user from Clerk JWT sub claim.
create or replace function current_app_user_id()
returns uuid
language sql stable
as $$
  select id from app_users where clerk_user_id = auth.jwt() ->> 'sub' limit 1;
$$;

create or replace function is_platform_owner()
returns boolean
language sql stable
as $$
  select coalesce((select is_platform_owner from app_users where id = current_app_user_id() and status = 'active'), false);
$$;

create or replace function is_active_member(org_id uuid)
returns boolean
language sql stable
as $$
  select exists (
    select 1
    from organization_memberships m
    join app_users u on u.id = m.user_id
    where m.organization_id = org_id
      and m.user_id = current_app_user_id()
      and m.status = 'active'
      and u.status = 'active'
  );
$$;

-- Enable RLS. Policies below are intentionally conservative and should be expanded as features are added.
alter table organizations enable row level security;
alter table app_users enable row level security;
alter table organization_memberships enable row level security;
alter table customers enable row level security;
alter table carriers enable row level security;
alter table rfps enable row level security;
alter table rfp_carrier_invites enable row level security;
alter table shipment_lanes enable row level security;
alter table bid_responses enable row level security;
alter table bid_response_lines enable row level security;
alter table routing_guides enable row level security;
alter table routing_guide_lines enable row level security;
alter table audit_logs enable row level security;

create policy "owners can read organizations" on organizations for select using (is_platform_owner() or is_active_member(id));
create policy "owners can read users" on app_users for select using (is_platform_owner() or id = current_app_user_id());
create policy "owners can read memberships" on organization_memberships for select using (is_platform_owner() or user_id = current_app_user_id() or is_active_member(organization_id));

-- Customer/org scoped data should only be available to platform owner or active members of related organizations.
create policy "owners and customer members can read customers" on customers for select using (is_platform_owner() or is_active_member(organization_id));
create policy "owners and carrier members can read carriers" on carriers for select using (is_platform_owner() or is_active_member(organization_id));

-- In production, add additional policies that allow carrier invitees to read only the exact RFPs they were invited to.
create policy "owners can read all rfps" on rfps for select using (is_platform_owner());
create policy "owners can read all lanes" on shipment_lanes for select using (is_platform_owner());
create policy "owners can read all bid responses" on bid_responses for select using (is_platform_owner());
create policy "owners can read all bid lines" on bid_response_lines for select using (is_platform_owner());
create policy "owners can read all routing guides" on routing_guides for select using (is_platform_owner());
create policy "owners can read all routing lines" on routing_guide_lines for select using (is_platform_owner());
create policy "owners can read audit logs" on audit_logs for select using (is_platform_owner());
