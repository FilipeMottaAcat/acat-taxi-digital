import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { maskCarNumber, maskDriverName } from "@acat/shared";
import { PhoneField } from "../../components/PhoneField";
import { ApiError } from "../../lib/api";
import {
  addDriverManually,
  approveDriver,
  blockDriver,
  deleteDriver,
  getDeletionHistory,
  getPasswordResetRequests,
  listDrivers,
  rejectDriver,
  resetDriverPassword,
  setPriorityOrder,
  unblockDriver,
} from "../../lib/driversApi";
import type { DriverUser } from "../../types";

function useDrivers() {
  return useQuery({ queryKey: ["drivers"], queryFn: listDrivers });
}

export function MotoristasPage() {
  const { data, isLoading } = useDrivers();
  const drivers = data?.drivers ?? [];
  const pending = drivers.filter((d) => d.approvalStatus === "pendente");
  const active = drivers
    .filter((d) => d.approvalStatus !== "pendente")
    .sort((a, b) => a.priorityRank - b.priorityRank);

  return (
    <>
      <PendingSignups pending={pending} />
      <AddDriverForm />
      <PasswordResetRequests />
      <ActiveDrivers drivers={active} loading={isLoading} />
      <DeletionHistoryPanel />
    </>
  );
}

function usePublicMutation<Arg, Result>(fn: (arg: Arg) => Promise<Result>, extraKeys: string[][] = []) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["drivers"] });
      for (const key of extraKeys) await queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

