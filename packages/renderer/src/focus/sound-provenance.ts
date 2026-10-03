/** Where a bundled sound file came from, as recorded in `sounds/manifest.json`. */
export interface SoundProvenance {
  file: string;
  sourceUrl: string;
  author: string;
  licence: string;
  downloadedOn: string;
  title?: string;
  licenceUrl?: string;
  edits?: string;
}

// ADR-0005: nothing that needs credit, payment or share-alike may ship.
const ALLOWED_LICENCE = /^(CC0(\s|$)|public domain$)/i;

export interface ProvenanceCheckInput {
  files: string[];
  manifest: SoundProvenance[];
}

function findEntryProblems(entry: SoundProvenance): string[] {
  const problems: string[] = [];
  if (!ALLOWED_LICENCE.test(entry.licence.trim())) {
    problems.push(`${entry.file} has licence "${entry.licence}", only CC0 or public domain may be bundled`);
  }
  if (entry.sourceUrl.trim() === '') problems.push(`${entry.file} has no source URL`);
  if (entry.author.trim() === '') problems.push(`${entry.file} has no author`);
  if (entry.downloadedOn.trim() === '') problems.push(`${entry.file} has no download date`);
  return problems;
}

/**
 * Compares the bundled sound files with the provenance manifest.
 *
 * @param input - The bundled file names and the manifest entries.
 * @returns One message per problem; empty when every file is listed with an allowed licence.
 */
export function findProvenanceProblems({ files, manifest }: ProvenanceCheckInput): string[] {
  const listed = new Set(manifest.map((entry) => entry.file));
  const unlisted = files.filter((file) => !listed.has(file)).map((file) => `${file} is bundled but missing from the manifest`);
  const dangling = manifest.filter((entry) => !files.includes(entry.file)).map((entry) => `${entry.file} is in the manifest but no such file is bundled`);
  return [...unlisted, ...dangling, ...manifest.filter((entry) => files.includes(entry.file)).flatMap(findEntryProblems)];
}
