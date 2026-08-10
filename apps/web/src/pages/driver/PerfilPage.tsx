import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { usePushSubscription } from "../../hooks/usePushSubscription";
import { InstallPrompt } from "../../components/InstallPrompt";
import { ApiError } from "../../lib/api";
import { requestOwnPasswordReset } from "../../lib/driversApi";

export function PerfilPage() {
  const { user } = useAuth();
  const push = usePushSubscription();
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  const requestReset = useMutation({
    mutationFn: () => requestOwnPasswordReset(),
    onSuccess: () => {
      setResetError(null);
      setResetMessage("Pedido enviado! O administrador master vai redefinir sua senha em breve.");
    },
    onError: (err) => {
      setResetMessage(null);
      setResetError(err instanceof ApiError ? err.message : "Não foi possível enviar o pedido.");
    },
  });

  if (user?.type !== "driver") return null;

  return (
    <>
      <div className="panel">
        <h2>Meu perfil</h2>
        <p>
          Carro <strong>{user.carNumber}</strong>
          <br />
          {user.name}
          <br />
          <span className="sub">{user.phone}</span>
        </p>
      </div>

      <InstallPrompt />

      <div className="panel">
        <h2>Notificações</h2>
        {push.status === "unsupported" && (
          <p className="subtle">Este navegador não é compatível com notificações push.</p>
        )}
        {push.status === "denied" && (
          <p className="subtle">
            As notificações estão bloqueadas. Permita notificações para este site nas configurações do navegador
            para receber avisos de corrida mesmo com o app fechado.
          </p>
        )}
        {push.status === "subscribed" && (
          <>
            <p className="subtle">Notificações ativadas — você será avisado quando uma corrida chegar.</p>
            <button className="ghost" onClick={() => push.unsubscribe()} disabled={push.busy}>
              {push.busy ? "Desativando…" : "Desativar notificações"}
            </button>
          </>
        )}
        {push.status === "unsubscribed" && (
          <>
            <p className="subtle">Ative para ser avisado quando uma corrida chegar, mesmo com o app fechado.</p>
            <button className="primary" onClick={() => push.subscribe()} disabled={push.busy}>
              {push.busy ? "Ativando…" : "Ativar notificações"}
            </button>
          </>
        )}
      </div>

      <div className="panel">
        <h2>Senha</h2>
        <p className="subtle">Esqueceu sua senha? Envie um pedido para o administrador master redefinir.</p>
        {resetMessage && <p className="subtle">{resetMessage}</p>}
        {resetError && <p className="err">{resetError}</p>}
        <button className="ghost" onClick={() => requestReset.mutate()} disabled={requestReset.isPending}>
          {requestReset.isPending ? "Enviando…" : "Solicitar redefinição de senha"}
        </button>
      </div>
    </>
  );
}
