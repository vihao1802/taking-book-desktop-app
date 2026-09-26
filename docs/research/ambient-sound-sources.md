# Ambient sound sources for bundling in the desktop app

Research date: 2026-09-26. Goal: find audio we can ship inside the Electron binary for reading ambience. It must be safe for commercial use, ideally need no attribution, and cover (a) nature/ambience loops (rain, fireplace, café, forest, ocean) and (b) instrumental music with no vocals (lo-fi, piano, ambient). White, pink and brown noise are out of scope because we generate them with Web Audio.

Every licence and file detail below was read from the source page on the date above. Licences are set per file on Freesound, Wikimedia Commons, FMA, OpenGameArt and Internet Archive, so check each file's page again at download time and save a copy of it (see "Provenance checklist").

## Recommended shortlist

All of these are **CC0 1.0**: no attribution, commercial use allowed, redistribution allowed ([CC0 legal code](https://creativecommons.org/publicdomain/zero/1.0/legalcode.en)).

### Nature / ambience

| Category | Pick | Why |
|---|---|---|
| Rain | [unfa – "Slowly Raining Loop"](https://freesound.org/people/unfa/sounds/177479/) (73 s, FLAC, 4.8 MB) | The author says it "loops perfectly". There is faint traffic and a dog far in the background. |
| Rain | [samesamesame – "Rain from Indoors - Perfect loop"](https://freesound.org/people/samesamesame/sounds/242889/) (48 s, WAV 24-bit, 12.1 MB) | EQ'd to sound like rain heard from indoors. The author calls it a "perfect loop". |
| Rain (long) | [speakwithanimals – "Rain Slowly Passing TREATED LOOP"](https://freesound.org/people/speakwithanimals/sounds/525046/) (13:52, WAV, 228 MB) | A seamless loop, compressed to an even level. Trim it to 2–3 min. |
| Fireplace | [Julien_Matthey – "Fire in a fireplace with lots of crackles"](https://freesound.org/people/Julien_Matthey/sounds/112811/) (72 s, stereo WAV, 12.1 MB) | Clean crackle. Not marked as a loop, so crossfade it ourselves. |
| Fireplace | [NoOneIsReal – "The Fireplace 3"](https://freesound.org/people/NoOneIsReal/sounds/387128/) (93.5 s, mono WAV, 7.9 MB) | Long, with little reverb. Mono. Needs a crossfade loop. |
| Café | [douglasbruce – "Miss Michelle's cafe… small crowd"](https://freesound.org/people/douglasbruce@look.ca/sounds/746428/) (2:31, WAV, 27.7 MB) | Room tone and a small crowd. Listen for intelligible speech before we pick it (see traps). |
| Café | [CVLTIV8R – "Coffee Shop Ambience, Northtown Coffee"](https://freesound.org/people/CVLTIV8R/sounds/813868/) (2:25, WAV, 48.7 MB) | Espresso machine, footsteps and chatter. Check for words you can make out and for music in the background. |
| Forest | [ecfike – "Quiet Spring Woodland Ambience"](https://freesound.org/people/ecfike/sounds/160893/) (59 s, WAV, 9.9 MB) | The author says it "loops seamlessly" and has no urban noise. |
| Forest | [Nox_Sound – "Ambiance Natural Forest Birds Wind Loop Stereo"](https://freesound.org/people/Nox_Sound/sounds/570492/) (30 s, WAV 48k/24, 8.2 MB) | Sold as a loop. Short, so birdsong patterns may start to sound repetitive. |
| Ocean | [SamsterBirdies – "Calm ocean waves"](https://freesound.org/people/SamsterBirdies/sounds/578524/) (3:00, FLAC, 18.6 MB) | Gentle waves on Whidbey Island. The page describes it as looping. |
| Ocean | [kkenny101 – "Gentle Ocean Waves Loop"](https://freesound.org/people/kkenny101/sounds/852826/) (22 s, mono WAV, 3.0 MB) | Described as a "seamless loop". Short and mono. |

### Instrumental music (no vocals)

| Category | Pick | Why |
|---|---|---|
| Lo-fi | [HoliznaCC0 – "Public Domain Lofi" album (FMA)](https://freemusicarchive.org/music/holiznacc0/public-domain-lofi), e.g. ["Tokyo Sunset"](https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/tokyo-sunset-lofi-peaceful-soft/) (2:18) | The whole album of 57 tracks, about 2–3.5 min each, is CC0 1.0. FMA marks them instrumental and not AI-generated. This is our best lo-fi pool. |
| Lo-fi | [omfgdude – "Chill lofi inspired"](https://opengameart.org/content/chill-lofi-inspired) (OGG 6.5 MB) and [qubodup's seamless loop edit](https://opengameart.org/content/chill-lofi-inspired-loop-edit) (OGG 2.4 MB) | CC0, and a ready-made seamless loop exists. |
| Piano | [Kimiko Ishizaka – *Open Goldberg Variations*](https://archive.org/details/The_Open_Goldberg_Variations-11823) (Internet Archive, CC0 1.0; also on [Bandcamp](https://kimikoishizaka.bandcamp.com/album/j-s-bach-open-goldberg-variations-bwv-988-piano) as FLAC/WAV) | A professional studio recording on a Bösendorfer 290, released as CC0. The Aria and the slow variations suit reading. The companion *Open Well-Tempered Clavier* is also CC0 ([Internet Archive](https://archive.org/details/bach-well-tempered-clavier-book-1)). |
| Piano | [Satie – Gymnopédie No. 1, "Gymnopedie_No._1..ogg"](https://commons.wikimedia.org/wiki/File:Gymnopedie_No._1..ogg) (Wikimedia Commons, 3:25, Ogg FLAC, 6.2 MB) | The uploader's own recording, released as CC0. The composition is public domain. |
| Piano | [Chopin – Nocturne Op. 9 No. 2, Frank Levy via Musopen](https://commons.wikimedia.org/wiki/File:Nocturneop9no2-.ogg) (4:31, MP3 128 kbps, 4.9 MB) | Released under the CC Public Domain Dedication. Commons shows "license review pending", so check the licence on the Musopen page as well. The MP3 is lossy at 128 kbps, so we would be re-encoding an already lossy file. |
| Ambient | [The Cynic Project – "Calm Ambient 2 (Synthwave 15k)"](https://opengameart.org/content/calm-ambient-2-synthwave-15k) (MP3 8.3 MB) and ["Calm Piano 1 (Vaporware)"](https://opengameart.org/content/calm-piano-1-vaporware) (MP3 6.6 MB) | CC0. The author asks for credit ("ATTRIBUTION: The Cynic Project / cynicmusic.com"), but CC0 does not require it. We should credit anyway as a courtesy. |

## Licence traps

1. **Pixabay is not CC0.** It uses its own Content Licence. Attribution is not required, but "You cannot sell or distribute Content … on a Standalone basis", and "Standalone" means "no creative effort has been applied … and it remains in substantially the same form" ([license summary](https://pixabay.com/service/license-summary/), [terms](https://pixabay.com/service/terms/)). Pixabay's terms and [FAQ](https://pixabay.com/service/faq/) never mention apps or software. Unchanged audio files inside our app bundle can be pulled out of `app.asar` in their original form, which makes this a grey area. Third-party guides say "shipping it in your game is fine", but that is not a primary source. Pixabay music also runs into YouTube Content ID claims (the FAQ has a whole dispute procedure). If one of our users records a video with our app's music playing, their video could get claimed. **Avoid Pixabay for bundled audio.**
2. **Freesound licences are set per file.** The site mixes CC0, CC-BY, CC-BY-NC and the retired Sampling+ ([FAQ](https://freesound.org/help/faq/)). **CC-BY-NC** rules out a commercial app, and Sampling+ forbids advertising use. Use only files whose own page says "Creative Commons 0". The search filter is `license:"Creative Commons 0"`.
3. **CC0 does not clear copyrighted content inside a recording.** Some CC0 café recordings contain other people's music. For example, [samyi "Ambience-cafe001"](https://freesound.org/people/samyi/sounds/382314/) was recorded in a Starbucks with instrumental music playing in the background. The uploader cannot waive rights to that music, so **reject any café or street recording with music in the background.** Speech you can make out also raises privacy and publicity concerns, so prefer indistinct crowd noise.
4. **Wikimedia Commons licences are set per file, and the most famous files are often not CC0.** The Chopin Nocturne Op. 9 No. 2 recording used on Wikipedia (Martha Goldstein, [file page](https://commons.wikimedia.org/wiki/File:Frederic_Chopin_-_Nocturne_Eb_major_Opus_9,_number_2.ogg)) is **CC BY-SA 2.0**, which requires attribution and share-alike. A public-domain composition does not make its recording public domain. The "Gymnopedie No. x (ISRC USUAN…)" files on Commons are **Kevin MacLeod, CC-BY 3.0** ([example](https://commons.wikimedia.org/wiki/File:Gymnopedie_No._1_(ISRC_USUAN1100787).mp3)).
5. **Musopen mixes licences.** Recordings are released as PD, CC0 or CC BY-SA depending on the recording ([OSU Libraries guide](https://library.osu.edu/copyright/public-domain), [Wikipedia](https://en.wikipedia.org/wiki/Musopen)). Free accounts can download only 5 files a day. musopen.org blocked our automated fetch (HTTP 403), so read each recording's licence badge by hand. Commons copies of Musopen files are easier to check because each has its own licence tag.
6. **Kevin MacLeod / incompetech is CC-BY 4.0, not CC0.** The required credit text is `"Title" Kevin MacLeod (incompetech.com) Licensed under Creative Commons: By Attribution 4.0 https://creativecommons.org/licenses/by/4.0/` ([FAQ](https://incompetech.com/music/royalty-free/faq.html)). In an app, a Credits/About screen would satisfy this. A paid "Standard License" removes the attribution requirement ([licenses page](https://incompetech.com/music/royalty-free/licenses/)). A secondary source puts the price at about $30 for one track, $50 for two and $20 per track for three or more, but we did not confirm this on incompetech itself. Use it only as a fallback.
7. **FMA licences are set per track and include NC and ND variants** ([License Guide](https://freemusicarchive.org/License_Guide)). **ND** forbids derivatives, and FMA counts syncing a track to video as a derivative, so trimming or crossfading into a loop is risky. **NC** rules out commercial use. Only **CC0** (such as HoliznaCC0) or **CC BY** tracks are usable.
8. **Minor: GarageBand loops inside CC0 tracks.** TAD's CC0 ["lofi Compilation"](https://opengameart.org/content/lofi-compilation) says its loops come from Apple GarageBand. Apple's loop licence allows loops inside original compositions, so the finished tracks are probably fine. However, the uploader cannot waive Apple's rights in those loops. This is low risk, but it is a reason to prefer HoliznaCC0.
9. **Internet Archive licences are whatever the uploader typed.** They are often wrong. Trust an item only when it comes from a verifiable source, such as the Open Goldberg item, which the project itself published.
10. **CC0 does not waive trademarks or patents** ([legal code](https://creativecommons.org/publicdomain/zero/1.0/legalcode.en)). This doesn't matter for ambience audio, but don't use artist or track names as product branding.

## Format, encoding and size budget

- **Electron plays Ogg Opus natively.** Open-source Chromium supports Opus, Vorbis and FLAC in Ogg, WebM and MP4 containers. AAC and MP3 are listed as "Google Chrome only" ([chromium.org/audio-video](https://www.chromium.org/audio-video/)). Electron builds Chromium with `proprietary_codecs = true` and `ffmpeg_branding = "Chrome"` ([electron/build/args/all.gn](https://raw.githubusercontent.com/electron/electron/main/build/args/all.gn)), so AAC and MP3 play as well. Opus is still the better default because it is royalty-free and doesn't depend on that build flag. MDN: "Opus is a good all-around audio codec… for any audio tasks" and Chrome has supported it since version 33 ([MDN audio codecs](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs)).
- **Recommended targets** (Xiph suggests 64–96 kbps for music streaming, 96–128 kbps for music storage, and calls 128 kbps VBR "pretty much transparent", per [Opus Recommended Settings](https://wiki.xiph.org/Opus_Recommended_Settings)):
  - Ambience loops: Opus VBR **48–64 kbps**, stereo (mono sources can stay mono at about 32–48 kbps). At 64 kbps that is about 0.48 MB/min, so a 2-min loop is about 1 MB.
  - Music: Opus VBR **96 kbps** stereo, about 0.72 MB/min, so a 3-min track is about 2.2 MB. Use 128 kbps for solo piano if the decay tails sound smeared.
  - Example: `ffmpeg -i in.wav -c:a libopus -b:a 96k -vbr on out.opus`
- **Budget example:** 5 ambience loops of 1–2 min at 64 kbps (about 5 MB) plus 6 music tracks of about 3 min at 96 kbps (about 13 MB) comes to **about 18 MB**. Keep lossless masters out of the repo.
- **Looping:** `<audio loop>` often leaves a small gap with compressed formats. For gapless loops, decode each file with `AudioContext.decodeAudioData` and play it through `AudioBufferSourceNode` with `loop = true`. Test how Opus pre-skip and padding behave at the loop point. Clips that are not marked as loops need an equal-power crossfade baked into the master before encoding. Short loops (under 30 s) that contain distinctive events, such as bird calls or a loud crackle, will sound repetitive, so prefer 1–3 min sources.
- **Re-encoding lossy sources** (the Musopen/Commons MP3, the Cynic Project MP3s, FMA MP3s) loses a little more quality each time. Where one exists, prefer a lossless original (Bandcamp FLAC for Ishizaka, Ogg FLAC on Commons, WAV/FLAC on Freesound).

## Provenance checklist (per bundled file)

Keep a `THIRD_PARTY_AUDIO.md` or JSON manifest in the app source with these fields for each file: source URL, author, licence and licence URL, date retrieved, a copy or archive.org snapshot of the source page, and any edits made (trim, crossfade, loudness normalisation, encode settings). CC0 needs no credit, but a courtesy credits list on an About screen costs nothing and protects us if a licence is ever questioned.

## Sources

- CC0 1.0 legal code: https://creativecommons.org/publicdomain/zero/1.0/legalcode.en
- Pixabay Content License summary: https://pixabay.com/service/license-summary/ ; Terms: https://pixabay.com/service/terms/ ; FAQ: https://pixabay.com/service/faq/
- Freesound FAQ (licences): https://freesound.org/help/faq/
- Freesound file pages: linked in the tables above
- FMA License Guide: https://freemusicarchive.org/License_Guide ; HoliznaCC0 album: https://freemusicarchive.org/music/holiznacc0/public-domain-lofi
- OpenGameArt pages: linked above; collection https://opengameart.org/content/cc0-calm-relaxing-music
- Open Goldberg Variations (Internet Archive): https://archive.org/details/The_Open_Goldberg_Variations-11823 ; project site https://opengoldbergvariations.org/listen/
- Wikimedia Commons file pages: linked above
- incompetech licences: https://incompetech.com/music/royalty-free/licenses/ ; FAQ: https://incompetech.com/music/royalty-free/faq.html
- Musopen: https://en.wikipedia.org/wiki/Musopen ; https://library.osu.edu/copyright/public-domain (musopen.org returned 403 to automated fetches)
- Chromium codecs: https://www.chromium.org/audio-video/
- Electron GN args: https://raw.githubusercontent.com/electron/electron/main/build/args/all.gn
- MDN audio codecs: https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs
- Xiph Opus recommended settings: https://wiki.xiph.org/Opus_Recommended_Settings
