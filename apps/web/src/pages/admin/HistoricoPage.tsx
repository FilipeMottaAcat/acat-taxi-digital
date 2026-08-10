import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { getViagemHistory } from "../../lib/viagemApi";
import { getCidadeHistory } from "../../lib/cidadeApi";

export function HistoricoPage() {
  const { isMaster } = useAuth();
  const viagemQuery = useQuery({ queryKey: ["viagem", "history"], queryFn: getViagemHistory });
  const cidadeQuery = useQuery({ queryKey: ["cidade", "history"], queryFn: getCidadeHistory });

  const viagemCalls = viagemQuery.data?.calls ?? [];
  const cidadeCalls = cidadeQuery.data?.calls ?? [];

  return (
    <>
      {!isMaster && (
        <p className="subtle" style={{ marginBottom: 14 }}>
          Mostrando apenas as solicitações que você mesmo criou.
        </p>
      )}

      <div className="panel">
        <h2>Histórico — Cotur Viagem</h2>
        {viagemCalls.length === 0 && <p className="empty">Nenhum registro ainda.</p>}
        {viagemCalls.map((call) => (
          <div key={call.id} className="histrow">
            <div className="t1">
              {call.city} —{" "}
              {call.status === "concluido" ? `aceito pelo carro ${call.acceptedCarSnap}` : "cancelado"}
            </div>
            <div className="t2">
              {call.tripDate} às {call.time}
            </div>
          </div>
        ))}
      </div>

      <div className="panel">
        <h2>Histórico — Cotur Cidade</h2>
        {cidadeCalls.length === 0 && <p className="empty">Nenhum registro ainda.</p>}
        {cidadeCalls.map((call) => (
          <div key={call.id} className="histrow">
            <div className="t1">
              {call.city} · {call.type === "agendada" ? "Agendada" : "De momento"} —{" "}
              {call.status === "concluido" ? `aceito pelo carro ${call.acceptedCarSnap}` : "cancelado"}
            </div>
            <div className="t2">
              {call.tripDate} às {call.time}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
