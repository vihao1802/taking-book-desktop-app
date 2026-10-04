import {
  GOOGLE_DEVICE_CODE_URL,
  GOOGLE_DEVICE_FLOW_SCOPES,
  GOOGLE_TOKEN_URL,
  createGoogleDriveDeviceFlowProvider,
  type CloudProvider,
} from '@taking-book/core';
import { capacitorHttp, createNativeDriveFetch, createNativeOAuthHttp } from './native-http';
import { capacitorSecretStore, createSecureAuthStore } from './secure-auth-store';

/** The OAuth client baked into the build (ADR-0010: one device-flow client for every platform). */
export interface DriveClientConfig {
  clientId: string | undefined;
  clientSecret: string | undefined;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Builds the Google Drive provider over the phone's native HTTP and secure storage.
 *
 * @param config The OAuth client from the build; either part missing means no sync.
 * @param generateId Makes ids for multipart upload boundaries.
 * @returns The provider, or null when this build has no OAuth client.
 */
export function createDriveProvider(config: DriveClientConfig, generateId: () => string): CloudProvider | null {
  if (!config.clientId || !config.clientSecret) return null;
  return createGoogleDriveDeviceFlowProvider({
    config: {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      deviceCodeUrl: GOOGLE_DEVICE_CODE_URL,
      tokenUrl: GOOGLE_TOKEN_URL,
      scopes: GOOGLE_DEVICE_FLOW_SCOPES,
    },
    http: createNativeOAuthHttp(capacitorHttp),
    fetchImpl: createNativeDriveFetch(capacitorHttp),
    authStore: createSecureAuthStore(capacitorSecretStore),
    sleep: wait,
    now: Date.now,
    generateId,
  });
}