function PendingSignups({ pending }: { pending: DriverUser[] }) {
  const approve = usePublicMutation((id: string) => approveDriver(id));
  const reject = usePublicMutation((args: { id: string; motivo: string }) => rejectDriver(args.id, args.motivo));
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");

  if (pending.length === 0) return null;

  return (
    <div className="panel">
      <h2>Cadastros pendentes</h2>
      {pending.map((d) => (
        <div key={d.id} className="row" style={{ flexWrap: "wrap" }}>
          <span className="carnum" style={{ flex: 1 }}>
            {d.carNumber} — {d.name}
            <span className="sub" style={{ display: "block" }}>
              {d.phone}
            </span>
          </span>
          {rejecting === d.id ? (
            <div style={{ display: "flex", gap: 6, width: "100%", marginTop: 8 }}>
              <input
                placeholder="Motivo da recusa"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                style={{
                  flex: 1,
                  background: "var(--surface-2)",
                  border: "1px solid var(--line)",
                  color: "var(--text)",
                  borderRadius: 8,
                  padding: "8px 10px",
                }}
              />
              <button
                className="danger"
                disabled={!motivo.trim() || reject.isPending}
                onClick={() => {
                  reject.mutate(
                    { id: d.id, motivo },
                    { onSuccess: () => setRejecting(null) },
                  );
                }}
              >
                Confirmar
              </button>
              <button className="ghost" onClick={() => setRejecting(null)}>
                Cancelar
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 6 }}>
              <button className="iconbtn" title="Aprovar" onClick={() => approve.mutate(d.id)}>
                ✓
              </button>
              <button className="iconbtn" title="Recusar" onClick={() => setRejecting(d.id)}>
                ✕
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AddDriverForm() {
  const [telefone, setTelefone] = useState("");
  const [carro, setCarro] = useState("");
  const [nome, setNome] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<DriverUser | null>(null);
  const add = usePublicMutation(
    (input: { telefone: string; carro: string; nome: string }) => addDriverManually(input),
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await add.mutateAsync({ telefone, carro, nome });
      setCreated(res.driver);
      setTelefone("");
      setCarro("");
      setNome("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível cadastrar o motorista.");
    }
  }

  return (
    <div className="panel">
      <h2>Cadastrar motorista manualmente</h2>
      <p className="subtle">O motorista entra já aprovado e cria a própria senha no primeiro login.</p>
      <form onSubmit={handleSubmit}>
        <PhoneField id="add-telefone" value={telefone} onChange={setTelefone} />
        <div className="field">
          <label htmlFor="add-carro">Número do carro</label>
          <input id="add-carro" value={carro} onChange={(e) => setCarro(maskCarNumber(e.target.value))} placeholder="000" required />
        </div>
        <div className="field">
          <label htmlFor="add-nome">Nome do motorista</label>
          <input id="add-nome" value={nome} onChange={(e) => setNome(maskDriverName(e.target.value))} required />
        </div>
        {error && <p className="err">{error}</p>}
        <button className="primary" type="submit" disabled={add.isPending}>
          {add.isPending ? "Cadastrando…" : "Cadastrar"}
        </button>
      </form>
      {created && (
        <div className="panel" style={{ marginTop: 14, background: "var(--surface-2)" }}>
          <h2>Motorista cadastrado</h2>
          <p className="subtle">
            Repasse esses dados para o motorista — ele cria a própria senha no primeiro login.
          </p>
          <p>
            Carro <strong>{created.carNumber}</strong>
            <br />
            Nome: {created.name}
            <br />
            Telefone: {created.phone}
          </p>
          <button className="ghost" onClick={() => setCreated(null)}>
            Fechar
          </button>
        </div>
      )}
    </div>
  );
}

function PasswordResetRequests() {
  const { data } = useQuery({ queryKey: ["password-reset-requests"], queryFn: getPasswordResetRequests });
  const reset = usePublicMutation((id: string) => resetDriverPassword(id), [["password-reset-requests"]]);
  const requests = data?.requests ?? [];

  if (requests.length === 0) return null;

  return (
    <div className="panel">
      <h2>Pedidos de redefinição de senha</h2>
      {requests.map((r) => (
        <div key={r.id} className="row">
          <span className="carnum" style={{ flex: 1 }}>
            {r.driver.carNumber} — {r.driver.name}
          </span>
          <button className="ghost" onClick={() => reset.mutate(r.driver.id)} disabled={reset.isPending}>
            Redefinir senha
          </button>
        </div>
      ))}
    </div>
  );
}

function ActiveDrivers({ drivers, loading }: { drivers: DriverUser[]; loading: boolean }) {
  const block = usePublicMutation((id: string) => blockDriver(id));
  const unblock = usePublicMutation((id: string) => unblockDriver(id));
  const resetPw = usePublicMutation((id: string) => resetDriverPassword(id), [["password-reset-requests"]]);
  const del = usePublicMutation((id: string) => deleteDriver(id), [["deletion-history"]]);
  const reorder = usePublicMutation((ids: string[]) => setPriorityOrder(ids));
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const approvedOrdered = drivers.filter((d) => d.approvalStatus === "aprovado");
  const rejected = drivers.filter((d) => d.approvalStatus === "rejeitado");

  function move(id: string, direction: -1 | 1) {
    const ids = approvedOrdered.map((d) => d.id);
    const idx = ids.indexOf(id);
    const swapWith = idx + direction;
    if (swapWith < 0 || swapWith >= ids.length) return;
    [ids[idx], ids[swapWith]] = [ids[swapWith], ids[idx]];
    reorder.mutate(ids);
  }

  return (
    <div className="panel">
      <h2>Motoristas</h2>
      {loading && <p className="subtle">Carregando…</p>}
      {!loading && approvedOrdered.length === 0 && <p className="empty">Nenhum motorista aprovado ainda.</p>}
      {approvedOrdered.map((d, i) => (
        <div key={d.id} className="queue-row" style={{ flexWrap: "wrap" }}>
          <span className="pos">{i + 1}</span>
          <div className="carwrap">
            <div className="carnum">{d.carNumber}</div>
            <div className="nome">
              {d.name} · {d.phone} · {d.tripCount} viagens
            </div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button className="iconbtn" title="Subir prioridade" onClick={() => move(d.id, -1)}>
              ↑
            </button>
            <button className="iconbtn" title="Descer prioridade" onClick={() => move(d.id, 1)}>
              ↓
            </button>
            <button
              className="iconbtn"
              title={d.blocked ? "Desbloquear" : "Bloquear"}
              onClick={() => (d.blocked ? unblock.mutate(d.id) : block.mutate(d.id))}
            >
              {d.blocked ? "🔓" : "🔒"}
            </button>
            <button className="iconbtn" title="Redefinir senha" onClick={() => resetPw.mutate(d.id)}>
              🔑
            </button>
            <button className="iconbtn" title="Excluir" onClick={() => setConfirmDelete(d.id)}>
              🗑
            </button>
          </div>
          {d.blocked && <span className="err" style={{ width: "100%" }}>Bloqueado</span>}
          {confirmDelete === d.id && (
            <div className="panel" style={{ width: "100%", marginTop: 8, background: "var(--surface-2)" }}>
              <p className="subtle">Excluir o carro {d.carNumber}? Os dados vão para o histórico.</p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="danger"
                  onClick={() => del.mutate(d.id, { onSuccess: () => setConfirmDelete(null) })}
                >
                  Excluir
                </button>
                <button className="ghost" onClick={() => setConfirmDelete(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {rejected.length > 0 && (
        <>
          <h2 style={{ marginTop: 18 }}>Recusados</h2>
          {rejected.map((d) => (
            <div key={d.id} className="histrow">
              <div className="t1">
                {d.carNumber} — {d.name}
              </div>
              <div className="t2">
                {d.phone} · Motivo: {d.rejectionReason ?? "não informado"}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function DeletionHistoryPanel() {
  const { data } = useQuery({ queryKey: ["deletion-history"], queryFn: getDeletionHistory });
  const history = data?.history ?? [];
  if (history.length === 0) return null;

  return (
    <div className="panel">
      <h2>Carros excluídos</h2>
      {history.map((h) => (
        <div key={h.id} className="histrow">
          <div className="t1">
            {h.carNumber} — {h.name}
          </div>
          <div className="t2">
            {h.phone} · {h.tripCount} viagens · {h.reason ?? "sem motivo informado"}
          </div>
        </div>
      ))}
    </div>
  );
}
