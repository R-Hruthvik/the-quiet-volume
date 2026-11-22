import { buildVolumeFromDocs, type ParsedSourceDoc } from './parser';
import type { BookVolume } from '../types/book';

const LETTERS_ON_QUIET_CRAFT_MD = `# Letters on Quiet Craft
By Clara Lindholm

## Chapter I — The Room Before Morning

There is a particular hour just before the rest of the house wakes when a wooden desk seems larger than it is at noon. The grain of the walnut catches the pale light from the north window, and a single bound notebook resting slightly below center feels less like an object waiting to be opened and more like a room you have already entered.

When people speak of tools for reading, they almost always speak of speed. How quickly a page can be fetched, how many volumes can be indexed on a glowing shelf, how swiftly a margin can be sorted into tags. Yet the earliest memory most readers carry of loving a book has nothing to do with velocity. It is the quiet weight of paper settling flat beneath the heel of a hand.

> A quiet book does not announce itself. It waits on the table until your eyes are ready to return to the exact line where the silk ribbon stayed.

Notice how little an ordinary printed volume asks of you. There is no dial telling you what percentage of the evening has elapsed; you simply feel the thickness of the pages already turned resting under your left thumb, and the pages still ahead gathered neatly on the right. When you close the cover, the room does not reset to a directory. The volume simply lies shut until tomorrow.

***

On winter mornings in Lund, my grandfather kept two small lamps beside his chair—one with a frosted shade for overcast afternoons, and a low brass hood for late hours after ten. He never changed the ink of his books, of course, nor swapped the cream paper for black cardboard. He changed only the light falling across the page. That distinction stayed with me for thirty years: the paper belongs to the book, while the light belongs to the hour.

## Chapter II — Paper, Grain, and Margin

A good margin is not wasted paper. It is the place where a reader breathes between sentences, and where an unspoken conversation with the author slowly collects in soft graphite.

Years ago I borrowed an edition of essays on northern architecture from a retired bookbinder. Its cloth spine had softened from forty years of opening, and the corners of the boards were gently rounded—not stained, not damaged, only acquainted with human hands. Inside the third essay, beside a paragraph on how snow reflects daylight into narrow rooms, a faint pencil note read simply: "Remember the library in Turku, February."

That single line changed how I read the rest of the chapter. Memory had altered the photograph I carried in my head of that building, and the small handwritten note in the margin became a second lens resting beside the printed ink.

### On Choosing a Readable Hand

Handwriting on a page succeeds only when it forgets to perform. Exaggerated loops and theatrical flourishes grow tiring by the fourth paragraph. What endures across a hundred pages is a clear, open print hand: generous counters inside every a and e, steady spacing between words, and just enough human variation that no two lines feel stamped by an iron machine.

When a manuscript shifts into technical diagrams, measurements, or tables of figures, the eye prefers stillness over warmth. In those moments a disciplined serif or steady monospace face steps forward quietly, keeping every numeral aligned until the prose resumes.

***

At the end of a long chapter, the bookbinder always left the verso page blank whenever a new chapter began on the right. "Give the ear a beat of silence," he told me, smoothing the linen flyleaf with a bone folder. "Otherwise the new voice enters before the old one has left the chair."

## Chapter III — Returning to the Ribbon

To return to a book you laid down three evenings ago is a small act of continuity. You do not want to be greeted by a panel summarizing your habits or congratulating you on a streak. You want the cover to lift, the ribbon to slide lightly aside, and your eyes to find the exact sentence where your attention paused.

We live inside glass panes that constantly ask which feature we would like to use next. A bound volume asks nothing at all. It assumes, with quiet generosity, that you came to the table simply to read.

And when the final sentence arrives—often sooner than expected on a calm Sunday evening—there is a last blank endpaper waiting after the colophon. Write the date in pencil, if you like, and perhaps a single honest sentence about what remained with you. Then close the boards gently and let the book rejoin the small stack at the edge of the desk.
`;

const FIELD_NOTES_ON_LIGHT_MD = `# Field Notes on Light & Paper
By Henrik Dalgaard

## Section 1 — Daylight and Reflectance

Natural window light rarely falls evenly across a table. On a clear morning, light enters at an oblique angle from the left, casting a soft directional shadow beneath the lower right corner of an open book while leaving the center gutter gently shaded.

When sky cover thickens into overcast daylight, contrast softens across the entire surface. Shadows lose their hard border and settle into a calm, almost shadowless wash. Bookmakers often proof long manuscripts under overcast north light because the eye fatigues far more slowly when there is no glare competing with the paper fiber.

> Paper is never purely white; it is a quiet conversation between cotton fiber, ambient sky, and the warmth of the lamp beside your elbow.

### Measured Reflectance Notes

\`\`\`
Stock               Reflectance   Tone Shift   Recommended Light
-----------------------------------------------------------------
White Cotton        88%           Neutral      Daylight / Overcast
Warm Notebook       84%           +180K warm   Daylight / Warm Lamp
Cream Book Paper    81%           +290K warm   Warm Lamp / Evening
Recycled Grey       73%           Cool neutral Overcast / Bright Sun
Dark Charcoal       14%           Deep matte   Night Light
\`\`\`

## Section 2 — The Pool of a Warm Lamp

After dusk, illumination becomes local. Instead of lighting the whole room evenly, a single reading lamp draws a quiet pool of amber warmth directly over the two open pages while the walnut surface beyond the cover recedes into deep shadow.

In this light, the center gutter grows deeper and more sculptural. The ink should remain grounded—dark espresso or charcoal rather than washed-out brown—so every letter holds crisp legibility even as the ambient intensity falls.

***

Moonlit reading is another creature entirely: cool silver along the outer edges of the page block, low luminance across the paper face, and a blue-grey stillness across the desk. Few readers spend three hours in moonlight, yet for twenty minutes of poetry before sleep, no warmer bulb can match it.

## Section 3 — Local Binding & Permanence

A personal volume should belong strictly to the desk where it was bound. Its pages, dog-eared corners, pencil underlinings, and quiet marginalia stay inside this browser's own storage without ever crossing a wire to a distant server.

When a reader finishes a notebook and wishes to carry its thoughts elsewhere, the text and margin notes can be exported cleanly as a plain manuscript—still legible fifty years from now, free of proprietary locks.
`;

