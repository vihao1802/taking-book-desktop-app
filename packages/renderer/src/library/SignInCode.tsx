import type { DeviceCodePrompt } from '@taking-book/core';

/**
 * Shows the code and address of a device-flow sign-in while the app waits for
 * the reader to approve it. The code is also copied and the page opened by the
 * platform, so this is the fallback when either of those did not work.
 */
export function SignInCode({ prompt }: { prompt: DeviceCodePrompt }) {
  return (
    <section
      aria-label="Google sign-in code"
      className="border-border flex flex-col gap-1.5 rounded-lg border px-3.5 py-3 text-sm"
    >
      <p>
        Enter this code on the Google page that just opened. It is already copied, so paste it. This window continues
        once you approve.
      </p>
      <p className="font-mono text-2xl font-semibold tracking-widest" aria-label="Sign-in code">
        {prompt.userCode}
      </p>
      <p className="text-muted-foreground">
        Page did not open? Go to <span className="font-medium">{prompt.verificationUrl}</span>
      </p>
    </section>
  );
}
