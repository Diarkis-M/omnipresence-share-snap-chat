'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Topbar from '@/components/Topbar';
import Sidebar from '@/components/Sidebar';
import { getScoutHistory, groupByDate, deleteScout } from '@/lib/scoutHistory';

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function shortCat(cat) {
  if (!cat) return 'Search';
  return cat.split('&')[0].trim();
}

export default function HistoryPage() {
  return <HistoryContent />;
}

const PLATFORM_OPTIONS = ['All', 'YouTube', 'Instagram', 'Both'];
const SUBSCRIBER_TIER_OPTIONS = [
  { value: 'All', label: 'All' },
  { value: '1000-10000', label: 'Nano (1K–10K)' },
  { value: '10000-100000', label: 'Micro (10K–100K)' },
  { value: '100000-500000', label: 'Mid (100K–500K)' },
  { value: '500000-10000000', label: 'Macro (500K+)' },
];
const CATEGORY_OPTIONS = [
  'All',
  'Beard Oil & Beard Care',
  'Face Wash & Face Care',
  'Hair Styling & Hair Care',
  "Men's Grooming (General)",
  'Skincare & Serums',
  'Deodorants & Perfumes',
  'Home Care & Air Fresheners',
];

function FilterChip({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '4px 10px', borderRadius: 5, fontSize: 12, fontWeight: active ? 500 : 400,
        border: '1px solid ' + (active ? 'var(--ink)' : 'var(--line)'),
        background: active ? 'var(--ink)' : 'var(--surface)',
        color: active ? 'var(--bg)' : 'var(--ink-2)',
        cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
      }}
    >{label}</button>
  );
}

