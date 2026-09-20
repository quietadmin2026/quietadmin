import { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    // Surface the real error for debugging; the UI stays usable via reset.
    console.error('QuietAdmin encountered an error:', error);
  }

  handleReset = () => {
    try {
      Object.keys(window.localStorage)
        .filter((key) => key.startsWith('quietadmin:'))
        .forEach((key) => window.localStorage.removeItem(key));
    } catch {
      // Ignore storage failures; reload still gives a clean start.
    }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px', background: '#f7f4ee', color: '#25312c' }}>
        <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>Something went wrong</h1>
          <p style={{ marginTop: '0.75rem', color: '#69756c' }}>
            The locally saved data could not be loaded. Resetting clears the data stored in this browser and reloads the
            app. If Google Drive is connected, your synced copy is untouched.
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            style={{ marginTop: '1.25rem', borderRadius: '0.5rem', border: 'none', background: '#4c6053', color: '#fff', padding: '0.6rem 1.1rem', fontWeight: 600, cursor: 'pointer' }}
          >
            Reset local data and reload
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
