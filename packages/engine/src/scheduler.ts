import { isPunctuationOnly } from "./tokenize.js";

export interface SchedulerOptions {
  words: string[];
  wpm?: number;
  skipPunct?: boolean;
  onTick: (index: number, word: string) => void;
  onFinish?: () => void;
}

export interface SchedulerState {
  index: number;
  isPlaying: boolean;
  wpm: number;
}

export interface Scheduler {
  play(): void;
  pause(): void;
  toggle(): void;
  step(delta: number): void;
  seek(index: number): void;
  setWpm(wpm: number): void;
  setSkipPunct(skip: boolean): void;
  getState(): SchedulerState;
  destroy(): void;
}

export function createScheduler(opts: SchedulerOptions): Scheduler {
  let { words } = opts;
  let wpm = opts.wpm ?? 300;
  let skipPunct = opts.skipPunct ?? true;
  let index = 0;
  let isPlaying = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function emit() {
    if (index >= 0 && index < words.length) {
      opts.onTick(index, words[index]!);
    }
  }

  function nextPlayableIndex(from: number, dir: 1 | -1 = 1): number {
    if (!skipPunct) return from;
    let i = from;
    while (i >= 0 && i < words.length && isPunctuationOnly(words[i]!)) {
      i += dir;
    }
    return i;
  }

  function schedule() {
    if (!isPlaying) return;
    const delay = Math.max(1, Math.round(60000 / wpm));
    timer = setTimeout(() => {
      const next = nextPlayableIndex(index + 1, 1);
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
      let target = index + delta;
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
      if (isPlaying) {
        clear();
        schedule();
      }
    },
    setSkipPunct(skip: boolean) {
      skipPunct = skip;
    },
    getState() {
      return { index, isPlaying, wpm };
    },
    destroy() {
      clear();
      isPlaying = false;
    },
  };
}
