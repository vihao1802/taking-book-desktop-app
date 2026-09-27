import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { cpSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

// The gitignored `.env` is shipped into the packaged app's resources/ so the
// Google OAuth client id/secret resolve at runtime without being committed.
// When absent (e.g. a fresh checkout), the build proceeds and the packaged
// app falls back to env vars / settings / the bundled default client id.
const bundledEnv = existsSync(path.join(__dirname, '.env')) ? ['.env'] : [];

// The Linux window icon is copied into resources/ so the packaged app can set
// it on the BrowserWindow at runtime (it is not bundled into the asar, which
// only contains the vite output).
const bundledIcon = [path.join(__dirname, 'build', 'icon.png')];

// The Vite plugin packages only the `.vite` output, never node_modules, so any
// module the main process loads at runtime instead of bundling is missing from
// the packaged app unless copied in. Only the files read at runtime are copied:
// better-sqlite3's JS plus its N-API prebuild (ABI-stable, so no Electron
// rebuild), and the pdf.js font/wasm dirs that `appfile://` serves.
const requireFromDesktop = createRequire(__filename);

function runtimeModuleFiles(platform: string, arch: string): Record<string, string[]> {
  return {
    'better-sqlite3': ['package.json', 'lib', `prebuilds/${platform}-${arch}.node`],
    'pdfjs-dist': ['package.json', 'standard_fonts', 'wasm'],
  };
}

function copyRuntimeModules(buildPath: string, platform: string, arch: string): void {
  for (const [moduleName, files] of Object.entries(runtimeModuleFiles(platform, arch))) {
    const moduleDir = path.dirname(requireFromDesktop.resolve(`${moduleName}/package.json`));
    for (const file of files) {
      cpSync(path.join(moduleDir, file), path.join(buildPath, 'node_modules', moduleName, file), {
        recursive: true,
      });
    }
  }
}

const config: ForgeConfig = {
  hooks: {
    packageAfterCopy: async (_forgeConfig, buildPath, _electronVersion, platform, arch) => {
      copyRuntimeModules(buildPath, platform, arch);
    },
  },
  packagerConfig: {
    asar: true,
    extraResource: [...bundledEnv, ...bundledIcon],
    icon: path.join(__dirname, 'build', 'icon'),
  },
  rebuildConfig: {},
  makers: [
    // The npm package name is scoped (@taking-book/desktop) and Squirrel
    // derives the nuspec/installer file names from it unless pinned, which
    // produces invalid paths like `@taking_book/desktop.nuspec`. Pin to the
    // productName from package.json.
    new MakerSquirrel({
      name: 'taking-book-desktop-app',
    }),
    new MakerZIP({}, ['darwin']),
    // The npm package name is scoped (@taking-book/desktop) but the packaged
    // binary is named from productName; the deb maker defaults its bin to the
    // package name, so pin it to the real binary or packaging fails. Without an
    // explicit icon the launcher entry shows Electron's default icon.
    new MakerDeb({
      options: {
        bin: 'taking-book-desktop-app',
        icon: path.join(__dirname, 'build', 'icon.png'),
      },
    }),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
