import React, { useState, useEffect, useRef } from 'react';
import { Search, LayoutDashboard, Briefcase, FileText, UserPlus, PlusCircle, Clock, BarChart2, Shield, X, ArrowRight, CornerDownLeft } from 'lucide-react';

export function CommandPalette({ isOpen, onClose, onNavigate, clients = [], workTypeConfigs = [], cu = {} }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  // Focus input when palette opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Handle global keyboard shortcuts (Ctrl+K or Cmd+K)
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else onNavigate({ type: 'open_palette' });
      }
      if (isOpen && e.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, onNavigate]);

  if (!isOpen) return null;

  // Navigation Items
  const navItems = [
    { id: 'diary', title: 'Your Diary / Worklist', icon: LayoutDashboard, category: 'Navigation', action: () => onNavigate({ type: 'mod', mod: 'diary', tab: 'home' }) },
    { id: 'worksheets', title: 'Worksheets Matrix', icon: Briefcase, category: 'Navigation', action: () => onNavigate({ type: 'mod', mod: 'workzone', tab: 'worksheets' }) },
    { id: 'erp_board', title: 'ERP Board (Kanban)', icon: Briefcase, category: 'Navigation', action: () => onNavigate({ type: 'mod', mod: 'workzone', tab: 'board' }) },
    { id: 'itr_desk', title: 'ITR Desk', icon: FileText, category: 'Navigation', action: () => onNavigate({ type: 'mod', mod: 'workzone', tab: 'itr' }) },
    { id: 'analytics', title: 'Analytics & Reports', icon: BarChart2, category: 'Navigation', action: () => onNavigate({ type: 'mod', mod: 'analytics' }) },
  ];

  // Quick Action Items
  const actionItems = [
    { id: 'new_client', title: 'Add New Client', icon: UserPlus, category: 'Actions', action: () => onNavigate({ type: 'mod', mod: 'library', tab: 'clients', action: 'new' }) },
    { id: 'log_time', title: 'Log Attendance / Hours', icon: Clock, category: 'Actions', action: () => onNavigate({ type: 'mod', mod: 'team', tab: 'attendance' }) },
  ];

  // Client Search Items
  const matchingClients = (clients || [])
    .filter(c => {
      const q = query.toLowerCase().trim();
      if (!q) return false;
      return (
        (c.display_name && c.display_name.toLowerCase().includes(q)) ||
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.pan && c.pan.toLowerCase().includes(q))
      );
    })
    .slice(0, 5)
    .map(c => ({
      id: `client_${c.id}`,
      title: c.display_name || c.name,
      subtitle: c.pan ? `PAN: ${c.pan}` : 'Client Master',
      icon: UserPlus,
      category: 'Clients',
      action: () => onNavigate({ type: 'client', client: c }),
    }));

  // Combine and filter results
  const allResults = [
    ...matchingClients,
    ...navItems.filter(i => !query || i.title.toLowerCase().includes(query.toLowerCase())),
    ...actionItems.filter(i => !query || i.title.toLowerCase().includes(query.toLowerCase())),
  ];

  const handleKeyDownInMenu = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % Math.max(allResults.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + allResults.length) % Math.max(allResults.length, 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (allResults[selectedIndex]) {
        allResults[selectedIndex].action();
        onClose();
      }
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
        background: 'rgba(14, 42, 71, 0.45)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '620px',
          background: 'var(--tf-surface, #ffffff)',
          borderRadius: '16px',
          border: '1px solid var(--tf-border, rgba(47, 107, 255, 0.15))',
          boxShadow: '0 20px 50px rgba(14, 42, 71, 0.25)',
          overflow: 'hidden',
          animation: 'paletteSlide 0.15s ease-out',
        }}
      >
        {/* Search Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '16px 20px',
            borderBottom: '1px solid var(--tf-border, #e2e8f0)',
          }}
        >
          <Search size={20} color="#2F6BFF" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDownInMenu}
            placeholder="Type a command, search clients by name or PAN..."
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: '15px',
              fontWeight: 500,
              color: 'var(--tf-text, #0e2a47)',
              fontFamily: 'inherit',
            }}
          />
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#64748b',
              background: 'var(--tf-bg, #f1f5f9)',
              padding: '3px 7px',
              borderRadius: '6px',
              border: '1px solid var(--tf-border, #cbd5e1)',
            }}
          >
            ESC
          </span>
        </div>

        {/* Results Stream */}
        <div style={{ maxHeight: '360px', overflowY: 'auto', padding: '8px 0' }}>
          {allResults.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>
              No commands or clients matching "{query}"
            </div>
          ) : (
            allResults.map((item, index) => {
              const isSelected = index === selectedIndex;
              const Icon = item.icon;
              return (
                <div
                  key={item.id}
                  onClick={() => { item.action(); onClose(); }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 20px',
                    cursor: 'pointer',
                    background: isSelected ? 'linear-gradient(90deg, rgba(47, 107, 255, 0.08), transparent)' : 'transparent',
                    borderLeft: isSelected ? '3px solid #2F6BFF' : '3px solid transparent',
                    transition: 'all 0.1s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        background: isSelected ? '#2F6BFF' : 'rgba(47, 107, 255, 0.08)',
                        color: isSelected ? '#ffffff' : '#2F6BFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <Icon size={16} />
                    </div>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--tf-text, #0e2a47)' }}>
                        {item.title}
                      </div>
                      {item.subtitle && (
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>
                      {item.category}
                    </span>
                    {isSelected && <CornerDownLeft size={14} color="#2F6BFF" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts helper */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 20px',
            background: 'var(--tf-bg, #f8fafc)',
            borderTop: '1px solid var(--tf-border, #e2e8f0)',
            fontSize: '12px',
            color: '#64748b',
          }}
        >
          <div style={{ display: 'flex', gap: '12px' }}>
            <span><strong style={{ color: '#0e2a47' }}>↑↓</strong> Navigate</span>
            <span><strong style={{ color: '#0e2a47' }}>↵</strong> Select</span>
            <span><strong style={{ color: '#0e2a47' }}>ESC</strong> Close</span>
          </div>
          <span style={{ fontWeight: 600, color: '#2F6BFF' }}>TaskFlowCo Palette</span>
        </div>
      </div>
    </div>
  );
}
