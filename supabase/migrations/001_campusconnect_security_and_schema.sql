-- =============================================================================
-- CampusConnect Incremental SQL Migration (Supabase / PostgreSQL)
-- Preserves existing users, tickets, and IDs. No destructive DROP statements.
-- Covers:
--   1. Atomic Ticket Sequence (CC-0001, CC-0002, ...) + UNIQUE constraint
--   2. Cross-Device Auth Profiles linked to auth.users(id) + Role Guard Trigger
--   3. Department Isolation & Row Level Security (RLS) across all tables
-- =============================================================================

-- 1. Atomic Sequence for Unique Ticket IDs (CC-0001, CC-0002, ...)
CREATE SEQUENCE IF NOT EXISTS public.ticket_number_seq
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

-- Ensure sequence is synchronized above any existing CC-XXXX ticket numbers
DO $$
DECLARE
  max_existing INTEGER;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tickets'
  ) THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(ticket_id, '\D', '', 'g'), '')::INTEGER), 0)
      INTO max_existing
      FROM public.tickets;
    IF max_existing > 0 THEN
      PERFORM setval('public.ticket_number_seq', max_existing, true);
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.next_ticket_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_val INTEGER;
BEGIN
  next_val := nextval('public.ticket_number_seq');
  RETURN 'CC-' || LPAD(next_val::TEXT, 4, '0');
END;
$$;

-- 2. User Profiles Table (linked to Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'staff', 'supervisor', 'admin')),
  department TEXT CHECK (department IN ('plumbing', 'electricity', 'cleanliness', 'internet') OR department IS NULL),
  subdepartment TEXT,
  student_id TEXT,
  hostel TEXT,
  room TEXT,
  language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'hi')),
  approved BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent non-admin users from escalating their own role or department
CREATE OR REPLACE FUNCTION public.enforce_profile_role_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  caller_role TEXT;
BEGIN
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();

  IF TG_OP = 'INSERT' THEN
    IF caller_role IS DISTINCT FROM 'admin' THEN
      NEW.role := 'student';
      NEW.department := NULL;
      NEW.subdepartment := NULL;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF caller_role IS DISTINCT FROM 'admin' THEN
      NEW.role := OLD.role;
      NEW.department := OLD.department;
      NEW.subdepartment := OLD.subdepartment;
    END IF;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_profile_role_guard ON public.profiles;
CREATE TRIGGER trg_enforce_profile_role_guard
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_role_guard();

-- 3. Tickets Table with Atomic Default & Unique Constraint
CREATE TABLE IF NOT EXISTS public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id TEXT NOT NULL UNIQUE DEFAULT public.next_ticket_code(),
  idempotency_key TEXT UNIQUE,
  reporter_id UUID NOT NULL REFERENCES public.profiles(id),
  reporters UUID[] NOT NULL DEFAULT '{}',
  raw_text TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  issue TEXT NOT NULL,
  title TEXT NOT NULL,
  summary_en TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('plumbing', 'electricity', 'cleanliness', 'internet', 'unclear')),
  subtype TEXT,
  department_id TEXT NOT NULL CHECK (department_id IN ('plumbing', 'electricity', 'cleanliness', 'internet', 'unclear')),
  urgency TEXT NOT NULL CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
  confidence NUMERIC NOT NULL DEFAULT 0.9,
  photo_base64 TEXT,
  photo_observation TEXT,
  photo_matches_text TEXT DEFAULT 'no_photo',
  safety_flags TEXT[] NOT NULL DEFAULT ARRAY['none'],
  hostel TEXT NOT NULL,
  floor INTEGER NOT NULL,
  room TEXT NOT NULL,
  location_code TEXT NOT NULL,
  pin_x NUMERIC NOT NULL DEFAULT 50,
  pin_y NUMERIC NOT NULL DEFAULT 50,
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Assigned', 'In Progress', 'Resolved', 'Verified', 'Reopened')),
  assigned_to TEXT,
  incident_id TEXT,
  duplicate_of TEXT,
  resolution JSONB,
  sla_due_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Ticket Events, Duplicates, Technicians, Escalations
