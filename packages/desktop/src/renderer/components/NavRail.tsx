import {
  BarChart3,
  Home as HomeIcon,
  Library as LibraryIcon,
  Settings,
  Star,
} from 'lucide-react';

export type View = 'home' | 'library' | 'favorites' | 'statistics' | 'settings';

const NAV_ITEMS: Array<{ id: View; label: string; icon: typeof HomeIcon }> = [
  { id: 'home', label: 'Home', icon: HomeIcon },
  { id: 'library', label: 'Library', icon: LibraryIcon },
  { id: 'favorites', label: 'Favorites', icon: Star },
  { id: 'statistics', label: 'Statistics', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function NavRail({
  current,
  onNavigate,
}: {
  current: View;
  onNavigate: (view: View) => void;
}) {
  return (
    <nav className="bg-nav flex w-20 shrink-0 flex-col items-center justify-between border-r border-border py-6" aria-label="Primary">
      <div className="flex flex-col items-center gap-8">
        <ul className="flex flex-col items-center gap-6">
          {NAV_ITEMS.map((item) => (
            <li key={item.id}>
              <button
                className="text-muted-foreground hover:bg-card flex size-10 cursor-pointer items-center justify-center rounded-lg transition-colors [&[aria-current='page']]:bg-card [&[aria-current='page']]:text-ink [&[aria-current='page']]:shadow-sm"
                aria-current={current === item.id ? 'page' : undefined}
                aria-label={item.label}
                title={item.label}
                onClick={() => onNavigate(item.id)}
              >
                <item.icon className="size-5" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}