import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SOCKET_EVENTS } from "@acat/shared";
import { useAuth } from "../../context/AuthContext";
import { useSocketEvent } from "../../hooks/useSocket";
import { ApiError } from "../../lib/api";
import {
  acceptViagemRequest,
  cancelViagemRequest,
  createViagemRequest,
  getViagemCurrent,
  getViagemQueue,
  type ViagemCall,
} from "../../lib/viagemApi";
import { resetAllTripCounts } from "../../lib/driversApi";
import type { DriverUser } from "../../types";

function useInvalidateViagem() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["viagem", "current"] }),
      queryClient.invalidateQueries({ queryKey: ["viagem", "queue"] }),
      queryClient.invalidateQueries({ queryKey: ["viagem", "history"] }),
      queryClient.invalidateQueries({ queryKey: ["drivers"] }),
    ]);
}

export function ViagemPage() {
  const { user, isMaster } = useAuth();
  const invalidate = useInvalidateViagem();
  const [showModal, setShowModal] = useState(false);

  const currentQuery = useQuery({ queryKey: ["viagem", "current"], queryFn: getViagemCurrent });
  const queueQuery = useQuery({ queryKey: ["viagem", "queue"], queryFn: getViagemQueue });

  useSocketEvent(SOCKET_EVENTS.viagemRequestCreated, () => void invalidate());
  useSocketEvent(SOCKET_EVENTS.viagemRequestClosed, () => void invalidate());
  useSocketEvent(SOCKET_EVENTS.viagemQueueUpdated, () => void invalidate());

  const call = currentQuery.data?.call ?? null;
  const nextDriver = currentQuery.data?.nextDriver ?? null;
  const queue = queueQuery.data?.queue ?? [];
  const isAdmin = user?.type === "admin";
  const isMyTurn = user?.type === "driver" && nextDriver?.id === user.id;

  return (
    <>
      <div className="panel">
        <h2>Cotur Viagem</h2>
        <p className="subtle">
          Fila por acúmulo de viagens — sem prazo, ninguém perde a vez. Quem tem menos viagens é sempre o próximo.
        </p>

        {!call && isAdmin && (
          <button className="primary" onClick={() => setShowModal(true)}>
            Nova solicitação de corrida
          </button>
        )}
        {!call && !isAdmin && <p className="empty">Nenhuma solicitação em aberto no momento.</p>}

        {call && (
          <CallCard call={call} nextDriver={nextDriver} isMyTurn={isMyTurn} isMaster={isMaster} onChanged={invalidate} />
        )}
      </div>

      {nextDriver && (
        <div className="next-card">
          <div>
            <div className="lbl">Próximo da fila</div>
            <div className="car">{nextDriver.carNumber}</div>
          </div>
          <div className="trips">{nextDriver.tripCount} viagens</div>
        </div>
      )}

      <div className="panel">
        <h2>Fila completa</h2>
        {queue.length === 0 && <p className="empty">Nenhum motorista disponível.</p>}
        {queue.map((d, i) => (
          <div key={d.id} className="row">
            <span className="pos">{i + 1}</span>
            <span className="carnum">{d.carNumber}</span>
            <span className="count">{d.tripCount}</span>
          </div>
        ))}
      </div>

      {isMaster && <AjustesPanel onChanged={invalidate} />}

      {showModal && <NewRequestModal onClose={() => setShowModal(false)} onCreated={invalidate} />}
    </>
  );
}

function CallCard({
  call,
  nextDriver,
  isMyTurn,
  isMaster,
  onChanged,
}: {
  call: ViagemCall;
  nextDriver: DriverUser | null;
  isMyTurn: boolean;
  isMaster: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const [error, setError] = useState<string | null>(null);
  const accept = useMutation({
    mutationFn: () => acceptViagemRequest(call.id),
    onSuccess: () => onChanged(),
    onError: (err) => setError(err instanceof ApiError ? err.message : "Não foi possível aceitar."),
  });
  const cancel = useMutation({
    mutationFn: () => cancelViagemRequest(call.id),
    onSuccess: () => onChanged(),
  });

  return (
    <div className={`active-call ${isMyTurn ? "" : "readonly"}`}>
      <span className="tag">Cotur Viagem</span>
      <div className="car">{call.city}</div>
      <div className="waitmsg">
        {call.tripDate} às {call.time}
      </div>
      {nextDriver && (
        <div className="waitmsg" style={{ marginTop: 6 }}>
          Aguardando aceite do carro {nextDriver.carNumber} — sem prazo, a vez não passa.
        </div>
      )}
      {error && <p className="err">{error}</p>}
      <div className="call-actions" style={{ marginTop: 12 }}>
        {isMyTurn && (
          <button className="btn-accept" onClick={() => accept.mutate()} disabled={accept.isPending}>
            {accept.isPending ? "Aceitando…" : "Aceitar viagem"}
          </button>
        )}
        {isMaster && (
          <button className="btn-skip" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
            Cancelar solicitação
          </button>
        )}
      </div>
    </div>
  );
}

function AjustesPanel({ onChanged }: { onChanged: () => Promise<unknown> }) {
  const [confirmReset, setConfirmReset] = useState(false);
  const reset = useMutation({
    mutationFn: () => resetAllTripCounts(),
    onSuccess: () => {
      setConfirmReset(false);
      return onChanged();
    },
  });

  return (
    <div className="panel">
      <h2>Ajustes</h2>
      <p className="subtle">Use a lista de motoristas para corrigir a contagem de um carro específico.</p>
      {!confirmReset ? (
        <button className="danger" onClick={() => setConfirmReset(true)}>
          Zerar contagem de viagens
        </button>
      ) : (
        <div>
          <p className="subtle">Zerar a contagem de viagens de todos os motoristas?</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="danger" onClick={() => reset.mutate()} disabled={reset.isPending}>
              Confirmar
            </button>
            <button className="ghost" onClick={() => setConfirmReset(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NewRequestModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<unknown> }) {
  const today = new Date().toISOString().slice(0, 10);
  const [data, setData] = useState(today);
  const [cidade, setCidade] = useState("");
  const [horario, setHorario] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => createViagemRequest({ data, cidade, horario }),
    onSuccess: async () => {
      await onCreated();
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Não foi possível criar a solicitação."),
  });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 40,
      }}
      onClick={onClose}
    >
      <div className="panel" style={{ width: "100%", maxWidth: 480, marginBottom: 0 }} onClick={(e) => e.stopPropagation()}>
        <h2>Nova solicitação — Cotur Viagem</h2>
        <div className="field">
          <label htmlFor="data">Data</label>
          <input id="data" type="date" min={today} value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="cidade">Cidade</label>
          <input id="cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Onde vai pegar o passageiro" />
        </div>
        <div className="field">
          <label htmlFor="horario">Horário</label>
          <input id="horario" type="time" value={horario} onChange={(e) => setHorario(e.target.value)} />
        </div>
        {error && <p className="err">{error}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="primary"
            disabled={!cidade || !horario || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Enviando…" : "Enviar solicitação"}
          </button>
          <button className="ghost" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