export function createStarterVolumes(): BookVolume[] {
  const lettersDoc: ParsedSourceDoc = {
    fileName: 'Letters on Quiet Craft.md',
    title: 'Letters on Quiet Craft',
    author: 'Clara Lindholm',
    text: LETTERS_ON_QUIET_CRAFT_MD,
    meta: {
      name: 'Letters on Quiet Craft.md',
      size: LETTERS_ON_QUIET_CRAFT_MD.length,
      type: 'text/markdown',
      lastModified: Date.now() - 86400 * 1000 * 4,
    },
  };

  const fieldNotesDoc: ParsedSourceDoc = {
    fileName: 'Field Notes on Light and Paper.md',
    title: 'Field Notes on Light & Paper',
    author: 'Henrik Dalgaard',
    text: FIELD_NOTES_ON_LIGHT_MD,
    meta: {
      name: 'Field Notes on Light and Paper.md',
      size: FIELD_NOTES_ON_LIGHT_MD.length,
      type: 'text/markdown',
      lastModified: Date.now() - 86400 * 1000 * 11,
    },
    isTechnical: true,
  };

  const vol1 = buildVolumeFromDocs([lettersDoc]);
  vol1.id = 'starter-letters-quiet-craft';
  vol1.isStarter = true;
  vol1.wearCount = 4;
  vol1.lastPageIndex = 3;
  vol1.identity = {
    ...vol1.identity,
    coverColor: '#2B3D34',
    spineColor: '#202E27',
    ribbonColor: '#B87654',
    coverMaterial: 'linen',
    titleTreatment: 'paper-label',
    inkOnCover: '#ECE6DA',
  };
  vol1.dogEaredPages = [4];
  vol1.notes = [
    {
      id: 'seed-note-1',
      blockId: vol1.blocks[1]?.id || 'b-0-2',
      text: 'The paper belongs to the book; the light belongs to the hour.',
      createdAt: Date.now() - 86400 * 1000 * 2,
    },
  ];

  const vol2 = buildVolumeFromDocs([fieldNotesDoc]);
  vol2.id = 'starter-field-notes-light';
  vol2.isStarter = true;
  vol2.wearCount = 2;
  vol2.lastPageIndex = 3;
  vol2.lastOpenedAt = Date.now() - 86400 * 1000 * 3;
  vol2.identity = {
    ...vol2.identity,
    coverColor: '#323539',
    spineColor: '#24262A',
    ribbonColor: '#9B4D46',
    coverMaterial: 'library-cloth',
    titleTreatment: 'stamped',
    inkOnCover: '#EFECE6',
  };

  return [vol1, vol2];
}

export function createSampleManuscriptDocs(): ParsedSourceDoc[] {
  const part1 = `# Collected Winter Notebooks — Part 1
By M. Sorensen

## Morning Walk Along the Harbor

Frost settled along the timber pilings before sunrise. Every ferry bell carried twice as far across the still water, and the notebook in my coat pocket stayed dry beneath thick wool.

I stopped by the stone bench near the breakwater to copy down three lines about how winter light flattens distant hills into layered paper cut-outs. A kind of shared memory lives in places where the weather repeats the same gestures every January.
`;

  const part2 = `# Collected Winter Notebooks — Part 2
By M. Sorensen

## Afternoon in the Bindery

Warm glue, linen thread, and trimmed stacks of off-white rag paper filled the narrow workshop above the bakery. The apprentice folded signatures of sixteen pages with unhurried rhythm, creasing each spine once with a smooth bone folder.

***

By four o'clock the street lamps flickered on outside the frosted glass. We brewed dark tea and left the freshly pressed boards beneath a cast-iron weight until morning.
`;

  return [
    {
      fileName: 'Winter Notebooks — Part 1.md',
      title: 'Winter Notebooks — Part 1',
      author: 'M. Sorensen',
      text: part1,
      meta: {
        name: 'Winter Notebooks — Part 1.md',
        size: part1.length,
        type: 'text/markdown',
        lastModified: Date.now() - 86400 * 1000 * 2,
      },
    },
    {
      fileName: 'Winter Notebooks — Part 2.md',
      title: 'Winter Notebooks — Part 2',
      author: 'M. Sorensen',
      text: part2,
      meta: {
        name: 'Winter Notebooks — Part 2.md',
        size: part2.length,
        type: 'text/markdown',
        lastModified: Date.now() - 86400 * 1000,
      },
    },
  ];
}
