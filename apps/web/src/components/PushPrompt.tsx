import { usePushSubscription } from "../hooks/usePushSubscription";

/** Small dismissible-by-outcome prompt to turn on push notifications for Cotur Cidade alerts. */
export function PushPrompt() {
  const { status, busy, subscribe } = usePushSubscription();

  if (status === "unsupported" || status === "subscribed" || status === "unknown") return null;

  return (
    <div className="panel">
      {status === "denied" ? (
        <p className="subtle">
          As notificações estão bloqueadas no navegador. Para receber avisos de corrida mesmo com o app fechado,
          permita notificações nas configurações do site.
        </p>
      ) : (
        <>
          <p className="subtle">
            Ative as notificações para saber na hora quando uma corrida chegar, mesmo com o app fechado.
          </p>
          <button className="primary" onClick={() => subscribe()} disabled={busy}>
            {busy ? "Ativando…" : "Ativar notificações"}
          </button>
        </>
      )}
    </div>
  );
}
