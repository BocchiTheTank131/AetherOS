// AetherOS - Application Error Boundary Component
// Isolates app runtime rendering failures, preventing them from crashing the desktop compositor.
import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { systemLogger } from '../../core/logger';
import { AlertTriangle, RefreshCw, XCircle, ChevronDown, ChevronRight } from 'lucide-react';

interface Props {
  appId: string;
  windowId: string;
  onClose: () => void;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

export class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    systemLogger.error('app', `Application '${this.props.appId}' encountered an unhandled error: ${error.message}`, {
      windowId: this.props.windowId,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  handleRestart = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-6 text-center select-none bg-[#0f141f] text-gray-200 font-sans">
          <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 mb-3 shadow-lg">
            <AlertTriangle className="w-6 h-6" />
          </div>

          <h2 className="text-sm font-bold text-white mb-1">
            Application Error
          </h2>
          <p className="text-xs text-gray-400 max-w-sm mb-4 leading-relaxed">
            The application <span className="text-cyan-400 font-semibold">{this.props.appId}</span> crashed unexpectedly. Other system operations continue unaffected.
          </p>

          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={this.handleRestart}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-black shadow-md transition-all active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Restart Application</span>
            </button>
            <button
              onClick={this.props.onClose}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Close Window</span>
            </button>
          </div>

          {/* Technical Details Accordion */}
          <div className="w-full max-w-md text-left">
            <button
              onClick={() => this.setState((prev) => ({ showDetails: !prev.showDetails }))}
              className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-200 transition-colors"
            >
              {this.state.showDetails ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <span>Technical Details</span>
            </button>

            {this.state.showDetails && (
              <div className="mt-2 p-3 rounded-lg bg-black/60 border border-gray-800 font-mono text-[11px] text-red-300 max-h-36 overflow-y-auto selectable-text">
                <div className="font-bold text-red-400 mb-1">{this.state.error?.name}: {this.state.error?.message}</div>
                {this.state.error?.stack && (
                  <pre className="text-[10px] text-gray-400 whitespace-pre-wrap">{this.state.error.stack}</pre>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
