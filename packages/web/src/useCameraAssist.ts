import { useEffect, useState } from "react";

export interface CameraAssistState {
  /** off = toggle disabled · starting = loading model/camera · active · error */
  status: "off" | "starting" | "active" | "error";
  error?: string;
  /** Face detected and roughly facing the screen. Defaults true when off. */
  present: boolean;
  /** Blinks in the trailing 60s, or null before the camera is running. */
  blinkRatePerMin: number | null;
}

const OFF: CameraAssistState = { status: "off", present: true, blinkRatePerMin: null };

/**
 * Opt-in webcam attention assist. Everything runs on-device: frames go from
 * the camera straight into MediaPipe's face landmarker in this tab — no video
 * is stored or uploaded anywhere. The model (~3 MB) and WASM runtime are
 * fetched lazily the first time the feature is switched on.
 *
 * "Present" combines face detection with a coarse head-turn check (nose
 * position between the face edges) — enough to know you looked away, not
 * which word you're reading. Blinks come from MediaPipe's eye blendshapes.
 */
export function useCameraAssist(enabled: boolean): CameraAssistState {
  const [state, setState] = useState<CameraAssistState>(OFF);

  useEffect(() => {
    if (!enabled) {
      setState(OFF);
      return;
    }
    let cancelled = false;
    let stream: MediaStream | null = null;
    let video: HTMLVideoElement | null = null;
    let landmarker: { detectForVideo: (v: HTMLVideoElement, t: number) => any; close?: () => void } | null = null;
    let timer: number | null = null;
    const blinkTimes: number[] = [];
    let eyesClosed = false;

    setState({ status: "starting", present: true, blinkRatePerMin: null });

    (async () => {
      try {
        const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
        const fileset = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
        );
        landmarker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU",
          },
          outputFaceBlendshapes: true,
          runningMode: "VIDEO",
          numFaces: 1,
        });
        if (cancelled) return;
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: "user" },
          audio: false,
        });
        if (cancelled) return;
        video = document.createElement("video");
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play();
        if (cancelled) return;
        setState({ status: "active", present: true, blinkRatePerMin: 0 });

        const tick = () => {
          if (cancelled || !video || !landmarker) return;
          try {
            const res = landmarker.detectForVideo(video, performance.now());
            const face = res.faceLandmarks?.[0];
            let present = false;
            if (face) {
              // Nose (1) sits between the face edges (234 / 454); a strong
              // asymmetry means the head is turned well away from the screen.
              const nose = face[1], edgeR = face[234], edgeL = face[454];
              if (nose && edgeR && edgeL) {
                const a = Math.abs(nose.x - edgeR.x);
                const b = Math.abs(edgeL.x - nose.x);
                const ratio = Math.max(a, b) / Math.max(1e-6, Math.min(a, b));
                present = ratio < 3.0;
              }
              const shapes = res.faceBlendshapes?.[0]?.categories ?? [];
              const score = (n: string) =>
                shapes.find((c: { categoryName: string; score: number }) => c.categoryName === n)?.score ?? 0;
              const closed = (score("eyeBlinkLeft") + score("eyeBlinkRight")) / 2 > 0.5;
              if (closed && !eyesClosed) blinkTimes.push(Date.now());
              eyesClosed = closed;
            }
            const cutoff = Date.now() - 60_000;
            while (blinkTimes.length && blinkTimes[0]! < cutoff) blinkTimes.shift();
            const rate = blinkTimes.length;
            setState((s) =>
              s.status === "active" && s.present === present && s.blinkRatePerMin === rate
                ? s
                : { status: "active", present, blinkRatePerMin: rate },
            );
          } catch {
            /* single-frame failures are fine */
          }
        };
        timer = window.setInterval(tick, 150);
      } catch (e) {
        if (!cancelled) {
          setState({
            status: "error",
            error: e instanceof Error ? e.message : String(e),
            present: true,
            blinkRatePerMin: null,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      if (timer !== null) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
      landmarker?.close?.();
    };
  }, [enabled]);

  return state;
}
