import React from 'react';

/**
 * 렌더링 중 예외로 인한 흰 화면을 막고, 새로고침으로 복구할 수 있게 함
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-6 font-sans">
          <h1 className="text-xl font-bold text-amber-400 mb-3">잠시 문제가 생겼습니다</h1>
          <p className="text-sm text-slate-400 text-center max-w-md mb-6 break-keep">
            화면을 불러오는 중 오류가 났습니다. 아래 버튼으로 새로고침해 보세요. 계속되면 다른 브라우저나
            사생활 보호 모드 해제 후 다시 시도해 주세요.
          </p>
          {import.meta.env.DEV && this.state.error && (
            <pre className="text-left text-xs text-red-300/90 max-w-lg max-h-40 overflow-auto mb-6 p-3 rounded-lg bg-slate-950/80 border border-red-900/50 whitespace-pre-wrap break-all">
              {String(this.state.error?.message ?? this.state.error)}
              {this.state.error?.stack ? `\n\n${this.state.error.stack}` : ''}
            </pre>
          )}
          <div className="flex flex-wrap gap-3 justify-center">
            <button
              type="button"
              className="rounded-xl bg-slate-600 hover:bg-slate-500 px-5 py-3 font-bold"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              다시 시도
            </button>
            <button
              type="button"
              className="rounded-xl bg-blue-600 hover:bg-blue-500 px-5 py-3 font-bold"
              onClick={() => window.location.reload()}
            >
              새로고침
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
