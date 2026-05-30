'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Topbar from '@/components/Topbar';
import Sidebar from '@/components/Sidebar';
import { getDossiers, deleteDossier } from '@/lib/scoutHistory';

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) +
    ' at ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export default function DossiersPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [dossiers, setDossiers] = useState([]);

  useEffect(() => {
    setMounted(true);
    setDossiers(getDossiers());
  }, []);

  const reload = () => setDossiers(getDossiers());

  const onDelete = (id) => {
    if (!window.confirm('Remove this dossier?')) return;
    deleteDossier(id);
    reload();
  };

  if (!mounted) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Topbar />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <Sidebar section="workspace" active="My dossiers" />
        <main style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
          <div className="eyebrow">Library</div>
          <div style={{ fontSize: 22, fontWeight: 600, marginTop: 2, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
            My dossiers
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 4, marginBottom: 20, maxWidth: 580 }}>
            Exported creator dossiers from past scout runs. Pin creators on the results page and export to save them here.
          </div>

          {dossiers.length === 0 ? (
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
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>
                No dossiers yet
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5, marginBottom: 18 }}>
                Run a scout, pin the creators you like, and export a PDF dossier. It will appear here for future reference.
              </div>
              <button
                onClick={() => router.push('/')}
                style={{
                  height: 32, padding: '0 16px', borderRadius: 6, border: 'none',
                  background: 'var(--accent)', color: 'var(--accent-ink)',
                  fontWeight: 500, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >Run a scout</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {dossiers.map(d => (
                <div key={d.id} style={{
                  border: '1px solid var(--line)', borderRadius: 8,
                  padding: '14px 18px', background: 'var(--surface)',
                  display: 'flex', alignItems: 'center', gap: 16,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>
                      {d.criteria?.category || 'Scout dossier'}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
                      {d.creatorCount} creators · {formatDate(d.ts)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {(d.creators || []).slice(0, 3).map((c, ci) => (
                      <span key={ci} style={{ fontSize: 11, color: 'var(--ink-2)' }}>
                        {c.channelName || 'Creator'}
                      </span>
                    ))}
                  </div>
                  <button
                    onClick={() => onDelete(d.id)}
                    style={{
                      height: 28, width: 28, borderRadius: 5, border: '1px solid var(--line)',
                      background: 'var(--surface)', fontSize: 12, color: 'var(--accent-warn)',
                      cursor: 'pointer', display: 'grid', placeItems: 'center',
                    }}
                  >✕</button>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
