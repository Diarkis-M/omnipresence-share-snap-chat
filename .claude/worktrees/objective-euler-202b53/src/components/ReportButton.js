'use client';

import { useState } from 'react';

export default function ReportButton({ results, shortlistedResults = [], searchCriteria }) {
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async (data, label) => {
    setGenerating(true);
    try {
      // Dynamic import to keep jsPDF out of the main bundle
      const { generateReport } = await import('@/lib/reportGenerator');
      generateReport(data, searchCriteria);
    } catch (err) {
      console.error('PDF generation failed:', err);
      alert('Failed to generate PDF report. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => handleGenerate(
          shortlistedResults.length > 0 ? shortlistedResults : results,
          shortlistedResults.length > 0 ? 'shortlisted' : 'all'
        )}
        disabled={generating}
        className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-godrej-sky to-godrej-blue rounded-lg text-sm font-medium text-white hover:opacity-90 transition-all shadow-lg shadow-godrej-sky/20 disabled:opacity-50 disabled:cursor-wait"
      >
        {generating ? (
          <>
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Generating...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            {shortlistedResults.length > 0
              ? `PDF Report (${shortlistedResults.length} shortlisted)`
              : 'PDF Report'}
          </>
        )}
      </button>
    </div>
  );
}
