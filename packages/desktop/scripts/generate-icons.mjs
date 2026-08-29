import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import iconGen from 'icon-gen';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const master = path.join(root, 'assets', 'icon-master.png');
const buildDir = path.join(root, 'build');

const ALL_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

async function main() {
  mkdirSync(buildDir, { recursive: true });
  const workDir = mkdtempSync(path.join(tmpdir(), 'taking-book-icons-'));
  try {
    for (const size of ALL_SIZES) {
      const target = path.join(workDir, `${size}.png`);
      if (size === 1024) {
        copyFileSync(master, target);
      } else {
        await sharp(master).resize(size, size).png().toFile(target);
      }
    }
    await iconGen(workDir, buildDir, {
      report: true,
      ico: { name: 'icon', sizes: [16, 24, 32, 48, 64, 128, 256] },
      icns: { name: 'icon', sizes: [16, 32, 64, 128, 256, 512, 1024] },
    });
    await sharp(master).resize(512, 512).png().toFile(path.join(buildDir, 'icon.png'));
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