function FilterBar({ platformFilter, setPlatformFilter, tierFilter, setTierFilter, categoryFilter, setCategoryFilter, showCategoryFilter }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10,
      padding: '14px 0', marginBottom: 16, borderBottom: '1px solid var(--line)',
    }}>
      {/* Platform */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontSize: 11, fontWeight: 500, color: 'var(--muted)', fontFamily: 'var(--font-mono)',
          textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 72,
        }}>Platform</span>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {PLATFORM_OPTIONS.map(opt => (
            <FilterChip
              key={opt}
              label={opt}
              active={platformFilter === opt}
              onClick={() => setPlatformFilter(opt)}
            />
          ))}
        </div>
      </div>

      {/* Subscriber tier */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontSize: 11, fontWeight: 500, color: 'var(--muted)', fontFamily: 'var(--font-mono)',
          textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 72,
        }}>Tier</span>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {SUBSCRIBER_TIER_OPTIONS.map(opt => (
            <FilterChip
              key={opt.value}
              label={opt.label}
              active={tierFilter === opt.value}
              onClick={() => setTierFilter(opt.value)}
            />
          ))}
        </div>
      </div>

      {/* Category — only show when not already filtered by URL param */}
      {showCategoryFilter && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 11, fontWeight: 500, color: 'var(--muted)', fontFamily: 'var(--font-mono)',
            textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 72,
          }}>Category</span>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {CATEGORY_OPTIONS.map(opt => (
              <FilterChip
                key={opt}
                label={opt === 'All' ? 'All' : shortCat(opt)}
                active={categoryFilter === opt}
                onClick={() => setCategoryFilter(opt)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HistoryContent() {
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [history, setHistory] = useState([]);

  // Filter state
  const [platformFilter, setPlatformFilter] = useState('All');
  const [tierFilter, setTierFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');

  useEffect(() => {
    setMounted(true);
    setHistory(getScoutHistory());
  }, []);

  const reload = () => setHistory(getScoutHistory());

  const onView = (scout) => {
    // Load this scout's results into localStorage and activate the results view
    try {
      localStorage.setItem('scoutResults', JSON.stringify(scout.results));
      localStorage.setItem('scoutSearchCriteria', JSON.stringify(scout.criteria));
      sessionStorage.setItem('scoutResultsActive', 'true');
    } catch {}
    // Use hard navigation to avoid stale unmount cleanups from a cached results page
    window.location.href = '/results';
  };

  const onDelete = (id) => {
    if (!window.confirm('Delete this scout run from history?')) return;
    deleteScout(id);
    reload();
  };

  if (!mounted) return null;

  // Apply filters
  let filtered = history;

  // Platform filter
  if (platformFilter !== 'All') {
    const pVal = platformFilter.toLowerCase();
    filtered = filtered.filter(s => s.criteria?.platform === pVal);
  }

  // Subscriber tier filter
  if (tierFilter !== 'All') {
    filtered = filtered.filter(s => s.criteria?.subscriberRange === tierFilter);
  }

  // Category filter
  if (categoryFilter !== 'All') {
    filtered = filtered.filter(s => s.criteria?.category === categoryFilter);
  }

  const { groups, order } = groupByDate(filtered);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Topbar />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <Sidebar section="workspace" active="Recent scouts" />
        <main style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
          <div className="eyebrow">History</div>
          <div style={{ fontSize: 22, fontWeight: 600, marginTop: 2, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
            Recent scouts
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 4, marginBottom: 20, maxWidth: 580 }}>
            {filtered.length} scout run{filtered.length !== 1 ? 's' : ''} saved.
            Results are stored in your browser.
          </div>

          <FilterBar
            platformFilter={platformFilter}
            setPlatformFilter={setPlatformFilter}
            tierFilter={tierFilter}
            setTierFilter={setTierFilter}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            showCategoryFilter={true}
          />

          {filtered.length === 0 && (
            <EmptyState
              title="No scouts yet"
              sub="Run your first scout from the landing page. Results will appear here organized by date."
              action="New scout"
              onAction={() => router.push('/')}
            />
          )}

          {order.map(label => (
            <div key={label} style={{ marginBottom: 24 }}>
              <div style={{
                fontSize: 11, fontWeight: 500, color: 'var(--muted)', textTransform: 'uppercase',
                letterSpacing: '0.06em', fontFamily: 'var(--font-mono)',
                padding: '0 0 8px', borderBottom: '1px solid var(--line)',
              }}>{label}</div>

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {groups[label].map(scout => (
                  <div
                    key={scout.id}
                    style={{
                      display: 'grid', gridTemplateColumns: '1fr auto auto auto',
                      alignItems: 'center', gap: 16,
                      padding: '12px 0', borderBottom: '1px solid var(--line-2)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>
                        {shortCat(scout.criteria?.category)}
                        <span style={{ color: 'var(--ink-2)', fontWeight: 400, marginLeft: 8 }}>
                          {scout.criteria?.platform === 'youtube' ? 'YouTube' :
                           scout.criteria?.platform === 'instagram' ? 'Instagram' : 'YouTube + Instagram'}
                        </span>
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
                        {scout.resultCount} creators · {(scout.criteria?.languages || []).slice(0, 3).join(', ')} · {formatTime(scout.ts)}
                      </div>
                    </div>

                    <span style={{
                      padding: '3px 8px', borderRadius: 4, fontSize: 11,
                      fontWeight: 500, fontVariantNumeric: 'tabular-nums',
                      background: 'var(--surface-2)', color: 'var(--ink-2)',
                      fontFamily: 'var(--font-mono)',
                    }}>
                      {scout.resultCount} results
                    </span>

                    <button
                      onClick={() => onView(scout)}
                      style={{
                        height: 28, padding: '0 12px', borderRadius: 5, border: '1px solid var(--line)',
                        background: 'var(--surface)', fontSize: 12, color: 'var(--ink)',
                        cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
                      }}
                    >View results</button>

                    <button
                      onClick={() => onDelete(scout.id)}
                      style={{
                        height: 28, width: 28, borderRadius: 5, border: '1px solid var(--line)',
                        background: 'var(--surface)', fontSize: 12, color: 'var(--accent-warn)',
                        cursor: 'pointer', display: 'grid', placeItems: 'center',
                      }}
                    >✕</button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </main>
      </div>
    </div>
  );
}

function EmptyState({ title, sub, action, onAction }) {
  return (
    <div style={{
      border: '1px solid var(--line)', borderRadius: 10,
      padding: '40px 32px', textAlign: 'center', maxWidth: 420, margin: '20px auto',
      background: 'var(--surface)',
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10, background: 'var(--surface-2)',
        display: 'grid', placeItems: 'center', margin: '0 auto 14px',
        fontSize: 18, color: 'var(--muted)',
      }}>◇</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5, marginBottom: 18 }}>{sub}</div>
      {action && (
        <button
          onClick={onAction}
          style={{
            height: 32, padding: '0 16px', borderRadius: 6, border: 'none',
            background: 'var(--accent)', color: 'var(--accent-ink)',
            fontWeight: 500, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >{action}</button>
      )}
    </div>
  );
}
