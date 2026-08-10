import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/api";
import { activateAdmin, createAdmin, deactivateAdmin, listAdmins } from "../../lib/adminsApi";
import { useAuth } from "../../context/AuthContext";
import { PasswordField } from "../../components/PasswordField";

export function AdminsPage() {
  const { data, isLoading } = useQuery({ queryKey: ["admins"], queryFn: listAdmins });
  const { user } = useAuth();
  const admins = data?.admins ?? [];

  return (
    <>
      <AddAdminForm />
      <div className="panel">
        <h2>Administradores</h2>
        {isLoading && <p className="subtle">Carregando…</p>}
        {admins.map((admin) => (
          <AdminRow key={admin.id} admin={admin} isSelf={admin.id === user?.id} />
        ))}
      </div>
    </>
  );
}

function AddAdminForm() {
  const [nome, setNome] = useState("");
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [isMaster, setIsMaster] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ usuario: string; senha: string } | null>(null);
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: () => createAdmin({ nome, usuario, senha, isMaster }),
    onSuccess: async () => {
      setCreated({ usuario, senha });
      setNome("");
      setUsuario("");
      setSenha("");
      setIsMaster(false);
      await queryClient.invalidateQueries({ queryKey: ["admins"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Não foi possível cadastrar."),
  });

  return (
    <div className="panel">
      <h2>Cadastrar administrador</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          create.mutate();
        }}
      >
        <div className="field">
          <label htmlFor="admin-nome">Nome</label>
          <input id="admin-nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="admin-usuario">Usuário</label>
          <input id="admin-usuario" value={usuario} onChange={(e) => setUsuario(e.target.value)} required />
        </div>
        <PasswordField id="admin-senha" label="Senha" value={senha} onChange={setSenha} autoComplete="new-password" />
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, fontSize: 13.5 }}>
          <input type="checkbox" checked={isMaster} onChange={(e) => setIsMaster(e.target.checked)} />
          Administrador master (acesso completo)
        </label>
        {error && <p className="err">{error}</p>}
        <button className="primary" type="submit" disabled={!nome || !usuario || senha.length < 6 || create.isPending}>
          {create.isPending ? "Cadastrando…" : "Cadastrar"}
        </button>
      </form>

      {created && (
        <div className="panel" style={{ marginTop: 14, background: "var(--surface-2)" }}>
          <h2>Administrador cadastrado</h2>
          <p className="subtle">
            Anote esta senha antes de fechar — ela não pode ser recuperada depois, só redefinida criando outro
            acesso.
          </p>
          <p>
            Usuário: <strong>{created.usuario}</strong>
            <br />
            Senha: <strong>{created.senha}</strong>
          </p>
          <button className="ghost" onClick={() => setCreated(null)}>
            Fechar
          </button>
        </div>
      )}
    </div>
  );
}

function AdminRow({ admin, isSelf }: { admin: { id: string; nome: string; usuario: string; role: string; active: boolean }; isSelf: boolean }) {
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: () => (admin.active ? deactivateAdmin(admin.id) : activateAdmin(admin.id)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admins"] }),
  });

  return (
    <div className="row">
      <div style={{ flex: 1 }}>
        <div className="carnum" style={{ fontSize: 14 }}>
          {admin.nome} <span className="sub">@{admin.usuario}</span>
        </div>
        <span className="sub">
          {admin.role === "admin_master" ? "Master" : "Comum"} · {admin.active ? "Ativo" : "Desativado"}
        </span>
      </div>
      {!isSelf && (
        <button className="ghost" onClick={() => toggle.mutate()} disabled={toggle.isPending}>
          {admin.active ? "Desativar" : "Ativar"}
        </button>
      )}
    </div>
  );
}
