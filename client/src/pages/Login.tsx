import React, { useRef, useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Eye, EyeOff } from "lucide-react";
import { TRPCClientError } from "@trpc/client";
import { useAuthStore } from "../store/authStore";

const REMEMBERED_USERNAME_KEY = "remembered_username";

const cartoonStyle = `
  .wood-input {
    font-family: 'Architects Daughter', cursive;
    background: #f5e8c0;
    border: none; color: #3d2a0a; letter-spacing: 0.02em;
    font-weight: 700; transition: background 0.15s;
  }
  .wood-input::placeholder { color: #9a7a4a; opacity: 0.75; font-style: italic; font-weight: 400; }
  .wood-input:focus { outline: none; background: #fdf5e0; }

  .wood-btn {
    font-family: 'Architects Daughter', cursive;
    background-color: #2e9e52 !important;
    border: none; color: #fff !important; letter-spacing: 0.1em;
    text-shadow: 0 1px 4px rgba(0,0,0,0.5);
    transition: filter 0.1s, transform 0.1s;
  }
  .wood-btn:hover:not(:disabled) { filter: brightness(1.12); transform: scale(1.01); }
  .wood-btn:active:not(:disabled) { transform: scale(0.98); }
  .wood-btn:disabled { opacity: 0.45; cursor: not-allowed; }

  .wood-label {
    font-family: 'Architects Daughter', cursive; color: #fff;
    text-shadow: 0 1px 8px rgba(0,0,0,1), 0 0 16px rgba(0,0,0,0.7); letter-spacing: 0.07em;
  }
  .wood-tagline {
    font-family: 'Architects Daughter', cursive; color: rgba(255,255,255,0.9);
    text-shadow: 0 1px 8px rgba(0,0,0,1); letter-spacing: 0.05em; font-style: italic;
  }
  .wood-version {
    font-family: 'Architects Daughter', cursive; color: rgba(255,255,255,0.65);
    text-shadow: 0 1px 5px rgba(0,0,0,0.9); letter-spacing: 0.05em;
  }

  /* ── DESKTOP: layout normal com placa ── */
  .login-desktop { display: flex; }
  .login-mobile  { display: none; }

  /* ── MOBILE ── */
  @media (max-width: 600px) {
    .login-desktop { display: none !important; }
    .login-mobile  { display: flex !important; }
  }
`;

function CartoonFilters() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }}>
      <defs>
        <filter id="outline" x="-8%" y="-12%" width="116%" height="124%">
          <feMorphology operator="dilate" radius="2.2" in="SourceAlpha" result="expanded" />
          <feFlood floodColor="#4a2e08" floodOpacity="0.9" result="color" />
          <feComposite in="color" in2="expanded" operator="in" result="border" />
          <feTurbulence type="turbulence" baseFrequency="0.035" numOctaves="2" seed="9" result="noise2" />
          <feDisplacementMap in="border" in2="noise2" scale="3.5" xChannelSelector="R" yChannelSelector="G" result="wborder" />
          <feMerge>
            <feMergeNode in="wborder" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    </svg>
  );
}

type LoginFormProps = {
  username: string;
  setUsername: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  showPass: boolean;
  setShowPass: React.Dispatch<React.SetStateAction<boolean>>;
  error: string | null;
  isLoading: boolean;
  onSubmit: (e: React.FormEvent) => void;
  isMobile: boolean;
  rememberUser: boolean;
  setRememberUser: (v: boolean) => void;
  usernameInputRef: React.RefObject<HTMLInputElement | null>;
  passwordInputRef: React.RefObject<HTMLInputElement | null>;
};

