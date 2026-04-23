import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tokenize, isPunctuationOnly, getORP, createScheduler } from "../index.js";

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
