import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { PasswordField } from "../../components/PasswordField";
import { PhoneField } from "../../components/PhoneField";
import { ThemeToggle } from "../../components/ThemeToggle";
import { setDriverPassword } from "../../lib/authApi";
import { useInvalidateAuth } from "../../context/AuthContext";
import { ApiError } from "../../lib/api";

export function SetPasswordPage() {
  const location = useLocation() as { state?: { telefone?: string } };
  const navigate = useNavigate();
  const [telefone, setTelefone] = useState(location.state?.telefone ?? "");
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const invalidateAuth = useInvalidateAuth();
  const phoneLocked = Boolean(location.state?.telefone);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await setDriverPassword({ telefone, senha, confirmarSenha });
      await invalidateAuth();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível criar a senha.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div id="authScreen">
      <ThemeToggle floating />
      <div className="authbox">
        <span className="eyebrow">ACAT · Despacho</span>
        <h1>Criar nova senha</h1>
        <p className="subtle">
          {phoneLocked
            ? "Este é o seu primeiro acesso, ou sua senha foi redefinida pelo administrador. Crie uma nova senha para continuar."
            : "Informe seu telefone e crie uma nova senha."}
        </p>
        <form onSubmit={handleSubmit}>
          {phoneLocked ? (
            <div className="field">
              <label>Telefone</label>
              <input value={telefone} disabled />
            </div>
          ) : (
            <PhoneField id="telefone" value={telefone} onChange={setTelefone} />
          )}
          <PasswordField id="senha" label="Nova senha" value={senha} onChange={setSenha} autoComplete="new-password" />
          <PasswordField
            id="confirmarSenha"
            label="Confirmar nova senha"
            value={confirmarSenha}
            onChange={setConfirmarSenha}
            autoComplete="new-password"
          />
          {error && <p className="err">{error}</p>}
          <button className="primary" type="submit" disabled={submitting} style={{ width: "100%" }}>
            {submitting ? "Salvando…" : "Salvar e entrar"}
          </button>
          <p className="subtle" style={{ marginTop: 14, textAlign: "center" }}>
            <button type="button" className="linkbtn" onClick={() => navigate("/login")}>
              Voltar para o login
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
