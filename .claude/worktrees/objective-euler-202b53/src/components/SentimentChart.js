'use client';

export default function SentimentChart({ positive, negative, neutral }) {
  const total = positive + negative + neutral;
  if (total === 0) return null;

  const segments = [
    { label: 'Positive', value: positive, color: '#5BC8FF' },
    { label: 'Neutral', value: neutral, color: '#BABABA' },
    { label: 'Negative', value: negative, color: '#e17055' },
  ];

  return (
    <div>
      <div className="flex rounded-full h-3 overflow-hidden bg-gray-100">
        {segments.map((seg) =>
          seg.value > 0 ? (
            <div
              key={seg.label}
              className="h-full transition-all duration-500"
              style={{
                width: `${seg.value}%`,
                backgroundColor: seg.color,
              }}
            />
          ) : null
        )}
      </div>
      <div className="flex justify-between mt-2">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-1.5">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: seg.color }}
            />
            <span className="text-xs text-gray-500">
              {seg.label} {seg.value}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
