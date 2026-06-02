-- ================================================
-- admin_users 테이블 생성 및 초기 데이터 설정
-- Supabase SQL Editor에서 실행하세요.
-- ================================================

-- 1. 테이블 생성
CREATE TABLE IF NOT EXISTS public.admin_users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text UNIQUE NOT NULL,
  role        text NOT NULL DEFAULT 'staff'
                CHECK (role IN ('owner', 'admin', 'staff')),
  status      text NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'inactive')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. RLS 활성화
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- 3. RLS 정책: 로그인된 사용자 중 admin_users에 등록된 이메일만 읽기 가능
-- (최초 owner는 이메일 하드코딩으로 항상 접근 허용)
CREATE POLICY "admin_users_select"
  ON public.admin_users
  FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      auth.email() = 'onlinkwith@gmail.com'
      OR EXISTS (
        SELECT 1 FROM public.admin_users au
        WHERE au.email = auth.email()
          AND au.status = 'active'
      )
    )
  );

-- 4. RLS 정책: INSERT (owner/admin만 가능)
CREATE POLICY "admin_users_insert"
  ON public.admin_users
  FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND (
      auth.email() = 'onlinkwith@gmail.com'
      OR EXISTS (
        SELECT 1 FROM public.admin_users au
        WHERE au.email = auth.email()
          AND au.role IN ('owner', 'admin')
          AND au.status = 'active'
      )
    )
  );

-- 5. RLS 정책: UPDATE (owner/admin만 가능)
CREATE POLICY "admin_users_update"
  ON public.admin_users
  FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND (
      auth.email() = 'onlinkwith@gmail.com'
      OR EXISTS (
        SELECT 1 FROM public.admin_users au
        WHERE au.email = auth.email()
          AND au.role IN ('owner', 'admin')
          AND au.status = 'active'
      )
    )
  );

-- 6. 초기 관리자 데이터 삽입
INSERT INTO public.admin_users (email, role, status)
VALUES
  ('onlinkwith@gmail.com', 'owner', 'active'),
  ('onlinkcp@gmail.com',   'admin', 'active')
ON CONFLICT (email) DO UPDATE
  SET role       = EXCLUDED.role,
      status     = EXCLUDED.status,
      updated_at = now();

-- 7. updated_at 자동 갱신 트리거 (선택 사항)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS admin_users_updated_at ON public.admin_users;
CREATE TRIGGER admin_users_updated_at
  BEFORE UPDATE ON public.admin_users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
