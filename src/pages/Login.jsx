import { useState } from "react";
import { supabase, supabaseConfigError } from "../supabase";
import "./InterpreterAuth.css";

function Login({ onBackClick, onLoginSuccess }) {
  const [isLoginMode, setIsLoginMode] = useState(true);
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

    if (!supabase) {
      setErrorMessage(supabaseConfigError.message);
      return;
    }

    setIsSubmitting(true);

    if (isLoginMode) {
      // Login flow
      const { error } = await supabase.auth.signInWithPassword({
        email: form.email.trim(),
        password: form.password,
      });
      setIsSubmitting(false);

      if (error) {
        console.error("Login failed", error);
        setErrorMessage("로그인에 실패했습니다. 이메일 인증 여부를 확인해주세요.");
        return;
      }

      onLoginSuccess?.();
    } else {
      // Signup flow
      if (form.password !== form.passwordConfirm) {
        setErrorMessage("비밀번호 확인이 일치하지 않습니다.");
        setIsSubmitting(false);
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });
      setIsSubmitting(false);

      if (error) {
        console.error("Signup failed", error);
        // Handle duplicate email gracefully
        if (error.code === "user_already_exists" || error.message?.includes("already registered")) {
          setErrorMessage("이미 등록된 이메일입니다. 로그인을 시도해주세요.");
          setIsLoginMode(true);
        } else {
          setErrorMessage(error.message || "회원가입에 실패했습니다.");
        }
        return;
      }

      if (data?.session) {
        // Email confirmation is disabled – logged in immediately
        setMessage("회원가입 및 로그인이 완료되었습니다. 홈으로 이동합니다.");
        onLoginSuccess?.();
      } else if (data?.user?.identities?.length === 0) {
        // User exists but not confirmed – duplicate signup attempt
        setErrorMessage("이미 등록된 이메일입니다. 로그인을 시도해주세요.");
        setIsLoginMode(true);
      } else {
        // Email confirmation is ON – user created but needs to verify email
        setMessage("회원가입이 완료되었습니다. 발송된 이메일 링크를 확인하여 인증을 완료한 후 로그인해주세요.");
        setIsLoginMode(true);
      }
    }
  };

  return (
    <main className="interpreter-auth-page">
      <section className="interpreter-auth-card">
        <p className="interpreter-auth-kicker">ON-LI AUTHENTICATION</p>
        <h1>{isLoginMode ? "로그인" : "ON-LI 계정 만들기"}</h1>
        <p>
          {isLoginMode
            ? "이메일 주소와 비밀번호로 로그인해주세요."
            : "새로운 계정을 만들고 편리한 온리 플랫폼을 이용하세요."}
        </p>

        <form className="interpreter-auth-form" onSubmit={handleSubmit}>
          <label className="interpreter-auth-field">
            <span>이메일</span>
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              placeholder="example@email.com"
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
              placeholder="6자리 이상 비밀번호"
              minLength={6}
              required
            />
          </label>

          {!isLoginMode && (
            <label className="interpreter-auth-field">
              <span>비밀번호 확인</span>
              <input
                name="passwordConfirm"
                type="password"
                value={form.passwordConfirm}
                onChange={handleChange}
                placeholder="비밀번호 재입력"
                minLength={6}
                required
              />
            </label>
          )}

          <button type="submit" className="interpreter-auth-primary" disabled={isSubmitting}>
            {isSubmitting
              ? isLoginMode
                ? "로그인 중..."
                : "계정 생성 중..."
              : isLoginMode
              ? "로그인"
              : "계정 만들기"}
          </button>
        </form>

        {message && <p className="interpreter-auth-message">{message}</p>}
        {errorMessage && <p className="interpreter-auth-message is-error">{errorMessage}</p>}

        <div className="interpreter-auth-links">
          <button
            type="button"
            onClick={() => {
              setIsLoginMode(!isLoginMode);
              setMessage("");
              setErrorMessage("");
            }}
          >
            {isLoginMode ? "계정 만들기" : "이미 계정이 있으신가요? 로그인"}
          </button>
          <button type="button" onClick={onBackClick}>
            메인으로 돌아가기
          </button>
        </div>
      </section>
    </main>
  );
}

export default Login;
