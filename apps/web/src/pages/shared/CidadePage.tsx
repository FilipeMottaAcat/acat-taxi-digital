import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SOCKET_EVENTS } from "@acat/shared";
import { useAuth } from "../../context/AuthContext";
import { useSocketEvent } from "../../hooks/useSocket";
import { ApiError } from "../../lib/api";
import { CountdownTimer } from "../../components/CountdownTimer";
import { PushPrompt } from "../../components/PushPrompt";
import {
  acceptCidadeCall,
  cancelCidadeCall,
  createCidadeCall,
  declineCidadeCall,
  getCidadeCurrent,
  getCidadeQueue,
  type CidadeCall,
} from "../../lib/cidadeApi";
import { finalizarCorrida, updateOwnStatus } from "../../lib/driversApi";
import type { DriverUser } from "../../types";

function useInvalidateCidade() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["cidade", "current"] }),
      queryClient.invalidateQueries({ queryKey: ["cidade", "queue"] }),
      queryClient.invalidateQueries({ queryKey: ["cidade", "history"] }),
    ]);
}

export function CidadePage() {
  const { user, isMaster } = useAuth();
  const invalidate = useInvalidateCidade();
  const [showModal, setShowModal] = useState(false);

  const currentQuery = useQuery({ queryKey: ["cidade", "current"], queryFn: getCidadeCurrent });
  const queueQuery = useQuery({ queryKey: ["cidade", "queue"], queryFn: getCidadeQueue });

  const onEvent = () => void invalidate();
  useSocketEvent(SOCKET_EVENTS.cidadeCallCreated, onEvent);
  useSocketEvent(SOCKET_EVENTS.cidadeOffered, onEvent);
  useSocketEvent(SOCKET_EVENTS.cidadeDeclined, onEvent);
  useSocketEvent(SOCKET_EVENTS.cidadeTimedOut, onEvent);
  useSocketEvent(SOCKET_EVENTS.cidadeWaitingForAvailable, onEvent);
  useSocketEvent(SOCKET_EVENTS.cidadeAccepted, onEvent);
  useSocketEvent(SOCKET_EVENTS.cidadeCancelled, onEvent);
  useSocketEvent(SOCKET_EVENTS.cidadeQueueUpdated, onEvent);
  useSocketEvent(SOCKET_EVENTS.driverStatusChanged, onEvent);

  const call = currentQuery.data?.call ?? null;
  const candidate = currentQuery.data?.candidate ?? null;
  const queue = queueQuery.data?.queue ?? [];
  const isAdmin = user?.type === "admin";
  const isCandidate = user?.type === "driver" && call?.candidateDriverId === user.id;

  return (
    <>
      <PushPrompt />
      <div className="panel">
        <h2>Cotur Cidade</h2>
        <p className="subtle">
          Fila sequencial com prazo de resposta — 30 min pra corrida agendada, 10 min pra corrida de momento.
        </p>

        {!call && isAdmin && (
          <button className="primary" onClick={() => setShowModal(true)}>
            Nova solicitação de corrida
          </button>
        )}
        {!call && !isAdmin && <p className="empty">Nenhuma chamada em aberto no momento.</p>}

        {call && (
          <CidadeCallCard
            call={call}
            candidate={candidate}
            isCandidate={isCandidate}
            isMaster={isMaster}
            onChanged={invalidate}
          />
        )}
      </div>

      <div className="panel">
        <h2>Fila completa</h2>
        {queue.length === 0 && <p className="empty">Nenhum motorista disponível.</p>}
        {queue.map((d, i) => (
          <CidadeQueueRow
            key={d.id}
            driver={d}
            position={i + 1}
            isSelf={user?.type === "driver" && user.id === d.id}
            onChanged={invalidate}
          />
        ))}
      </div>

      {showModal && <NewCidadeCallModal onClose={() => setShowModal(false)} onCreated={invalidate} />}
    </>
  );
}