/* Formulário reutilizado nos dois layouts. Usa apenas a prop isLoading (nunca isLoggingIn). */
function LoginForm({
  username, setUsername, password, setPassword,
  showPass, setShowPass, error, isLoading, onSubmit, isMobile,
  rememberUser, setRememberUser,
  usernameInputRef, passwordInputRef,
}: LoginFormProps) {
  const fs = isMobile
    ? { label: "14px", input: "15px", btn: "15px", title: "18px", version: "12px" }
    : { label: "clamp(9px,1.05cqw,13px)", input: "clamp(12px,1.4cqw,16px)", btn: "clamp(9px,1.08cqw,13px)", title: "clamp(13px,1.6cqw,19px)", version: "clamp(9px,1.02cqw,12px)" };
  const inputH = isMobile ? "44px" : "clamp(26px,4.2cqh,38px)";

  return (
    <form onSubmit={onSubmit} className="flex flex-col" style={{ gap: 0, width: "100%" }}>
      <div style={{ marginBottom: isMobile ? "14px" : "3%" }}>
        <span className="wood-tagline" style={{ fontSize: fs.title, fontWeight: 700 }}>
          Gestão e Finanças
        </span>
      </div>

      {/* Usuário — apenas visual em maiúsculo; valor enviado é o do input (trim), sem toUpperCase */}
      <div className="flex flex-col" style={{ gap: isMobile ? "5px" : "3%", marginBottom: isMobile ? "12px" : "4%" }}>
        <div style={{ filter: isMobile ? "none" : "url(#outline)", borderRadius: "5px", height: inputH, border: isMobile ? "2px solid rgba(74,42,8,0.4)" : undefined }}>
          <input
            ref={usernameInputRef}
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onInput={(e) => setUsername((e.target as HTMLInputElement).value)}
            autoComplete="username"
            autoCapitalize="characters"
            inputMode="text"
            placeholder="USUÁRIO"
            className="wood-input w-full h-full px-3"
            style={{ fontSize: fs.input, borderRadius: "4px", textTransform: "uppercase" }}
          />
        </div>
      </div>

      {/* Senha */}
      <div className="flex flex-col" style={{ gap: isMobile ? "5px" : "3%", marginBottom: isMobile ? "16px" : "6%" }}>
        <label className="wood-label font-semibold tracking-widest" style={{ fontSize: fs.label }}>SENHA</label>
        <div style={{ filter: isMobile ? "none" : "url(#outline)", borderRadius: "5px", height: inputH, position: "relative", border: isMobile ? "2px solid rgba(74,42,8,0.4)" : undefined }}>
          <input
            ref={passwordInputRef}
            defaultValue=""
            onChange={(e) => setPassword(e.target.value)}
            type={showPass ? "text" : "password"}
            autoComplete="current-password"
            autoCapitalize="none"
            placeholder="Digite sua senha"
            className="wood-input w-full h-full px-3 pr-10"
            style={{ fontSize: fs.input, borderRadius: "4px" }}
          />
          <button type="button" onClick={() => setShowPass((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[#7a5a2a] hover:text-[#3d2a0a]"
            style={{ zIndex: 2 }}>
            {showPass ? <EyeOff size={isMobile ? 16 : 13} /> : <Eye size={isMobile ? 16 : 13} />}
          </button>
        </div>
      </div>

      {/* Acima do botão ENTRAR: apenas checkbox + label "Lembrar usuário e senha" (sem texto residual) */}
      <div className="flex items-center gap-2" style={{ marginTop: isMobile ? "6px" : "2%", marginBottom: isMobile ? "8px" : "3%" }}>
        <input
          type="checkbox"
          id="remember-user"
          checked={rememberUser}
          onChange={(e) => setRememberUser(e.target.checked)}
          aria-label="Lembrar usuário e senha"
          className="cursor-pointer rounded border-amber-600/50 bg-[#f5e8c0] text-amber-700 focus:ring-amber-500 w-4 h-4 shrink-0"
        />
        <label htmlFor="remember-user" className="wood-label text-sm cursor-pointer" style={{ fontSize: fs.version, color: "rgba(255,255,255,0.9)" }}>
          Lembrar usuário e senha
        </label>
      </div>

      {/* Botão: disabled SOMENTE durante envio (isLoading); submit lê valores do DOM (refs) */}
      <button type="submit" disabled={isLoading} className="wood-btn w-full font-bold tracking-widest uppercase"
        style={{ height: inputH, fontSize: fs.btn, borderRadius: "5px", backgroundColor: "#2e9e52" }}>
        {isLoading ? "Entrando..." : "Entrar"}
      </button>

      {error && (
        <div className="rounded border border-red-500/20 bg-red-900/40 px-2 py-1 text-red-200/90"
          style={{ fontSize: "11px", fontFamily: "'Architects Daughter', cursive", marginTop: isMobile ? "10px" : "3%" }}>
          {error}
        </div>
      )}

      <div className="flex justify-end" style={{ marginTop: isMobile ? "16px" : "auto", paddingTop: isMobile ? "0" : "4%" }}>
        <span className="wood-version" style={{ fontSize: fs.version }}>GRS Móveis · v1.0</span>
      </div>
    </form>
  );
}

export default function Login() {
  if (import.meta.env.DEV) console.time("Login mount");
  const [, setLocation] = useLocation();
  const { login, isAuthenticated } = useAuthStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [rememberUser, setRememberUser] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const usernameInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const id = requestAnimationFrame(() => {
      console.timeEnd("Login mount");
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBERED_USERNAME_KEY);
      if (saved) {
        setUsername(saved);
        setRememberUser(true);
      }
    } catch {}
  }, []);

  const url = new URL(window.location.href);
  const force = url.searchParams.get("force") === "true";

  React.useEffect(() => {
    if (isAuthenticated && !force) setLocation("/dashboard");
  }, [isAuthenticated, force, setLocation]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const u = (usernameInputRef.current?.value ?? "").trim();
    const p = passwordInputRef.current?.value ?? "";
    if (!u) {
      setError("Informe o usuário.");
      return;
    }
    if (!p) {
      setError("Informe a senha.");
      return;
    }
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    try {
      const ok = await login(u, p);
      if (ok) {
        try {
          if (rememberUser) localStorage.setItem(REMEMBERED_USERNAME_KEY, u);
          else localStorage.removeItem(REMEMBERED_USERNAME_KEY);
        } catch {}
        setLocation("/dashboard");
      } else {
        setError("Usuário ou senha inválidos.");
      }
    } catch (err: unknown) {
      if (err instanceof TRPCClientError) {
        const code = err.data?.code as string | undefined;
        const http = err.data?.httpStatus as number | undefined;
        if (code === "UNAUTHORIZED" || http === 401) {
          setError("Sessão inválida. Verifique usuário e senha.");
          return;
        }
        if (http === 500 || code === "INTERNAL_SERVER_ERROR") {
          setError("Erro interno");
          return;
        }
      }
      const raw = err instanceof Error ? err.message : String(err);
      const lower = raw.toLowerCase();
      if (lower.includes("failed to fetch") || lower.includes("network")) {
        setError("Servidor offline");
      } else if (raw.length > 120 || raw.includes("at ") || raw.includes(".tsx") || raw.includes(".ts:")) {
        setError("Não foi possível entrar. Tente novamente.");
      } else {
        setError(raw || "Erro ao entrar.");
      }
    } finally {
      setIsLoggingIn(false);
    }
  }

  const formProps = {
    username, setUsername, password, setPassword,
    showPass, setShowPass, error, isLoading: isLoggingIn, onSubmit,
    rememberUser, setRememberUser,
    usernameInputRef, passwordInputRef,
  };

  return (
    <div className="min-h-screen w-full bg-[#0d0d14] flex items-center justify-center p-4">
      <style>{cartoonStyle}</style>
      <CartoonFilters />

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 h-[400px] w-[400px] rounded-full bg-violet-800/15 blur-[100px]" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-amber-600/8 blur-[100px]" />
      </div>

      {/* ══════════ DESKTOP ══════════ */}
      <div className="login-desktop relative z-10 w-full max-w-[900px]">
        <div className="relative w-full overflow-hidden rounded-2xl"
          style={{ aspectRatio: "3/2", boxShadow: "0 32px 80px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.06)" }}>
          <img src="/login-grs-leo-v2.png?cb=20260227e" alt="GRS Móveis" width={900} height={600}
            loading="lazy" className="absolute inset-0 h-full w-full object-cover select-none pointer-events-none" draggable={false} />
          <div className="absolute flex flex-col pointer-events-auto"
            style={{ left: "30%", top: "36%", width: "38%", height: "50%", padding: "0 4%", zIndex: 2 }}>
            <LoginForm {...formProps} isMobile={false} />
          </div>
        </div>
      </div>

      {/* ══════════ MOBILE ══════════ */}
      <div className="login-mobile relative z-10 w-full flex-col items-center justify-center"
        style={{ minHeight: "100svh", padding: "0" }}>

        {/* Fundo escuro com gradiente roxo sutil */}
        <div className="absolute inset-0"
          style={{ background: "linear-gradient(160deg, #1a0d2e 0%, #0d0d14 50%, #0d1a14 100%)" }} />

        {/* Avatar do Léo como marca d'água */}
        <img
          src="/assets/avatar.png?cb=20260227e"
          alt=""
          aria-hidden="true"
          width={320}
          height={400}
          loading="lazy"
          className="absolute select-none pointer-events-none"
          style={{
            bottom: "0",
            right: "-5%",
            height: "65%",
            width: "auto",
            opacity: 0.12,
            filter: "grayscale(20%)",
          }}
          draggable={false}
        />

        {/* Card do formulário centralizado */}
        <div className="relative z-10 w-full flex flex-col items-center justify-center"
          style={{ minHeight: "100svh", padding: "32px 24px" }}>

          {/* Logo / título topo */}
          <div className="flex flex-col items-center" style={{ marginBottom: "28px" }}>
            <img src="/assets/logo.png" alt="GRS Móveis" width={160} height={52} loading="lazy"
              style={{ height: "52px", marginBottom: "8px" }}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
            <span style={{
              fontFamily: "'Architects Daughter', cursive",
              fontSize: "22px", fontWeight: 700,
              color: "#fff",
              textShadow: "0 2px 12px rgba(0,0,0,0.8)",
              letterSpacing: "0.04em"
            }}>
              GRS Móveis
            </span>
          </div>

          {/* Caixa do formulário com fundo semitransparente estilo madeira */}
          <div style={{
            width: "100%", maxWidth: "360px",
            background: "rgba(80,45,10,0.55)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "16px",
            padding: "24px 20px",
            backdropFilter: "blur(12px)",
            boxShadow: "0 16px 48px rgba(0,0,0,0.55)"
          }}>
            <LoginForm {...formProps} isMobile={true} />
          </div>
        </div>
      </div>
    </div>
  );
}
