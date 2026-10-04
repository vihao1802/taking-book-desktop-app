export interface AndroidVersion {
  versionName: string;
  versionCode: number;
}
export function deriveAndroidVersion(tag: string): AndroidVersion;
