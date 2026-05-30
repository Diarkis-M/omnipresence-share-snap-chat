'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { isResultsActive, isRunActive, clearResultsActive } from '@/lib/scoutHistory';

const TABS = [
  { id: 'scout',    label: 'Scout',    path: '/' },
  { id: 'run',      label: 'Run',      path: '/processing' },
  { id: 'results',  label: 'Results',  path: '/results' },
  { id: 'settings', label: 'Settings', path: '/settings' },
];

export default function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const active = TABS.find(t => t.path === pathname)?.id
    || (pathname?.startsWith('/settings') ? 'settings' : 'scout');

  // Determine which tabs are enabled
  const isTabEnabled = (tab) => {
    if (!mounted) return tab.id === 'scout' || tab.id === 'settings';
    if (tab.id === 'scout' || tab.id === 'settings') return true;
    if (tab.id === 'run') return pathname === '/processing' || isRunActive();
    if (tab.id === 'results') return pathname === '/results' || isResultsActive();
    return true;
  };

  return (
    <div style={{
      height: 46, background: 'var(--surface)', borderBottom: '1px solid var(--line)',
      display: 'flex', alignItems: 'center', padding: '0 18px', gap: 18, flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          width: 8, height: 8, borderRadius: 2,
          background: 'var(--accent)', display: 'inline-block',
        }} />
        <span style={{ fontWeight: 600, fontSize: 14, letterSpacing: '-0.01em', color: 'var(--ink)' }}>
          Muuchstac Scout
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10.5,
          color: 'var(--faint)', letterSpacing: '0.06em',
        }}>
          v2.4 · GCPL
        </span>
      </div>

      <div style={{ display: 'flex', gap: 2, marginLeft: 14 }}>
        {TABS.map(t => {
          const enabled = isTabEnabled(t);
          return (
            <button
              key={t.id}
              onClick={() => {
                if (!enabled) return;
                // Clear active-results flag when navigating away from results
                if (t.id !== 'results') clearResultsActive();
                router.push(t.path);
              }}
              style={{
                padding: '6px 12px',
                background: active === t.id ? 'var(--surface-2)' : 'transparent',
                border: 'none', borderRadius: 5,
                color: !enabled ? 'var(--faint)' : active === t.id ? 'var(--ink)' : 'var(--ink-2)',
                fontSize: 12.5,
                fontWeight: active === t.id ? 500 : 400,
                cursor: enabled ? 'pointer' : 'default',
                fontFamily: 'inherit',
                opacity: enabled ? 1 : 0.5,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />

      <div style={{
        width: 28, height: 28, borderRadius: 6,
        background: 'var(--ink)', color: 'var(--bg)',
        display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 600,
      }}>
        RM
      </div>
    </div>
  );
}
