import { useEffect, useState } from "react";
import { supabase, supabaseConfigError } from "../supabase";
import {
  INTERPRETER_ACTIVITY_STATUS,
  getInterpreterActivityStatusLabel,
} from "../utils/status";
import { normalizeLevel } from "../utils/levelBadge";
import "./InterpreterAuth.css";

function InterpreterMypage({ authLoading, user, onLoginClick, onHomeClick, onSignOut }) {
  const [interpreter, setInterpreter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const fetchInterpreter = async () => {
      if (authLoading) return;

      if (!user) {
        setLoading(false);
        return;
      }

      if (!supabase) {
        setMessage(supabaseConfigError.message);
        setLoading(false);
        return;
      }

      setLoading(true);
      setMessage("");

      const { data, error } = await supabase
        .from("interpreters")
        .select("*")
        .eq("email", user.email);

      if (error) {
        console.error("Interpreter profile fetch failed", error);
        setMessage("통역사 정보를 불러오지 못했습니다.");
        setLoading(false);
        return;
      }

      if ((data || []).length > 1) {
        console.warn("Duplicate interpreter email found", {
          email: user.email,
          ids: data.map((item) => item.id),
        });
      }

      const nextInterpreter = data?.[0] || null;
      setInterpreter(nextInterpreter);

      if (nextInterpreter && !nextInterpreter.auth_user_id) {
        const { data: updated, error: updateError } = await supabase
          .from("interpreters")
          .update({ auth_user_id: user.id })
          .eq("id", nextInterpreter.id)
          .select("*")
          .single();

        if (updateError) {
          console.warn("Interpreter auth_user_id update skipped", updateError);
        } else {
          setInterpreter(updated || nextInterpreter);
        }
      }

      setLoading(false);
    };

    queueMicrotask(fetchInterpreter);
  }, [authLoading, user]);

  if (authLoading || loading) {
    return (
      <main className="interpreter-auth-page">
        <section className="interpreter-auth-card">
          <p className="interpreter-auth-kicker">ON-LI INTERPRETER</p>
          <h1>마이페이지를 준비 중입니다.</h1>
          <p>로그인 상태와 통역사 정보를 확인하고 있습니다.</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="interpreter-auth-page">
        <section className="interpreter-auth-card">
          <p className="interpreter-auth-kicker">ON-LI INTERPRETER</p>
          <h1>로그인이 필요합니다.</h1>
          <p>통역사 계정으로 로그인해주세요.</p>
          <div className="interpreter-auth-form">
            <button type="button" className="interpreter-auth-primary" onClick={onLoginClick}>
              통역사 로그인
            </button>
            <button type="button" className="interpreter-auth-secondary" onClick={onHomeClick}>
              메인으로 돌아가기
            </button>
          </div>
        </section>
      </main>
    );
  }

  const activityStatus = getActivityStatus(interpreter);

  return (
    <main className="interpreter-mypage">
      <div className="interpreter-mypage-shell">
        <section className="interpreter-mypage-head">
          <div>
            <p className="interpreter-auth-kicker">ON-LI INTERPRETER</p>
            <h1>통역사 마이페이지</h1>
            <p>본인 계정과 연결된 통역사 정보를 확인할 수 있습니다.</p>
          </div>
          <div className="interpreter-mypage-actions">
            <button type="button" className="interpreter-auth-secondary" onClick={onHomeClick}>
              메인으로
            </button>
            <button type="button" className="interpreter-auth-primary" onClick={onSignOut}>
              로그아웃
            </button>
          </div>
        </section>

        {message && <p className="interpreter-auth-message is-error">{message}</p>}

        <section className="interpreter-mypage-grid">
          <article className="interpreter-mypage-card">
            <h2>프로필 상태</h2>
            {interpreter ? (
              <dl className="interpreter-profile-list">
                <ProfileRow label="이름" value={interpreter.name || "미입력"} />
                <ProfileRow label="이메일" value={interpreter.email || user.email} />
                <ProfileRow label="승인 상태" value={interpreter.approved ? "승인 완료" : "승인 대기"} />
                <ProfileRow label="활동 상태" value={getInterpreterActivityStatusLabel(activityStatus)} />
                <ProfileRow label="레벨" value={normalizeLevel(interpreter.level || "Lv1")} />
                <ProfileRow label="전문 분야" value={formatList(interpreter.specialties)} />
                <ProfileRow label="활동 가능 지역" value={formatList(interpreter.available_regions)} />
              </dl>
            ) : (
              <p>
                로그인 이메일과 일치하는 통역사 등록 정보를 찾지 못했습니다.
                통역사 등록 신청 이메일과 같은 계정으로 로그인해주세요.
              </p>
            )}
          </article>

          <div className="interpreter-mypage-tiles">
            <MypageTile title="지원 내역" text="준비중" />
            <MypageTile title="가능 일정" text="준비중" />
            <MypageTile title="배정 내역" text="준비중" />
          </div>
        </section>
      </div>
    </main>
  );
}

function ProfileRow({ label, value }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function MypageTile({ title, text }) {
  return (
    <article className="interpreter-mypage-tile">
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

function formatList(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(", ") || "미입력";
  return value || "미입력";
}

function getActivityStatus(interpreter) {
  const status = String(interpreter?.activity_status || "").trim().toLowerCase();
  if (Object.values(INTERPRETER_ACTIVITY_STATUS).includes(status)) return status;
  return INTERPRETER_ACTIVITY_STATUS.ACTIVE;
}

export default InterpreterMypage;
