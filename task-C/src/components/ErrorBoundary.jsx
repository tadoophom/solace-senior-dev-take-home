import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      errorId: null
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details for debugging
    const errorId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    
    console.error('🚨 Error Boundary Caught Error:', {
      errorId,
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString()
    });

    this.setState({
      error,
      errorInfo,
      errorId
    });

    // Report to error tracking service in production
    if (process.env.NODE_ENV === 'production') {
      // Example: Sentry, LogRocket, etc.
      // errorTrackingService.captureException(error, { extra: errorInfo });
    }
  }

  handleRetry = () => {
    this.setState({ 
      hasError: false, 
      error: null, 
      errorInfo: null,
      errorId: null
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const { error, errorId } = this.state;
      const { fallback: Fallback, minimal = false } = this.props;

      // Use custom fallback if provided
      if (Fallback) {
        return <Fallback error={error} retry={this.handleRetry} />;
      }

      // Minimal error display for non-critical components
      if (minimal) {
        return (
          <div className="error-boundary-minimal">
            <span className="error-icon">⚠️</span>
            <span className="error-text">Component unavailable</span>
            <button onClick={this.handleRetry} className="retry-btn">
              Retry
            </button>
          </div>
        );
      }

      // Full error boundary UI
      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <div className="error-icon">🚨</div>
            <h2>Something went wrong</h2>
            <p className="error-message">
              We encountered an unexpected error. This has been logged and will be investigated.
            </p>
            
            {process.env.NODE_ENV === 'development' && (
              <details className="error-details">
                <summary>Error Details (Development)</summary>
                <div className="error-info">
                  <p><strong>Error ID:</strong> {errorId}</p>
                  <p><strong>Error:</strong> {error?.message}</p>
                  <pre className="error-stack">
                    {error?.stack}
                  </pre>
                </div>
              </details>
            )}

            <div className="error-actions">
              <button onClick={this.handleRetry} className="btn primary">
                Try Again
              </button>
              <button onClick={this.handleReload} className="btn secondary">
                Reload Page
              </button>
            </div>

            <div className="error-help">
              <p>If this problem persists:</p>
              <ul>
                <li>Check your internet connection</li>
                <li>Try refreshing the page</li>
                <li>Clear your browser cache</li>
                <li>Contact support with Error ID: {errorId}</li>
              </ul>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary; 