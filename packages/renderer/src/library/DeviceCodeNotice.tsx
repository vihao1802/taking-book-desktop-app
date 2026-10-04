import { KeyRound } from 'lucide-react';
import type { DeviceCodePrompt } from '@/reader-api';

/**
 * Shows the code the reader enters on Google's page to approve a sign-in, with
 * the address to open. It is shown only while connecting waits for approval.
 */
export function DeviceCodeNotice({ prompt }: { prompt: DeviceCodePrompt }) {
  return (
    <div
      role="status"
      aria-label="Google sign-in code"
      className="border-border bg-card flex flex-col gap-1 rounded-lg border px-3.5 py-3 text-sm"
    >
      <div className="text-muted-foreground flex items-center gap-2">
        <KeyRound className="size-4 shrink-0" />
        <span>
          Enter this code at <span className="text-foreground break-all">{prompt.verificationUrl}</span> and approve the
          sign-in.
        </span>
      </div>
      <p className="text-foreground font-mono text-2xl font-semibold tracking-widest select-all">{prompt.userCode}</p>
    </div>
  );
}
