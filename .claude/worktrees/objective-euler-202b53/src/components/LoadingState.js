'use client';

import { useState, useEffect } from 'react';

const TIPS = [
  'Parasocial Depth measures how personally connected fans feel to the creator.',
  'Comments in regional languages often signal stronger, more loyal audience communities.',
  'Engagement Quality evaluates comment depth, not just likes — thoughtful replies score higher.',
  'Growth Potential assesses whether a creator is on an upward trajectory — the best time to partner is before they peak.',
  'Fraud signals check for bot-like comment patterns, engagement ratio anomalies, and fake subscriber signs.',
  'Brand Fit scoring considers whether the creator\'s audience overlaps with the target brand persona.',
  'The geography gate filters out non-India creators using YouTube country data and comment language heuristics.',
];

export default function LoadingState({ stage, current, total, channelName, analysisStartTime, onCancel, platform }) {
  const [tipIndex, setTipIndex] = useState(0);
  const [tipFade, setTipFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setTipFade(false);
      setTimeout(() => {
        setTipIndex((prev) => (prev + 1) % TIPS.length);
        setTipFade(true);
      }, 300);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  const platformLabel = platform === 'instagram' ? 'Instagram' : platform === 'both' ? 'YouTube & Instagram' : 'YouTube';
  const creatorWord = platform === 'instagram' ? 'creator' : platform === 'both' ? 'creator' : 'channel';

  const stages = [
    { key: 'searching', label: 'Discovering Creators', desc: `Searching ${platformLabel} for matching creators` },
    { key: 'analyzing', label: 'AI Analysis', desc: `Claude analyzes comments and scores each ${creatorWord}` },
    { key: 'scoring', label: 'Final Ranking', desc: 'Generating PCF scores and recommendations' },
  ];

  const currentIndex = stages.findIndex((s) => s.key === stage);

  // Time estimate for analysis stage
  let timeEstimate = null;
  if (stage === 'analyzing' && current > 1 && total > 0 && analysisStartTime) {
    const elapsed = Date.now() - analysisStartTime;
    const avgPerItem = elapsed / current;
    const remaining = (total - current) * avgPerItem;
    const remainingSec = Math.ceil(remaining / 1000);
    if (remainingSec > 60) {
      const mins = Math.ceil(remainingSec / 60);
      timeEstimate = mins === 1 ? '~1 min remaining' : `~${mins} min remaining`;
    } else if (remainingSec > 10) {
      timeEstimate = `~${remainingSec}s remaining`;
    } else {
      timeEstimate = 'Almost done...';
    }
  }

  // Overall progress: search=10%, analysis=10-90% proportional, scoring=95%
  const overallProgress =
    stage === 'searching' ? 10 :
    stage === 'scoring' ? 95 :
    total > 0 ? Math.round(10 + (current / total) * 80) : 15;

  return (
    <div className="max-w-lg mx-auto px-4 py-16">
      {/* Circular Progress Header */}
      <div className="text-center mb-10">
        <div className="relative inline-flex items-center justify-center w-20 h-20 mb-5">
          <svg className="absolute inset-0 w-20 h-20 -rotate-90" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="34" fill="none" stroke="#f0f0f0" strokeWidth="4" />
            <circle
              cx="40" cy="40" r="34" fill="none" stroke="#5BC8FF" strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${overallProgress * 2.136} 213.6`}
              className="transition-all duration-700"
            />
          </svg>
          <span className="text-lg font-bold text-gray-700">{overallProgress}%</span>
        </div>
        <h3 className="text-xl font-bold text-gray-800 mb-1">Scouting in Progress</h3>
        <p className="text-gray-500 text-sm">
          {stage === 'searching' && 'Searching for matching creators...'}
          {stage === 'analyzing' && total > 0 && `Analyzing ${creatorWord} ${current} of ${total}`}
          {stage === 'analyzing' && total === 0 && 'Preparing AI analysis...'}
          {stage === 'scoring' && 'Finalizing scores and rankings...'}
        </p>
        {timeEstimate && (
          <p className="text-xs text-gray-400 mt-1">{timeEstimate}</p>
        )}
      </div>

      {/* Progress Steps */}
      <div className="space-y-3 mb-8">
        {stages.map((s, i) => {
          const isComplete = i < currentIndex;
          const isActive = i === currentIndex;
          return (
            <div
              key={s.key}
              className={`flex items-start gap-4 p-3 rounded-xl transition-all duration-300 ${
                isActive ? 'bg-accent/5 border border-accent/20' :
                isComplete ? 'bg-gray-50 border border-transparent' :
                'border border-transparent'
              }`}
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 transition-all ${
                isComplete ? 'bg-accent text-white' :
                isActive ? 'bg-accent text-white' :
                'bg-gray-200 text-gray-400'
              }`}>
                {isComplete ? (
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <span>{i + 1}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${
                  isActive || isComplete ? 'text-gray-800' : 'text-gray-400'
                }`}>
                  {s.label}
                </p>
                <p className={`text-xs mt-0.5 ${isActive ? 'text-gray-500' : 'text-gray-400'}`}>
                  {s.desc}
                </p>
                {isActive && channelName && (
                  <p className="text-xs text-accent font-medium mt-1.5 truncate">
                    &rarr; {channelName}
                  </p>
                )}
              </div>
              {isComplete && (
                <span className="text-[10px] text-accent font-semibold uppercase tracking-wider mt-1">Done</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Cancel Button */}
      {onCancel && (
        <div className="text-center mb-6">
          <button
            onClick={onCancel}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-500 hover:text-danger border border-gray-200 hover:border-danger/30 rounded-lg transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Cancel Scouting
          </button>
        </div>
      )}

      {/* Progress Bar */}
      <div className="bg-gray-100 rounded-full h-1.5 overflow-hidden mb-10">
        <div
          className="bg-gradient-to-r from-godrej-sky to-godrej-blue h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${overallProgress}%` }}
        />
      </div>

      {/* Rotating PCF Tip */}
      <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-godrej-sky/10 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-godrej-sky" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">About the PCF Framework</p>
            <p className={`text-sm text-gray-600 leading-relaxed transition-opacity duration-300 ${tipFade ? 'opacity-100' : 'opacity-0'}`}>
              {TIPS[tipIndex]}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
