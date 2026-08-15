'use client';

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0B0E14] flex flex-col items-center justify-center text-white p-6 font-mono">
          <div className="bg-[#10131a] border border-red-500/30 rounded-2xl w-full max-w-2xl p-8 shadow-[0_0_50px_rgba(239,68,68,0.15)] space-y-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-600 via-orange-500 to-red-600"></div>
            
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500 animate-pulse">
                <AlertTriangle className="w-10 h-10" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-red-500 mb-2">SYSTEM FAILURE</h1>
                <p className="text-[#bbc9cf] text-sm">
                  The application encountered an unexpected runtime exception.
                </p>
              </div>
            </div>

            <div className="bg-black/50 p-4 rounded-lg border border-red-500/20 overflow-x-auto text-xs text-red-400 font-mono text-left max-h-48 overflow-y-auto">
              <p className="font-bold mb-2">{this.state.error && this.state.error.toString()}</p>
              <pre className="whitespace-pre-wrap">{this.state.errorInfo && this.state.errorInfo.componentStack}</pre>
            </div>

            <button 
              onClick={this.handleRetry}
              className="w-full py-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/50 rounded-xl text-red-500 font-bold tracking-widest hover:shadow-[0_0_30px_rgba(239,68,68,0.3)] transition-all flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-5 h-5" /> REBOOT SYSTEM
            </button>
          </div>
        </div>
      );
    }

    return this.props.children; 
  }
}

export default ErrorBoundary;
