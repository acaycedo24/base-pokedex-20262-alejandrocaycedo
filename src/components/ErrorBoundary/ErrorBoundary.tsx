import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Límite de errores.
 *
 * Es el único componente de clase de la aplicación, y no por nostalgia: los
 * hooks no pueden capturar errores de render. `getDerivedStateFromError` y
 * `componentDidCatch` no tienen equivalente en función.
 *
 * Sin él, cualquier excepción durante el render desmonta el árbol entero y
 * deja una pantalla en blanco, que es indistinguible de "se ha recargado la
 * página" para quien lo sufre.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  /** Se ejecuta durante el render fallido: solo puede devolver estado. */
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  /** Se ejecuta después, ya en fase de commit: aquí sí caben efectos. */
  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('PokeSearch — fallo de render:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          position: 'relative',
          zIndex: 'var(--z-content)',
          display: 'grid',
          placeContent: 'center',
          gap: 'var(--s-3)',
          minHeight: '100dvh',
          padding: 'var(--s-6)',
          textAlign: 'center',
        }}
      >
        <p
          style={{
            fontSize: 'var(--fs-micro)',
            letterSpacing: 'var(--tracking-mega)',
            color: 'var(--c-danger)',
            textTransform: 'uppercase',
          }}
        >
          &gt;&gt; Fallo crítico del sistema
        </p>
        <p style={{ color: 'var(--c-text-dim)' }}>{error.message}</p>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          style={{
            justifySelf: 'center',
            padding: 'var(--s-2) var(--s-4)',
            border: '1px solid var(--c-danger)',
            borderRadius: 'var(--r-full)',
            color: 'var(--c-danger)',
            fontSize: 'var(--fs-micro)',
            letterSpacing: 'var(--tracking-wide)',
            textTransform: 'uppercase',
          }}
        >
          Reiniciar terminal
        </button>
      </div>
    );
  }
}
