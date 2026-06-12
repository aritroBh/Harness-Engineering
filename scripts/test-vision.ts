import { NvidiaVisionProvider } from "../src/main/vision/nvidiaVisionProvider";
import { MockVisionProvider } from "../src/main/vision/mockVisionProvider";
import { parseVisionJson } from "../src/main/vision/json";
import { VisionAnalyzeInput } from "../src/main/vision/types";

const DEFAULT_NVIDIA_ENDPOINT =
  "https://integrate.api.nvidia.com/v1/chat/completions";
const DEFAULT_NVIDIA_MODEL = "meta/llama-4-maverick-17b-128e-instruct";

type FetchCapture = {
  url: string;
  init?: RequestInit;
  body: any;
};

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
let passed = 0;

function restoreEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, originalEnv);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
  passed++;
  console.log(`PASS ${message}`);
}

async function expectVisionError(
  fn: () => Promise<unknown>,
  code: string,
  message: string,
): Promise<void> {
  try {
    await fn();
  } catch (error: any) {
    assert(error?.code === code, message);
    return;
  }

  throw new Error(`Expected ${code}`);
}

function baseInput(): VisionAnalyzeInput {
  return {
    imageBase64: "ZmFrZS1wbmctYnl0ZXM=",
    mimeType: "image/png",
    task: "target_detection",
    userPrompt: "Find the primary button",
    screenshotWidth: 1280,
    screenshotHeight: 720,
  };
}

function installNvidiaFetchMock(content: string, status = 200): FetchCapture[] {
  const captures: FetchCapture[] = [];

  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const body =
      typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
    captures.push({ url: String(url), init, body });

    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({
        choices: [
          {
            message: {
              content,
            },
          },
        ],
      }),
      text: async () => "mock NVIDIA error",
    } as Response;
  }) as typeof fetch;

  return captures;
}

async function testNvidiaPayload(): Promise<void> {
  restoreEnv();
  process.env.NVIDIA_API_KEY = "unit-test-key";
  delete process.env.NVIDIA_CHAT_COMPLETIONS_URL;
  delete process.env.NVIDIA_INVOKE_URL;
  delete process.env.NVIDIA_VISION_MODEL;
  delete process.env.NVIDIA_VISION_STREAM;

  const captures = installNvidiaFetchMock(
    JSON.stringify({
      summary: "Browser window with a button",
      elements: [
        {
          label: "Continue",
          type: "button",
          confidence: 0.93,
          bbox: { x: 100, y: 120, width: 180, height: 44 },
          center: { x: 190, y: 142 },
        },
      ],
      warnings: [],
    }),
  );

  const result = await new NvidiaVisionProvider().analyze(baseInput());
  const request = captures[0];
  assert(request.url === DEFAULT_NVIDIA_ENDPOINT, "NVIDIA endpoint is correct");
  assert(
    request.body.model === DEFAULT_NVIDIA_MODEL,
    "NVIDIA model is correct",
  );
  assert(request.body.stream === false, "NVIDIA stream=false by default");
  assert(
    request.body.messages[0].content.some((part: any) => part.type === "text"),
    "NVIDIA payload includes text content",
  );
  assert(
    request.body.messages[0].content.some(
      (part: any) =>
        part.type === "image_url" &&
        part.image_url?.url.startsWith("data:image/png;base64,"),
    ),
    "NVIDIA payload includes image_url data URL",
  );
  assert(result.elements.length === 1, "NVIDIA mocked response parses");
}

async function testNvidiaMissingKey(): Promise<void> {
  restoreEnv();
  delete process.env.NVIDIA_API_KEY;

  await expectVisionError(
    () => new NvidiaVisionProvider().analyze(baseInput()),
    "PROVIDER_NOT_CONFIGURED",
    "missing NVIDIA key returns PROVIDER_NOT_CONFIGURED",
  );
}

async function testNvidiaInvalidJson(): Promise<void> {
  restoreEnv();
  process.env.NVIDIA_API_KEY = "unit-test-key";
  installNvidiaFetchMock("not valid json");

  await expectVisionError(
    () => new NvidiaVisionProvider().analyze(baseInput()),
    "PROVIDER_PARSE_ERROR",
    "invalid provider JSON returns PROVIDER_PARSE_ERROR",
  );
}

function testCoordinateValidation(): void {
  const parsed = parseVisionJson(
    JSON.stringify({
      summary: "Coordinate validation",
      elements: [
        {
          label: "Valid",
          bbox: { x: 10, y: 20, width: 30, height: 40 },
          center: { x: 25, y: 40 },
        },
        {
          label: "Negative",
          bbox: { x: -1, y: 20, width: 30, height: 40 },
          center: { x: -1, y: 40 },
        },
        {
          label: "Out of bounds",
          bbox: { x: 90, y: 20, width: 30, height: 40 },
          center: { x: 140, y: 40 },
        },
      ],
      warnings: [],
    }),
    "nvidia",
    { width: 100, height: 100 },
  );

  assert(parsed.elements[0].bbox?.x === 10, "valid bbox is preserved");
  assert(parsed.elements[0].center?.x === 25, "valid center is preserved");
  assert(!parsed.elements[1].bbox, "negative bbox is rejected");
  assert(!parsed.elements[1].center, "negative center is rejected");
  assert(!parsed.elements[2].bbox, "out-of-bounds bbox is rejected");
  assert(!parsed.elements[2].center, "out-of-bounds center is rejected");
}

async function testMockProductionGate(): Promise<void> {
  restoreEnv();
  process.env.NODE_ENV = "production";
  delete process.env.DEMO_MODE;

  await expectVisionError(
    () => new MockVisionProvider().analyze(baseInput()),
    "VISION_PROVIDER_NOT_ALLOWED",
    "mock provider is blocked in production",
  );

  process.env.DEMO_MODE = "true";
  const result = await new MockVisionProvider().analyze(baseInput());
  assert(
    result.provider === "mock",
    "mock provider is allowed in production only with DEMO_MODE=true",
  );
}

async function main(): Promise<void> {
  console.log("--- Vision Offline Tests ---");

  try {
    await testNvidiaPayload();
    await testNvidiaMissingKey();
    await testNvidiaInvalidJson();
    testCoordinateValidation();
    await testMockProductionGate();
  } finally {
    restoreEnv();
    globalThis.fetch = originalFetch;
  }

  console.log(`\n${passed} offline vision checks passed`);
}

main().catch((error) => {
  restoreEnv();
  globalThis.fetch = originalFetch;
  console.error(error);
  process.exit(1);
});
