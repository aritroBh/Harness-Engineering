export class MicError extends Error {
  userMessage: string;
  constructor(message: string, userMessage: string) {
    super(message);
    this.name = "MicError";
    this.userMessage = userMessage;
  }
}

function classifyGetUserMediaError(error: unknown): MicError {
  const name = (error instanceof Error ? error.name : "") || "";
  const message =
    (error instanceof Error ? error.message : String(error)) || "";

  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return new MicError(
      message,
      "Microphone permission denied. Allow access in System Preferences.",
    );
  }
  if (
    name === "NotReadableError" ||
    name === "AbortError" ||
    message.toLowerCase().includes("failed to allocate") ||
    message.toLowerCase().includes("could not start")
  ) {
    return new MicError(
      message,
      "Microphone unavailable. Close other voice apps (e.g. ChatGPT voice, Meet) and try again.",
    );
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return new MicError(
      message,
      "No microphone found. Plug in a mic and try again.",
    );
  }
  if (name === "SecurityError") {
    return new MicError(
      message,
      "Microphone access blocked by security policy.",
    );
  }
  return new MicError(
    message,
    "Microphone unavailable. Check permission and try again.",
  );
}

export class MicRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private mimeType = "audio/webm";
  private startedAt = 0;
  isRecording = false;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array<ArrayBuffer> | null = null;
  private stopPromise: Promise<ArrayBuffer> | null = null;

  private chooseMimeType(): string | undefined {
    if (typeof MediaRecorder.isTypeSupported !== "function") return undefined;

    for (const mimeType of ["audio/webm;codecs=opus", "audio/webm"]) {
      if (MediaRecorder.isTypeSupported(mimeType)) return mimeType;
    }

    return undefined;
  }

  private stopTracks(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  async start(): Promise<void> {
    console.log("[MIC] start requested");

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new MicError(
        "Microphone capture is not available in this browser context.",
        "Microphone capture is not available. Check browser permissions.",
      );
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      const micError = classifyGetUserMediaError(error);
      console.error("[MIC] getUserMedia failed", {
        name: (error as any)?.name,
        userMessage: micError.userMessage,
      });
      throw micError;
    }
    console.log("[MIC] permission granted");

    const mimeType = this.chooseMimeType();
    const options = mimeType ? { mimeType } : undefined;

    this.chunks = [];
    this.stream = stream;
    try {
      this.mediaRecorder = new MediaRecorder(stream, options);
    } catch (error) {
      this.stopTracks();
      throw classifyGetUserMediaError(error);
    }
    this.mimeType = this.mediaRecorder.mimeType || mimeType || "audio/webm";
    this.mediaRecorder.ondataavailable = (e) => {
      console.log("[MIC] data chunk received", { size: e.data.size });
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.onerror = (event) => {
      console.error("[MIC] recorder error", event);
    };
    this.mediaRecorder.start(250);
    this.startedAt = Date.now();
    this.isRecording = true;
    this.stopPromise = null;

    try {
      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;
      this.analyser.smoothingTimeConstant = 0.7;
      source.connect(this.analyser);
      this.dataArray = new Uint8Array(
        this.analyser.frequencyBinCount,
      ) as Uint8Array<ArrayBuffer>;
      console.log("[MIC] waveform analyser active");
    } catch (error) {
      console.warn("[MIC] analyser setup failed", error);
    }
  }

  getAudioLevels(): Uint8Array | null {
    if (!this.analyser || !this.dataArray) return null;
    this.analyser.getByteFrequencyData(this.dataArray as any);
    return this.dataArray;
  }

  async stop(): Promise<ArrayBuffer> {
    console.log("[MIC] stop requested");

    // Idempotent: concurrent stop() calls (cancel + confirm racing) share one
    // promise instead of overwriting onstop and stranding the first caller.
    if (this.stopPromise) return this.stopPromise;
    this.stopPromise = this.doStop();
    return this.stopPromise;
  }

  private async doStop(): Promise<ArrayBuffer> {
    if (this.audioContext && this.audioContext.state !== "closed") {
      try {
        await this.audioContext.close();
      } catch (_) {
        /* ignore */
      }
    }
    this.audioContext = null;
    this.analyser = null;
    this.dataArray = null;

    const recorder = this.mediaRecorder;
    if (!recorder) {
      this.isRecording = false;
      this.stopTracks();
      return new ArrayBuffer(0);
    }

    const elapsedMs = Date.now() - this.startedAt;
    if (elapsedMs < 300) {
      await new Promise((resolve) =>
        window.setTimeout(resolve, 300 - elapsedMs),
      );
    }

    return new Promise((resolve) => {
      const finish = async () => {
        const blob = new Blob(this.chunks, { type: this.mimeType });
        console.log("[MIC] final blob size", { size: blob.size });
        const buffer = await blob.arrayBuffer();
        this.isRecording = false;
        this.mediaRecorder = null;
        this.chunks = [];
        this.stopTracks();
        resolve(buffer);
      };

      recorder.onstop = finish;

      if (recorder.state === "inactive") {
        void finish();
        return;
      }

      try {
        recorder.requestData();
      } catch (error) {
        console.warn("[MIC] requestData failed before stop", error);
      }

      recorder.stop();
    });
  }
}