CREATE TABLE IF NOT EXISTS public.ticket_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_doc_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL,
  actor_role TEXT NOT NULL,
  actor_name TEXT,
  type TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.technicians (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  department TEXT NOT NULL CHECK (department IN ('plumbing', 'electricity', 'cleanliness', 'internet')),
  skills TEXT[] NOT NULL DEFAULT '{}',
  workload INTEGER NOT NULL DEFAULT 0,
  available BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.duplicate_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  department_id TEXT NOT NULL CHECK (department_id IN ('plumbing', 'electricity', 'cleanliness', 'internet')),
  verdict TEXT NOT NULL CHECK (verdict IN ('identical', 'related', 'different')),
  reason TEXT NOT NULL,
  review_state TEXT NOT NULL DEFAULT 'pending' CHECK (review_state IN ('pending', 'merged', 'rejected', 'linked')),
  reviewed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id TEXT NOT NULL,
  department_id TEXT NOT NULL CHECK (department_id IN ('plumbing', 'electricity', 'cleanliness', 'internet')),
  type TEXT NOT NULL CHECK (type IN ('sla_overdue', 'safety_flag', 'reopened_dispute')),
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  UNIQUE (ticket_id, type)
);

-- =============================================================================
-- 5. Enable Row Level Security (RLS) & Strict Department Isolation Policies
-- =============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technicians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duplicate_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalations ENABLE ROW LEVEL SECURITY;

-- Helper function to check caller role and department without recursion
CREATE OR REPLACE FUNCTION public.can_access_department(target_dept TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'admin'
        OR (p.role = 'supervisor' AND (p.department IS NULL OR p.department = target_dept))
        OR (p.role = 'staff' AND p.department = target_dept)
      )
  );
$$;

-- Profiles policies
DROP POLICY IF EXISTS "profiles_select_own_or_staff" ON public.profiles;
CREATE POLICY "profiles_select_own_or_staff" ON public.profiles
  FOR SELECT USING (
    id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('staff', 'supervisor', 'admin'))
  );

DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;
CREATE POLICY "profiles_insert_self" ON public.profiles
  FOR INSERT WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_update_self_or_admin" ON public.profiles;
CREATE POLICY "profiles_update_self_or_admin" ON public.profiles
  FOR UPDATE USING (
    id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Tickets policies (Students: own tickets only; Staff: authorized department only; Supervisor/Admin: authorized scope)
DROP POLICY IF EXISTS "tickets_select_isolated" ON public.tickets;
CREATE POLICY "tickets_select_isolated" ON public.tickets
  FOR SELECT USING (
    reporter_id = auth.uid()
    OR auth.uid() = ANY(reporters)
    OR public.can_access_department(department_id)
  );

DROP POLICY IF EXISTS "tickets_insert_authenticated" ON public.tickets;
CREATE POLICY "tickets_insert_authenticated" ON public.tickets
  FOR INSERT WITH CHECK (
    reporter_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('staff', 'supervisor', 'admin'))
  );

DROP POLICY IF EXISTS "tickets_update_isolated" ON public.tickets;
CREATE POLICY "tickets_update_isolated" ON public.tickets
  FOR UPDATE USING (
    reporter_id = auth.uid()
    OR auth.uid() = ANY(reporters)
    OR public.can_access_department(department_id)
  );

-- Ticket events policies
DROP POLICY IF EXISTS "ticket_events_select_isolated" ON public.ticket_events;
CREATE POLICY "ticket_events_select_isolated" ON public.ticket_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_events.ticket_doc_id
        AND (
          t.reporter_id = auth.uid()
          OR auth.uid() = ANY(t.reporters)
          OR public.can_access_department(t.department_id)
        )
    )
  );

-- Technicians policies (Strictly isolated by department)
DROP POLICY IF EXISTS "technicians_select_isolated" ON public.technicians;
CREATE POLICY "technicians_select_isolated" ON public.technicians
  FOR SELECT USING (public.can_access_department(department));

-- Duplicate candidates policies (Strictly isolated by department)
DROP POLICY IF EXISTS "duplicates_select_isolated" ON public.duplicate_candidates;
CREATE POLICY "duplicates_select_isolated" ON public.duplicate_candidates
  FOR SELECT USING (public.can_access_department(department_id));

-- Escalations policies (Strictly isolated by department)
DROP POLICY IF EXISTS "escalations_select_isolated" ON public.escalations;
CREATE POLICY "escalations_select_isolated" ON public.escalations
  FOR SELECT USING (public.can_access_department(department_id));
