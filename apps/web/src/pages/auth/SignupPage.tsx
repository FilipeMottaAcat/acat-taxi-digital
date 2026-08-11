import { useState } from "react";
import { Link } from "react-router-dom";
import { maskCarNumber, maskDriverName } from "@acat/shared";
import { PasswordField } from "../../components/PasswordField";
import { PhoneField } from "../../components/PhoneField";
import { ThemeToggle } from "../../components/ThemeToggle";
import { Logo } from "../../components/Logo";
import { driverSignup } from "../../lib/authApi";
import { ApiError } from "../../lib/api";

export function SignupPage() {
  const [telefone, setTelefone] = useState("");
  const [carro, setCarro] = useState("");
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await driverSignup({ telefone, carro, nome, senha, confirmarSenha });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível enviar o cadastro.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div id="authScreen">
        <ThemeToggle floating />
        <div className="authbox">
          <Logo className="logo-lg" />
          <h1>Cadastro enviado!</h1>
          <p className="subtle">
            Aguarde a aprovação do administrador master. Assim que seu carro for aprovado, você já pode entrar
            com o telefone e a senha que acabou de criar.
          </p>
          <Link to="/login" className="linkbtn">
            Voltar para o login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div id="authScreen">
      <ThemeToggle floating />
      <div className="authbox">
        <span className="eyebrow">ACAT · Despacho</span>
        <h1>Primeiro acesso</h1>
        <p className="subtle">Crie seu login de motorista. Seu cadastro precisa ser aprovado antes de você poder entrar.</p>
        <form onSubmit={handleSubmit}>
          <PhoneField id="telefone" value={telefone} onChange={setTelefone} />
          <div className="field">
            <label htmlFor="carro">Número do carro</label>
            <input
              id="carro"
              inputMode="numeric"
              placeholder="000"
              value={carro}
              onChange={(e) => setCarro(maskCarNumber(e.target.value))}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="nome">Nome do motorista</label>
            <input id="nome" value={nome} onChange={(e) => setNome(maskDriverName(e.target.value))} required />
          </div>
          <PasswordField id="senha" label="Senha" value={senha} onChange={setSenha} autoComplete="new-password" />
          <PasswordField
            id="confirmarSenha"
            label="Confirmar senha"
            value={confirmarSenha}
            onChange={setConfirmarSenha}
            autoComplete="new-password"
          />
          {error && <p className="err">{error}</p>}
          <button className="primary" type="submit" disabled={submitting} style={{ width: "100%" }}>
            {submitting ? "Enviando…" : "Criar cadastro"}
          </button>
          <p className="subtle" style={{ marginTop: 14, textAlign: "center" }}>
            <Link to="/login" className="linkbtn">
              Já tenho login — entrar
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
