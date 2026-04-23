import { isPunctuationOnly } from "./tokenize.js";

export interface SchedulerOptions {
  words: string[];
  wpm?: number;
  skipPunct?: boolean;
  chunkSize?: number;
  /** Extra ms pause after words ending in . ! ? */
  sentencePauseMs?: number;
  /** Extra ms pause after words ending in , ; : */
  commaPauseMs?: number;
  /** Enable adaptive pacing: longer words get proportionally more time. */
  adaptivePacing?: boolean;
  onTick: (index: number, word: string) => void;
  onFinish?: () => void;
}

export interface SchedulerState {
  index: number;
  isPlaying: boolean;
  wpm: number;
  chunkSize: number;
}

export interface Scheduler {
  play(): void;
  pause(): void;
  toggle(): void;
  step(delta: number): void;
  seek(index: number): void;
  setWpm(wpm: number): void;
  setSkipPunct(skip: boolean): void;
  setChunkSize(n: number): void;
  setSentencePauseMs(ms: number): void;
  setCommaPauseMs(ms: number): void;
  setAdaptivePacing(on: boolean): void;
  getState(): SchedulerState;
  destroy(): void;
}

export function createScheduler(opts: SchedulerOptions): Scheduler {
  const { words } = opts;
  let wpm = opts.wpm ?? 300;
  let skipPunct = opts.skipPunct ?? true;
  let chunkSize = Math.max(1, opts.chunkSize ?? 1);
  let sentencePauseMs = opts.sentencePauseMs ?? 250;
  let commaPauseMs = opts.commaPauseMs ?? 80;
  let adaptivePacing = opts.adaptivePacing ?? false;
  let index = 0;
  let isPlaying = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function adaptiveMultiplier(word: string): number {
    if (!adaptivePacing) return 1;
    const letters = word.replace(/[^a-zA-Z0-9]/g, "").length;
    // 1.0 for 5-letter words; up to ~1.6 for long words; min ~0.8 for short.
    if (letters <= 3) return 0.85;
    if (letters <= 5) return 1.0;
    if (letters <= 8) return 1.15;
    if (letters <= 12) return 1.35;
    return 1.5;
  }

  function extraPauseFor(word: string): number {
    const last = word.replace(/[\s"'"')\]}]+$/, "").slice(-1);
    if ("!?.".includes(last)) return sentencePauseMs;
    if (",;:".includes(last)) return commaPauseMs;
    return 0;
  }

  function emit() {
    if (index >= 0 && index < words.length) {
      opts.onTick(index, words[index]!);
    }
  }

  function nextPlayableIndex(from: number, dir: 1 | -1 = 1): number {
    if (!skipPunct || chunkSize > 1) return from;
    let i = from;
    while (i >= 0 && i < words.length && isPunctuationOnly(words[i]!)) {
      i += dir;
    }
    return i;
  }

  function schedule() {
    if (!isPlaying) return;
    // Base delay per chunk; adjust by the current word being displayed.
    const baseDelay = (60000 * chunkSize) / wpm;
    const current = words[index] ?? "";
    const mult = chunkSize === 1 ? adaptiveMultiplier(current) : 1;
    const extra = chunkSize === 1 ? extraPauseFor(current) : extraPauseFor(current);
    const delay = Math.max(1, Math.round(baseDelay * mult + extra));
    timer = setTimeout(() => {
      const next = nextPlayableIndex(index + chunkSize, 1);
      if (next >= words.length) {
        isPlaying = false;
        timer = null;
        opts.onFinish?.();
        return;
      }
      index = next;
      emit();
      schedule();
    }, delay);
  }

  function clear() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  return {
    play() {
      if (isPlaying || words.length === 0) return;
      if (index >= words.length) index = 0;
      index = nextPlayableIndex(index, 1);
      isPlaying = true;
      emit();
      schedule();
    },
    pause() {
      isPlaying = false;
      clear();
    },
    toggle() {
      isPlaying ? this.pause() : this.play();
    },
    step(delta: number) {
      this.pause();
      const dir: 1 | -1 = delta >= 0 ? 1 : -1;
      const jump = (delta >= 0 ? 1 : -1) * Math.max(1, Math.abs(delta)) * chunkSize;
      let target = index + jump;
      target = Math.max(0, Math.min(words.length - 1, target));
      target = nextPlayableIndex(target, dir);
      if (target < 0) target = 0;
      if (target >= words.length) target = words.length - 1;
      index = target;
      emit();
    },
    seek(i: number) {
      this.pause();
      index = Math.max(0, Math.min(words.length - 1, i));
      emit();
    },
    setWpm(w: number) {
      wpm = Math.max(1, w);
      if (isPlaying) { clear(); schedule(); }
    },
    setSkipPunct(skip: boolean) {
      skipPunct = skip;
    },
    setChunkSize(n: number) {
      chunkSize = Math.max(1, Math.floor(n));
      if (isPlaying) { clear(); schedule(); }
    },
    setSentencePauseMs(ms: number) { sentencePauseMs = Math.max(0, ms); },
    setCommaPauseMs(ms: number) { commaPauseMs = Math.max(0, ms); },
    setAdaptivePacing(on: boolean) { adaptivePacing = on; },
    getState() {
      return { index, isPlaying, wpm, chunkSize };
    },
    destroy() {
      clear();
      isPlaying = false;
    },
  };
}
