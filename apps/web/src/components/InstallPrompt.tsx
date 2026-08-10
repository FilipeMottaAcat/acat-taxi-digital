import { useInstallPrompt } from "../hooks/useInstallPrompt";

export function InstallPrompt() {
  const { canInstall, installed, promptInstall } = useInstallPrompt();

  if (installed || !canInstall) return null;

  return (
    <div className="panel">
      <p className="subtle">Instale o ACAT Táxi Digital na tela inicial do seu celular para acessar mais rápido.</p>
      <button className="ghost" onClick={() => promptInstall()}>
        Instalar app
      </button>
    </div>
  );
}
