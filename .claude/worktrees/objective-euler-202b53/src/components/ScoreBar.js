'use client';

import { getScoreColor } from '@/lib/scoring';

export default function ScoreBar({ label, score, maxScore = 100 }) {
  const percentage = Math.round((score / maxScore) * 100);
  const color = getScoreColor(score);

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-24 flex-shrink-0 truncate">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
        <div
          className="h-full rounded-full animate-progress"
          style={{ width: `${percentage}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-semibold w-8 text-right" style={{ color }}>
        {score}
      </span>
    </div>
  );
}
