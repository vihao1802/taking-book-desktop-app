// Core compiles against plain ES2022 so no DOM or Node API can leak in, but
// ES leaves timers to the host. Every runtime core runs on (Node/Electron,
// Chromium, React Native's Hermes) provides these two, so only they are
// declared, with the narrowest signatures core needs.
declare function setTimeout(callback: () => void, ms: number): unknown;
declare function clearTimeout(handle: unknown): void;
