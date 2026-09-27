import { MonitorCog, Moon, Palette, Sun } from 'lucide-react';
import type { Theme } from '../../shared/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTheme } from '../theme';
import { AboutSettings } from './AboutSettings';
import { AiSettings } from './AiSettings';
import { CustomSoundsSettings } from './CustomSoundsSettings';
import { TranslationSettings } from './TranslationSettings';

const THEME_OPTIONS: Array<{ value: Theme; label: string; icon: typeof Sun; description: string }> = [
  { value: 'light', label: 'Light', icon: Sun, description: 'Bright pages, ideal in daylight.' },
  { value: 'dark', label: 'Dark', icon: Moon, description: 'Low-glare pages for night reading.' },
  { value: 'sepia', label: 'Sepia', icon: Palette, description: 'Warm paper tones, easy on the eyes.' },
  { value: 'system', label: 'System', icon: MonitorCog, description: 'Follows your OS appearance.' },
];

export function Settings() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-6 sm:p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Choose how Taking Book looks.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = theme === option.value;
            return (
              <Button
                key={option.value}
                variant={active ? 'default' : 'outline'}
                className="h-auto justify-start gap-3 py-3"
                onClick={() => setTheme(option.value)}
                aria-pressed={active}
              >
                <Icon className="size-5 shrink-0" />
                <span className="flex flex-col items-start gap-0.5">
                  <span className="text-sm font-medium">{option.label}</span>
                  <span className={`text-xs ${active ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                    {option.description}
                  </span>
                </span>
              </Button>
            );
          })}
        </CardContent>
      </Card>

      <TranslationSettings />

      <AiSettings />

      <CustomSoundsSettings />

      <AboutSettings />
    </div>
  );
}