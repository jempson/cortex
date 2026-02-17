import React from 'react';
import { ERROR_BOUNDARY } from '../../../messages.js';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', color: 'var(--accent-orange)', background: 'var(--bg-base)', border: '1px solid var(--accent-orange)', margin: '10px' }}>
          <h3 style={{ margin: '0 0 10px 0' }}>{"⚠️ " + ERROR_BOUNDARY.title}</h3>
          <pre style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap', color: 'var(--accent-amber)' }}>
            {this.state.error?.toString()}
          </pre>
          <details style={{ marginTop: '10px', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            <summary>{ERROR_BOUNDARY.stackTrace}</summary>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.errorInfo?.componentStack}</pre>
          </details>
          <button
            onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
            style={{ marginTop: '10px', padding: '8px 16px', background: 'var(--accent-green)', border: 'none', color: 'var(--bg-base)', cursor: 'pointer' }}
          >
            {ERROR_BOUNDARY.retry}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
