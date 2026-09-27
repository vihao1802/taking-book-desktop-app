import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAiApiKey } from './useAiApiKey';

const API_KEY_INPUT_ID = 'ai-api-key';

/**
 * Settings section for saving, replacing or removing the reader's own AI
 * provider API key (ADR-0007). The key is never read back from the main
 * process, so this component never has it in state once it is saved.
 */
export function AiSettings() {
  const { mode, error, startReplacing, cancelReplacing, saveKey, removeKey } = useAiApiKey();
  const [draft, setDraft] = useState('');

  const submitDraft = (): void => {
    saveKey(draft);
    setDraft('');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI provider</CardTitle>
        <CardDescription>Your Google AI Studio key, used to generate Quizzes.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {mode === 'loading' && <p className="text-muted-foreground">Loading…</p>}

        {mode === 'saved' && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <Label>API key</Label>
              <span className="text-muted-foreground">A key is saved.</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={startReplacing}>
                Replace key
              </Button>
              <Button variant="outline" onClick={removeKey}>
                Remove key
              </Button>
            </div>
          </div>
        )}

        {(mode === 'unset' || mode === 'editing') && (
          <div className="flex flex-col gap-2">
            <Label htmlFor={API_KEY_INPUT_ID}>API key</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id={API_KEY_INPUT_ID}
                type="password"
                autoComplete="off"
                placeholder="Paste your Google AI Studio key"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                className="min-w-64 flex-1"
              />
              <Button onClick={submitDraft} disabled={draft.trim().length === 0}>
                Save key
              </Button>
              {mode === 'editing' && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setDraft('');
                    cancelReplacing();
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}

        <p className="text-muted-foreground">
          Your key is encrypted and stays on this device; it is never synced, shown again or logged. When you make a
          Quiz, the text of the pages you have read is sent to the AI provider.
        </p>
      </CardContent>
    </Card>
  );
}
