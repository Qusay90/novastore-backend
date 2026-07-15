import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from "react";

interface ErrorBoundaryState { error: Error | null; }

export class ErrorBoundary extends Component<PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };
  static getDerivedStateFromError(error: Error): ErrorBoundaryState { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("[NovaStore theme preview]", error, info); }
  render(): ReactNode { return this.state.error ? <main className="fatal-error"><span className="eyebrow">Tema önizleme</span><h1>Sayfa görüntülenemedi</h1><p>Mevcut mağaza etkilenmedi. Önizlemeyi yeniden yükleyebilirsin.</p><button className="button primary" onClick={() => window.location.reload()}>Yeniden Dene</button></main> : this.props.children; }
}
