'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getScoutHistory, getDossiers, getCategoryCreatorCounts } from '@/lib/scoutHistory';

// Map full category → sidebar label
const CAT_TO_SIDEBAR = {
  'Beard Oil & Beard Care': 'Beard care',
  'Face Wash & Face Care': 'Face care',
  'Hair Styling & Hair Care': 'Hair',
  "Men's Grooming (General)": 'Grooming',
  'Skincare & Serums': 'Skincare',
  'Deodorants & Perfumes': 'Fragrance',
  'Home Care & Air Fresheners': 'Home care',
};

const SIDEBAR_TO_CAT = Object.fromEntries(
  Object.entries(CAT_TO_SIDEBAR).map(([k, v]) => [v, k])
);

const CATEGORY_LABELS = ['Beard care', 'Skincare', 'Hair', 'Fragrance', 'Home care', 'Face care', 'Grooming'];

const SETTINGS_GROUPS = [
  {
    head: 'Settings',
    items: [
      { label: 'Appearance', icon: '>', key: 'Appearance', path: '/settings' },
      { label: 'Gates & filters', icon: '>', key: 'Gates & filters', path: '/settings' },
      { label: 'Feedback learnings', icon: '>', key: 'Feedback learnings', path: '/settings' },
    ],
  },
];

export default function Sidebar({ section = 'workspace', active = 'New scout' }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [historyCount, setHistoryCount] = useState(0);
  const [dossierCount, setDossierCount] = useState(0);
  const [catCounts, setCatCounts] = useState({});

  useEffect(() => {
    setMounted(true);
    setHistoryCount(getScoutHistory().length);
    setDossierCount(getDossiers().length);
    setCatCounts(getCategoryCreatorCounts());
  }, []);

  if (section === 'settings') {
    return (
      <aside style={sidebarStyle}>
        {SETTINGS_GROUPS.map(g => (
          <div key={g.head}>
            <SectionHead>{g.head}</SectionHead>
            {g.items.map(item => (
              <SidebarItem
                key={item.label}
                label={item.label}
                icon={item.icon}
                active={item.key === active}
                onClick={() => item.path && router.push(item.path)}
              />
            ))}
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <Footer />
      </aside>
    );
  }

  return (
    <aside style={sidebarStyle}>
      {/* Workspace */}
      <SectionHead>Workspace</SectionHead>
      <SidebarItem label="New scout" icon="+" active={active === 'New scout'} onClick={() => router.push('/')} />
      <SidebarItem label="Recent scouts" count={mounted ? historyCount || null : null} active={active === 'Recent scouts'} onClick={() => router.push('/history')} />
      <SidebarItem label="My dossiers" count={mounted ? dossierCount || null : null} active={active === 'My dossiers'} onClick={() => router.push('/dossiers')} />

      {/* Categories */}
      <SectionHead style={{ marginTop: 4 }}>Categories</SectionHead>
      {CATEGORY_LABELS.map(label => {
        const fullCat = SIDEBAR_TO_CAT[label];
        const count = fullCat ? (catCounts[fullCat] || 0) : 0;
        return (
          <SidebarItem
            key={label}
            label={label}
            count={mounted && count > 0 ? count : null}
            active={active === label}
            onClick={() => router.push('/category?cat=' + encodeURIComponent(fullCat))}
          />
        );
      })}

      <div style={{ flex: 1 }} />
      <Footer />
    </aside>
  );
}

const sidebarStyle = {
  width: 220, borderRight: '1px solid var(--line)', background: 'var(--surface)',
  padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 2,
  overflow: 'auto', flexShrink: 0,
};

function SectionHead({ children, style }) {
  return (
    <div style={{
      fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)',
      textTransform: 'uppercase', letterSpacing: '0.08em',
      padding: '10px 8px 6px', fontWeight: 500,
      ...style,
    }}>{children}</div>
  );
}

function SidebarItem({ label, icon, count, active, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '5px 8px', borderRadius: 5, fontSize: 12.5,
        cursor: onClick ? 'pointer' : 'default',
        color: active ? 'var(--ink)' : 'var(--ink-2)',
        background: active ? 'var(--surface-2)' : 'transparent',
        fontWeight: active ? 500 : 400,
        display: 'flex', alignItems: 'center', gap: 8,
      }}
    >
      <span style={{
        width: 14,
        color: icon === '+' ? 'var(--accent)' : 'var(--faint)',
        fontFamily: 'var(--font-mono)',
      }}>
        {icon === '+' ? '◆' : icon === '>' ? '›' : '—'}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
      {count != null && (
        <span style={{
          fontSize: 10.5, color: 'var(--faint)',
          fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
        }}>{count}</span>
      )}
    </div>
  );
}

function Footer() {
  return (
    <div style={{
      padding: '10px 8px', fontSize: 11, color: 'var(--faint)',
      fontFamily: 'var(--font-mono)', letterSpacing: '0.04em',
    }}>v3.0 · PCF + Geo gate</div>
  );
}
