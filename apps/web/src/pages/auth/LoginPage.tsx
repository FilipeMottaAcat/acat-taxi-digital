import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PasswordField } from "../../components/PasswordField";
import { PhoneField } from "../../components/PhoneField";
import { ThemeToggle } from "../../components/ThemeToggle";
import { adminLogin, driverCheck, driverLogin } from "../../lib/authApi";
import { useInvalidateAuth } from "../../context/AuthContext";
import { ApiError } from "../../lib/api";

type Role = "admin" | "motorista";

export function LoginPage() {
  const [role, setRole] = useState<Role>("motorista");

  return (
    <div id="authScreen">
      <ThemeToggle floating />
      <div className="authbox">
        <span className="eyebrow">ACAT · Despacho</span>
        <h1>Entrar</h1>
        <div className="role-switch">
          <button type="button" className={role === "admin" ? "active" : ""} onClick={() => setRole("admin")}>
            Administrador
          </button>
          <button
            type="button"
            className={role === "motorista" ? "active" : ""}
            onClick={() => setRole("motorista")}
          >
            Motorista
          </button>
        </div>
        {role === "admin" ? <AdminLoginForm /> : <DriverLoginForm />}
      </div>
    </div>
  );
}

function AdminLoginForm() {
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const invalidateAuth = useInvalidateAuth();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await adminLogin({ usuario, senha });
      await invalidateAuth();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível entrar.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="usuario">Usuário</label>
        <input id="usuario" value={usuario} onChange={(e) => setUsuario(e.target.value)} required />
      </div>
      <PasswordField id="senha" label="Senha" value={senha} onChange={setSenha} autoComplete="current-password" />
      {error && <p className="err">{error}</p>}
      <button className="primary" type="submit" disabled={submitting} style={{ width: "100%" }}>
        {submitting ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}

function DriverLoginForm() {
  const [step, setStep] = useState<"phone" | "password">("phone");
  const [telefone, setTelefone] = useState("");
  const [senha, setSenha] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const invalidateAuth = useInvalidateAuth();
  const navigate = useNavigate();

  async function handleContinue(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const status = await driverCheck(telefone);
      if (!status.found) {
        setError('Telefone não cadastrado. Use "Primeiro acesso" para se cadastrar.');
        return;
      }
      if (status.blocked) {
        setError("Seu acesso foi bloqueado. Fale com o administrador.");
        return;
      }
      if (status.approvalStatus === "pendente") {
        setError("Seu cadastro ainda está aguardando aprovação do administrador master.");
        return;
      }
      if (status.approvalStatus === "rejeitado") {
        setError(`Seu cadastro foi recusado. Motivo: ${status.rejectionReason ?? "não informado"}`);
        return;
      }
      if (status.mustSetPassword) {
        navigate("/set-password", { state: { telefone } });
        return;
      }
      setStep("password");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível verificar o telefone.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await driverLogin({ telefone, senha });
      await invalidateAuth();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível entrar.");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "phone") {
    return (
      <form onSubmit={handleContinue}>
        <PhoneField id="telefone" value={telefone} onChange={setTelefone} />
        {error && <p className="err">{error}</p>}
        <button className="primary" type="submit" disabled={submitting} style={{ width: "100%" }}>
          {submitting ? "Verificando…" : "Continuar"}
        </button>
        <p className="subtle" style={{ marginTop: 14, textAlign: "center" }}>
          <Link to="/signup" className="linkbtn">
            Primeiro acesso — criar meu login
          </Link>
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={handleLogin}>
      <div className="field">
        <label>Telefone</label>
        <input value={telefone} disabled />
      </div>
      <PasswordField id="senha" label="Senha" value={senha} onChange={setSenha} autoComplete="current-password" />
      {error && <p className="err">{error}</p>}
      <button className="primary" type="submit" disabled={submitting} style={{ width: "100%" }}>
        {submitting ? "Entrando…" : "Entrar"}
      </button>
      <p className="subtle" style={{ marginTop: 14, textAlign: "center" }}>
        <button type="button" className="linkbtn" onClick={() => setStep("phone")}>
          Usar outro telefone
        </button>
      </p>
    </form>
  );
}
