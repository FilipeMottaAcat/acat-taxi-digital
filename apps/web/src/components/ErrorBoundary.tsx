import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div id="authScreen">
          <div className="authbox">
            <span className="eyebrow">ACAT · Despacho</span>
            <h1>Algo deu errado</h1>
            <p className="subtle">
              A tela encontrou um erro inesperado. Tente recarregar a página — se o problema continuar, avise o
              administrador.
            </p>
            <button className="primary" onClick={() => window.location.reload()}>
              Recarregar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
