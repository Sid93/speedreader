import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tokenize, isPunctuationOnly, getORP, createScheduler, bionicSplit, sentenceStartAtOrBefore, endsSentence, buildQuiz } from "../index.js";

describe("tokenize", () => {
  it("splits on whitespace and drops empties", () => {
    expect(tokenize("  hello   world\n\tfoo ")).toEqual(["hello", "world", "foo"]);
  });
});

describe("isPunctuationOnly", () => {
  it("detects punctuation-only tokens", () => {
    expect(isPunctuationOnly("...")).toBe(true);
    expect(isPunctuationOnly("—")).toBe(true);
    expect(isPunctuationOnly("hi!")).toBe(false);
    expect(isPunctuationOnly("42")).toBe(false);
  });
});

describe("getORP", () => {
  it("returns three parts that reconstruct the original word", () => {
    const word = "hello";
    const { before, orp, after } = getORP(word);
    expect(before + orp + after).toBe(word);
  });
  it("puts ORP at ~30% of length", () => {
    expect(getORP("reading").before.length).toBe(2); // floor(7*0.3)=2
    expect(getORP("a").before.length).toBe(0);
  });
});

describe("sentenceStartAtOrBefore", () => {
  const words = ["Alpha", "beta", "gamma.", "Delta", "epsilon", "zeta"];
  it("returns index after the nearest sentence-ender", () => {
    expect(sentenceStartAtOrBefore(words, 5)).toBe(3);
    expect(sentenceStartAtOrBefore(words, 4)).toBe(3);
  });
  it("returns 0 when no sentence-ender in lookback", () => {
    expect(sentenceStartAtOrBefore(["no", "periods", "here", "yes"], 3)).toBe(0);
  });
  it("endsSentence detects period/question/exclaim with trailing quotes", () => {
    expect(endsSentence("done.")).toBe(true);
    expect(endsSentence('said."')).toBe(true);
    expect(endsSentence("running")).toBe(false);
  });
});

describe("buildQuiz", () => {
  const sample = `The quick brown fox jumps over the lazy sleeping dog. Reading faster requires focused attention and regular practice. Bionic reading emphasizes the beginning letters of words to help anchor the reader. Comprehension improves when natural pauses follow sentence endings.`;
  it("produces questions with 4 options each, answer among them", () => {
    const qs = buildQuiz(sample, { count: 3, seed: 1 });
    expect(qs.length).toBeGreaterThan(0);
    for (const q of qs) {
      expect(q.options.length).toBe(4);
      expect(q.options).toContain(q.answer);
      expect(q.before + " " + q.answer + " " + q.after).toContain(q.answer);
    }
  });
  it("same seed + text produces same quiz", () => {
    const a = buildQuiz(sample, { seed: 42 });
    const b = buildQuiz(sample, { seed: 42 });
    expect(a).toEqual(b);
  });
});

describe("bionicSplit", () => {
  it("bolds first ~45% of letters, round-ceiling on mid lengths", () => {
    expect(bionicSplit("reading")).toEqual({ bold: "rea", rest: "ding" }); // ceil(7*.45)=4 actually
  });
  it("short words bold one letter", () => {
    expect(bionicSplit("a")).toEqual({ bold: "a", rest: "" });
    expect(bionicSplit("to")).toEqual({ bold: "t", rest: "o" });
    expect(bionicSplit("the")).toEqual({ bold: "t", rest: "he" });
  });
  it("preserves leading/trailing punctuation outside the bold prefix", () => {
    const r = bionicSplit("(hello)");
    expect(r.bold.startsWith("(")).toBe(true);
    expect(r.rest.endsWith(")")).toBe(true);
    expect(r.bold + r.rest).toBe("(hello)");
  });
});

describe("scheduler", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("ticks through words at configured WPM", () => {
    const ticks: number[] = [];
    const sched = createScheduler({
      words: ["one", "two", "three"],
      wpm: 600, // 100ms/word
      onTick: (i) => ticks.push(i),
    });
    sched.play();
    expect(ticks).toEqual([0]);
    vi.advanceTimersByTime(100);
    expect(ticks).toEqual([0, 1]);
    vi.advanceTimersByTime(100);
    expect(ticks).toEqual([0, 1, 2]);
  });

  it("calls onFinish after last word", () => {
    const finish = vi.fn();
    const sched = createScheduler({
      words: ["a", "b"],
      wpm: 600,
      onTick: () => {},
      onFinish: finish,
    });
    sched.play();
    vi.advanceTimersByTime(200);
    expect(finish).toHaveBeenCalledOnce();
  });

  it("skips punctuation-only tokens when skipPunct=true", () => {
    const ticks: number[] = [];
    const sched = createScheduler({
      words: ["hi", "...", "bye"],
      wpm: 600,
      skipPunct: true,
      onTick: (i) => ticks.push(i),
    });
    sched.play();
    vi.advanceTimersByTime(100);
    vi.advanceTimersByTime(100);
    expect(ticks).toEqual([0, 2]);
  });

  it("chunkSize=3 advances 3 words per tick", () => {
    const ticks: number[] = [];
    const sched = createScheduler({
      words: ["a","b","c","d","e","f","g","h","i"],
      wpm: 600,
      chunkSize: 3,
      onTick: (i) => ticks.push(i),
    });
    sched.play();
    // first emit at 0 (immediate)
    expect(ticks).toEqual([0]);
    // delay = 60000 * 3 / 600 = 300ms
    vi.advanceTimersByTime(300);
    expect(ticks).toEqual([0, 3]);
    vi.advanceTimersByTime(300);
    expect(ticks).toEqual([0, 3, 6]);
  });

  it("adds extra delay after sentence-ending word", () => {
    const ticks: number[] = [];
    const sched = createScheduler({
      words: ["Hi.", "Then", "next"],
      wpm: 600, // base 100ms/word
      sentencePauseMs: 200,
      onTick: (i) => ticks.push(i),
    });
    sched.play();
    expect(ticks).toEqual([0]); // emit at "Hi."
    // Base 100ms + 200ms sentence pause = 300ms before advancing.
    vi.advanceTimersByTime(100);
    expect(ticks).toEqual([0]);
    vi.advanceTimersByTime(200);
    expect(ticks).toEqual([0, 1]);
  });

  it("step(1) advances and pauses", () => {
    const ticks: number[] = [];
    const sched = createScheduler({
      words: ["a", "b", "c"],
      wpm: 600,
      onTick: (i) => ticks.push(i),
    });
    sched.step(1);
    expect(sched.getState().index).toBe(1);
    expect(sched.getState().isPlaying).toBe(false);
  });
});
