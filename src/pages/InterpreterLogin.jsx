import { useState } from "react";
import { supabase, supabaseConfigError } from "../supabase";
import {
  WITHDRAWN_ACCOUNT_MESSAGE,
  isWithdrawnInterpreter,
} from "../utils/accountStatus";
import "./InterpreterAuth.css";

function InterpreterLogin({ onBackClick, onSignupClick, onLoginSuccess }) {
  const [form, setForm] = useState({ email: "", password: "" });
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");

    if (!supabase) {
      setMessage(supabaseConfigError.message);
      return;
    }

    setIsSubmitting(true);
    const email = form.email.trim();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: form.password,
    });

    if (error) {
      console.error("Interpreter login failed", error);
      setMessage("이메일 또는 비밀번호를 확인해주세요.");
      setIsSubmitting(false);
      return;
    }

    const { data: profiles, error: profileError } = await supabase
      .from("interpreters")
      .select("id, email, status, withdrawn_at")
      .ilike("email", email);

    if (profileError) {
      console.warn("Interpreter withdrawal check skipped", profileError);
    }

    const withdrawnProfile = (profiles || []).find((profile) => {
      return (
        String(profile.email || "").toLowerCase().trim() === email.toLowerCase() &&
        isWithdrawnInterpreter(profile)
      );
    });

    if (withdrawnProfile) {
      await supabase.auth.signOut();
      setMessage(WITHDRAWN_ACCOUNT_MESSAGE);
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    onLoginSuccess?.();
  };

  return (
    <main className="interpreter-auth-page">
      <section className="interpreter-auth-card">
        <p className="interpreter-auth-kicker">ON-LI INTERPRETER</p>
        <h1>통역사 로그인</h1>
        <p>통역사 계정으로 로그인하고 마이페이지에서 활동 정보를 확인하세요.</p>

        <form className="interpreter-auth-form" onSubmit={handleSubmit}>
          <label className="interpreter-auth-field">
            <span>이메일</span>
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              required
            />
          </label>
          <label className="interpreter-auth-field">
            <span>비밀번호</span>
            <input
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              required
            />
          </label>

          <button type="submit" className="interpreter-auth-primary" disabled={isSubmitting}>
            {isSubmitting ? "로그인 중..." : "로그인"}
          </button>
        </form>

        {message && <p className="interpreter-auth-message is-error">{message}</p>}

        <div className="interpreter-auth-links">
          <button type="button" onClick={onSignupClick}>
            계정 만들기
          </button>
          <button type="button" onClick={onBackClick}>
            메인으로 돌아가기
          </button>
        </div>
      </section>
    </main>
  );
}

export default InterpreterLogin;
