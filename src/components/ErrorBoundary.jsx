import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`[TaskFlowCo ErrorBoundary - ${this.props.moduleName || 'Module'}]:`, error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '48px 24px',
            margin: '20px auto',
            maxWidth: '520px',
            borderRadius: '16px',
            background: 'var(--tf-surface, #ffffff)',
            border: '1px solid var(--tf-border, rgba(47, 107, 255, 0.12))',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.04)',
            textAlign: 'center',
            fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.1)',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px',
            }}
          >
            <AlertTriangle size={28} />
          </div>

          <h3
            style={{
              fontSize: '18px',
              fontWeight: 700,
              color: 'var(--tf-text, #0e2a47)',
              margin: '0 0 8px 0',
            }}
          >
            {this.props.moduleName ? `${this.props.moduleName} Interrupted` : 'Module Issue Encountered'}
          </h3>

          <p
            style={{
              fontSize: '14px',
              color: 'var(--tf-text-sub, #64748b)',
              margin: '0 0 24px 0',
              lineHeight: 1.5,
            }}
          >
            A minor issue occurred while rendering this section. Your data is safe. Click below to reload this view.
          </p>

          <button
            onClick={this.handleReset}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #2F6BFF, #14C7C0)',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '14px',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(47, 107, 255, 0.25)',
              transition: 'all 0.2s ease',
            }}
          >
            <RefreshCw size={16} />
            Reload {this.props.moduleName || 'View'}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
