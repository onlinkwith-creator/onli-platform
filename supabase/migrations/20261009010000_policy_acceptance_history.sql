begin;

create table public.policy_revisions (
 version text primary key,
 documents jsonb not null check(jsonb_typeof(documents)='object'),
 content_sha256 text not null check(content_sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),
 published_at timestamptz,
 effective_at timestamptz,
 retired_at timestamptz,
 check((published_at is null and effective_at is null) or
       (published_at is not null and effective_at is not null and effective_at>=published_at))
);
create table public.policy_acceptance_history (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid not null,
 version text not null references public.policy_revisions(version),
 action text not null check(action in ('interpreter_registration','company_request','job_application','assignment_acceptance')),
 subject_id uuid,
 nonce uuid not null,
 agreed_documents text[] not null,
 acknowledged_notices text[] not null,
 cancel_policy_acknowledged boolean not null,
 recorded_at timestamptz not null default clock_timestamp(),
 unique(actor_id,nonce)
);
alter table public.policy_revisions enable row level security;
alter table public.policy_acceptance_history enable row level security;
revoke all on public.policy_revisions,public.policy_acceptance_history from public,anon,authenticated;

create function public.guard_policy_revision_content() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 if new.version is distinct from old.version or new.documents is distinct from old.documents
 or new.content_sha256 is distinct from old.content_sha256 or new.created_at is distinct from old.created_at
 then raise exception 'POLICY_REVISION_IMMUTABLE'; end if;
 return new;
end; $$;
create trigger policy_revision_immutable before update on public.policy_revisions
for each row execute function public.guard_policy_revision_content();
create function public.guard_policy_acceptance_update() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin raise exception 'POLICY_ACCEPTANCE_IMMUTABLE'; end; $$;
create trigger policy_acceptance_immutable before update on public.policy_acceptance_history
for each row execute function public.guard_policy_acceptance_update();
revoke all on function public.guard_policy_revision_content(),public.guard_policy_acceptance_update() from public,anon,authenticated;

create function public.record_policy_acceptance(
 p_version text,p_action text,p_nonce uuid,p_agreements jsonb,p_subject_id uuid default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare revision public.policy_revisions%rowtype; receipt public.policy_acceptance_history%rowtype;
 docs text[]; cancel_required boolean; cancel_ack boolean;
begin
 if auth.uid() is null then raise exception 'POLICY_AUTH_REQUIRED' using errcode='42501'; end if;
 if p_action is null or p_action not in ('interpreter_registration','company_request','job_application','assignment_acceptance')
 or p_nonce is null then raise exception 'POLICY_INVALID_CONTEXT'; end if;
 if p_agreements is null or jsonb_typeof(p_agreements)<>'object'
 or p_agreements->'common_terms' is distinct from 'true'::jsonb
 or p_agreements->'role_terms' is distinct from 'true'::jsonb
 or p_agreements->'privacy_notice' is distinct from 'true'::jsonb
 then raise exception 'POLICY_ACKNOWLEDGEMENT_REQUIRED'; end if;
 cancel_required:=p_action in ('job_application','assignment_acceptance');
 cancel_ack:=p_agreements->'cancel_policy'='true'::jsonb;
 if cancel_required and coalesce(cancel_ack,false) is not true then raise exception 'POLICY_CANCEL_ACKNOWLEDGEMENT_REQUIRED'; end if;
 if (p_action in ('job_application','assignment_acceptance') and p_subject_id is null)
 or (p_action in ('interpreter_registration','company_request') and p_subject_id is not null)
 then raise exception 'POLICY_INVALID_CONTEXT'; end if;
 select * into revision from public.policy_revisions where version=p_version for share;
 if not found or revision.published_at is null or revision.effective_at is null
 or revision.effective_at>now() or revision.published_at>now()
 or (revision.retired_at is not null and revision.retired_at<=now())
 then raise exception 'POLICY_VERSION_NOT_ACTIVE'; end if;
 docs:=array['commonTerms',case when p_action='company_request' then 'clientPolicy' else 'interpreterPolicy' end];
 if p_action='company_request' and coalesce(cancel_ack,false) then docs:=array_append(docs,'refundPolicy'); end if;
 if not revision.documents ?& (docs||array['privacy']) then raise exception 'POLICY_DOCUMENT_MISSING'; end if;
 insert into public.policy_acceptance_history(actor_id,version,action,subject_id,nonce,agreed_documents,
  acknowledged_notices,cancel_policy_acknowledged)
 values(auth.uid(),p_version,p_action,p_subject_id,p_nonce,docs,array['privacy'],coalesce(cancel_ack,false))
 on conflict(actor_id,nonce) do nothing returning * into receipt;
 if not found then
  select * into receipt from public.policy_acceptance_history where actor_id=auth.uid() and nonce=p_nonce;
  if receipt.version is distinct from p_version or receipt.action is distinct from p_action
  or receipt.subject_id is distinct from p_subject_id or receipt.agreed_documents is distinct from docs
  or receipt.cancel_policy_acknowledged is distinct from coalesce(cancel_ack,false)
  then raise exception 'POLICY_NONCE_CONFLICT'; end if;
 end if;
 return jsonb_build_object('receipt_id',receipt.id,'recorded_at',receipt.recorded_at,'version',receipt.version);
end; $$;
revoke all on function public.record_policy_acceptance(text,text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.record_policy_acceptance(text,text,uuid,jsonb,uuid) to authenticated;

create function public.get_my_policy_acceptances() returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('receipt_id',h.id,'version',h.version,'action',h.action,
  'subject_id',h.subject_id,'recorded_at',h.recorded_at,'agreed_documents',h.agreed_documents,
  'acknowledged_notices',h.acknowledged_notices,'cancel_policy_acknowledged',h.cancel_policy_acknowledged,
  'content_sha256',r.content_sha256) order by h.recorded_at desc),'[]'::jsonb)
 from public.policy_acceptance_history h join public.policy_revisions r on r.version=h.version
 where h.actor_id=auth.uid();
$$;
revoke all on function public.get_my_policy_acceptances() from public,anon;
grant execute on function public.get_my_policy_acceptances() to authenticated;

create function public.get_my_policy_revision(p_receipt_id uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('version',r.version,'documents',r.documents,'content_sha256',r.content_sha256)
 from public.policy_acceptance_history h join public.policy_revisions r on r.version=h.version
 where h.id=p_receipt_id and h.actor_id=auth.uid();
$$;
revoke all on function public.get_my_policy_revision(uuid) from public,anon;
grant execute on function public.get_my_policy_revision(uuid) to authenticated;
commit;
