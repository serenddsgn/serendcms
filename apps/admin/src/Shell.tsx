import { NavLink, Outlet } from 'react-router';
import { MaintenanceBar } from './pages/MaintenancePage';
import { useSession } from './session';

const NAV: [string, string, boolean?][] = [
  ['/', 'Veröffentlichung'],
  ['/projects', 'Projekte'],
  ['/layout', 'Startseiten-Layout'],
  ['/pages', 'Seiten'],
  ['/media', 'Medien'],
  ['/import', 'Import'],
  ['/services', 'Leistungen'],
  ['/navigation', 'Navigation'],
  ['/team', 'Team'],
  ['/settings', 'Einstellungen', true],
  ['/maintenance', 'Wartungsmodus'],
  ['/messages', 'Nachrichten'],
  ['/users', 'Benutzer', true],
];

export function Shell() {
  const { user, logout } = useSession();
  return (
    <div className="shell">
      <nav className="side" aria-label="Hauptnavigation">
        <div className="brand">serendCMS</div>
        {NAV.filter(([, , adminOnly]) => !adminOnly || user.role === 'admin' || true).map(
          ([to, label]) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => `nav ${isActive ? 'active' : ''}`}
            >
              {label}
            </NavLink>
          ),
        )}
        <div className="grow" />
        <div className="small muted" style={{ padding: '0 10px' }}>
          {user.displayName}
          <br />
          {user.role}
        </div>
        <button
          className="btn small"
          onClick={() => void logout()}
          style={{ margin: '8px 10px 0' }}
        >
          Abmelden
        </button>
      </nav>
      <div>
        <MaintenanceBar />
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
