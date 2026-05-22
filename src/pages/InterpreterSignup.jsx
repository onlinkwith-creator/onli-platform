import { useState } from "react";
import { supabase, supabaseConfigError } from "../supabase";
import "./InterpreterAuth.css";

function InterpreterSignup({ onBackClick, onLoginClick, onSignupSuccess }) {
  const [form, setForm] = useState({
    email: "",
    password: "",
    passwordConfirm: "",
  });
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");
    setErrorMessage("");

    if (form.password !== form.passwordConfirm) {
      setErrorMessage("비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    if (!supabase) {
      setErrorMessage(supabaseConfigError.message);
      return;
    }

    setIsSubmitting(true);
    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
    });
    setIsSubmitting(false);

    if (error) {
      console.error("Interpreter signup failed", error);
      setErrorMessage(error.message || "회원가입에 실패했습니다.");
      return;
    }

    if (data?.session) {
      setMessage("계정이 생성되었습니다. 마이페이지로 이동합니다.");
      onSignupSuccess?.();
    } else {
      setMessage("회원가입이 접수되었습니다. 이메일 확인 후 로그인해주세요.");
    }
  };

  return (
    <main className="interpreter-auth-page">
      <section className="interpreter-auth-card">
        <p className="interpreter-auth-kicker">ON-LI INTERPRETER</p>
        <h1>ON-LI 통역사 계정 만들기</h1>
        <p>마이페이지에서 지원 내역과 가능 일정을 관리할 수 있습니다.</p>

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
              minLength={6}
              required
            />
          </label>
          <label className="interpreter-auth-field">
            <span>비밀번호 확인</span>
            <input
              name="passwordConfirm"
              type="password"
              value={form.passwordConfirm}
              onChange={handleChange}
              minLength={6}
              required
            />
          </label>

          <button type="submit" className="interpreter-auth-primary" disabled={isSubmitting}>
            {isSubmitting ? "계정 생성 중..." : "계정 만들기"}
          </button>
        </form>

        {message && <p className="interpreter-auth-message">{message}</p>}
        {errorMessage && <p className="interpreter-auth-message is-error">{errorMessage}</p>}

        <div className="interpreter-auth-links">
          <button type="button" onClick={onLoginClick}>
            통역사 로그인
          </button>
          <button type="button" onClick={onBackClick}>
            메인으로 돌아가기
          </button>
        </div>
      </section>
    </main>
  );
}

export default InterpreterSignup;