function CidadeCallCard({
  call,
  candidate,
  isCandidate,
  isMaster,
  onChanged,
}: {
  call: CidadeCall;
  candidate: DriverUser | null;
  isCandidate: boolean;
  isMaster: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const [error, setError] = useState<string | null>(null);
  const accept = useMutation({
    mutationFn: () => acceptCidadeCall(call.id),
    onSuccess: () => onChanged(),
    onError: (err) => setError(err instanceof ApiError ? err.message : "Não foi possível aceitar."),
  });
  const decline = useMutation({
    mutationFn: () => declineCidadeCall(call.id),
    onSuccess: () => onChanged(),
    onError: (err) => setError(err instanceof ApiError ? err.message : "Não foi possível recusar."),
  });
  const cancel = useMutation({
    mutationFn: () => cancelCidadeCall(call.id),
    onSuccess: () => onChanged(),
  });

  const waiting = call.status === "waiting_for_available";

  return (
    <div className={`active-call ${isCandidate ? "" : "readonly"}`}>
      <span className="tag">Cotur Cidade · {call.type === "agendada" ? "Agendada" : "De momento"}</span>
      <div className="car">{call.city}</div>
      <div className="waitmsg">
        {call.tripDate} às {call.time}
      </div>

      {waiting ? (
        <div className="waitmsg" style={{ marginTop: 8 }}>
          Nenhum motorista disponível no momento. Assim que alguém ficar disponível, a corrida é oferecida
          automaticamente.
        </div>
      ) : (
        <>
          {candidate && (
            <div className="waitmsg" style={{ marginTop: 8 }}>
              {isCandidate
                ? "É a sua vez — responda dentro do prazo."
                : `Aguardando resposta do carro ${candidate.carNumber}. Se não responder a tempo, cai automaticamente pro próximo disponível.`}
            </div>
          )}
          {call.offerExpiresAt && <CountdownTimer expiresAt={call.offerExpiresAt} />}
        </>
      )}

      {error && <p className="err">{error}</p>}

      <div className="call-actions" style={{ marginTop: 12 }}>
        {isCandidate && !waiting && (
          <>
            <button className="btn-accept" onClick={() => accept.mutate()} disabled={accept.isPending}>
              {accept.isPending ? "Aceitando…" : "Aceitar"}
            </button>
            <button className="btn-skip" onClick={() => decline.mutate()} disabled={decline.isPending}>
              {decline.isPending ? "Recusando…" : "Recusar"}
            </button>
          </>
        )}
        {isMaster && (
          <button className="btn-skip" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
            Cancelar chamada
          </button>
        )}
      </div>
    </div>
  );
}

function CidadeQueueRow({
  driver,
  position,
  isSelf,
  onChanged,
}: {
  driver: DriverUser;
  position: number;
  isSelf: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const toggle = useMutation({
    mutationFn: () => updateOwnStatus(driver.operationalStatus === "disponivel" ? "indisponivel" : "disponivel"),
    onSuccess: () => onChanged(),
  });
  const finish = useMutation({
    mutationFn: () => finalizarCorrida(),
    onSuccess: () => onChanged(),
  });

  const statusClass =
    driver.operationalStatus === "disponivel" ? "disp" : driver.operationalStatus === "em_viagem" ? "viagem" : "indisp";
  const statusLabel =
    driver.operationalStatus === "disponivel"
      ? "Disponível"
      : driver.operationalStatus === "em_viagem"
        ? "Em viagem"
        : "Indisponível";

  return (
    <div className="queue-row">
      <span className="pos">{position}</span>
      <div className="carwrap">
        <div className="carnum">{driver.carNumber}</div>
        <div className="nome">{driver.name}</div>
      </div>
      {isSelf && driver.operationalStatus === "em_viagem" ? (
        <button className="ghost" onClick={() => finish.mutate()} disabled={finish.isPending}>
          {finish.isPending ? "Finalizando…" : "Finalizar corrida"}
        </button>
      ) : isSelf ? (
        <button className={`toggle ${statusClass}`} onClick={() => toggle.mutate()} disabled={toggle.isPending}>
          {statusLabel}
        </button>
      ) : (
        <span className={`toggle ${statusClass}`}>{statusLabel}</span>
      )}
    </div>
  );
}

function NewCidadeCallModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<unknown> }) {
  const today = new Date().toISOString().slice(0, 10);
  const [data, setData] = useState(today);
  const [cidade, setCidade] = useState("");
  const [horario, setHorario] = useState("");
  const [type, setType] = useState<"agendada" | "momento">("momento");
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => createCidadeCall({ data, cidade, horario, type }),
    onSuccess: async () => {
      await onCreated();
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Não foi possível criar a chamada."),
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
        <h2>Nova solicitação — Cotur Cidade</h2>
        <div className="field">
          <label>Tipo</label>
          <div className="call-type-btns">
            <button type="button" disabled={type === "agendada"} onClick={() => setType("agendada")}>
              Agendada
              <span className="t">SLA 30 min</span>
            </button>
            <button type="button" disabled={type === "momento"} onClick={() => setType("momento")}>
              De momento
              <span className="t">SLA 10 min</span>
            </button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="cidade-data">Data</label>
          <input id="cidade-data" type="date" min={today} value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="cidade-cidade">Cidade</label>
          <input
            id="cidade-cidade"
            value={cidade}
            onChange={(e) => setCidade(e.target.value)}
            placeholder="Onde vai pegar o passageiro"
          />
        </div>
        <div className="field">
          <label htmlFor="cidade-horario">Horário</label>
          <input id="cidade-horario" type="time" value={horario} onChange={(e) => setHorario(e.target.value)} />
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
