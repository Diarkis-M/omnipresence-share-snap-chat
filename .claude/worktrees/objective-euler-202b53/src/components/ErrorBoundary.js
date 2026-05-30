'use client';

import { Component } from 'react';

/**
 * React Error Boundary — catches rendering crashes in child components.
 * Prevents one broken InfluencerCard from taking down the entire results page.
 *
 * Usage:
 *   <ErrorBoundary fallback={<p>Something went wrong</p>}>
 *     <InfluencerCard ... />
 *   </ErrorBoundary>
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // If a custom fallback is provided, use it
      if (this.props.fallback) {
        return this.props.fallback;
      }
      // Default fallback UI
      return (
        <div className="bg-white rounded-xl shadow-sm border border-red-100 p-5">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">This card failed to render</p>
              <p className="text-xs text-gray-400 mt-0.5">The rest of your results are unaffected.</p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
