import { useEffect, useRef, useState } from "react";
import { api } from "./api";

type Snapshot = { id: number; messageId: number }[];

export function useOrderAlerts(active: boolean) {
  const audio = useRef<AudioContext | null>(null);
  const enabled = useRef(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [soundError, setSoundError] = useState("");

  function ring() {
    const context = audio.current;
    if (!enabled.current || context?.state !== "running") return;
    // A short two-strike bell, synthesized locally without external media.
    for (const delay of [0, 0.35]) {
      for (const [frequency, volume] of [
        [880, 0.18],
        [1760, 0.06],
      ]) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = context.currentTime + delay;
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(volume, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.8);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.85);
      }
    }
  }

  async function toggleSound() {
    if (enabled.current) {
      enabled.current = false;
      setSoundEnabled(false);
      return;
    }
    try {
      audio.current ??= new AudioContext();
      await audio.current.resume();
      if (audio.current.state !== "running") throw new Error();
      enabled.current = true;
      setSoundEnabled(true);
      setSoundError("");
      ring();
    } catch {
      setSoundError(
        "Sound is blocked. Allow audio in your browser, then try again.",
      );
    }
  }

  useEffect(() => {
    if (!active) return;
    let alive = true;
    let pending = false;
    let seen: Map<number, number> | null = null;
    async function refresh() {
      if (pending) return;
      pending = true;
      try {
        const snapshot = await api<Snapshot>("/admin/order-alerts");
        if (!alive) return;
        const changed =
          seen !== null &&
          snapshot.some(
            (order) =>
              !seen!.has(order.id) || order.messageId > seen!.get(order.id)!,
          );
        // Retain high-water marks even when orders close or are reopened.
        seen ??= new Map();
        for (const order of snapshot) {
          seen.set(
            order.id,
            Math.max(seen.get(order.id) ?? 0, order.messageId),
          );
        }
        if (changed) ring();
      } catch {
        // Keep the last successful baseline; normal order loading reports errors.
      } finally {
        pending = false;
      }
    }
    void refresh();
    const timer = setInterval(refresh, 5000);
    const events = new EventSource("/api/admin/events");
    events.addEventListener("change", refresh);
    return () => {
      alive = false;
      clearInterval(timer);
      events.close();
    };
  }, [active]);

  useEffect(
    () => () => {
      void audio.current?.close();
    },
    [],
  );
  return { soundEnabled, soundError, toggleSound };
}
