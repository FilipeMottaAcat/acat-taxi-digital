import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { maskUsername } from "@acat/shared";
import { PasswordField } from "../../components/PasswordField";
import { ThemeToggle } from "../../components/ThemeToggle";
import { bootstrapMaster } from "../../lib/authApi";
import { ApiError } from "../../lib/api";

export function BootstrapPage() {
  const [nome, setNome] = useState("");
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const queryClient = useQueryClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await bootstrapMaster({ nome, usuario, senha });
      await queryClient.invalidateQueries({ queryKey: ["bootstrap-status"] });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível criar o administrador.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div id="authScreen">
      <ThemeToggle floating />
      <div className="authbox">
        <span className="eyebrow">ACAT · Despacho</span>
        <h1>Criar administrador master</h1>
        <p className="subtle">
          Nenhum administrador foi cadastrado ainda. A primeira conta criada aqui vira o administrador master —
          responsável por aprovar motoristas, gerenciar carros e outros administradores.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="nome">Nome</label>
            <input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="usuario">Usuário</label>
            <input
              id="usuario"
              value={usuario}
              onChange={(e) => setUsuario(maskUsername(e.target.value))}
              placeholder="ex.: filipe.motta (sem espaços)"
              required
            />
          </div>
          <PasswordField id="senha" label="Senha" value={senha} onChange={setSenha} autoComplete="new-password" />
          {error && <p className="err">{error}</p>}
          <button className="primary" type="submit" disabled={submitting} style={{ width: "100%" }}>
            {submitting ? "Criando…" : "Criar conta e entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
