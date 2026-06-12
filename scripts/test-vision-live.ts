import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { NvidiaVisionProvider } from "../src/main/vision/nvidiaVisionProvider";
import { VisionAnalyzeInput } from "../src/main/vision/types";

dotenv.config();

async function main(): Promise<void> {
  console.log("--- NVIDIA Vision Live Test ---");

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey || apiKey === "your_nvidia_api_key_here") {
    console.error("Error: NVIDIA_API_KEY is not set in .env");
    process.exit(1);
  }

  const fixturePath = path.resolve(
    __dirname,
    "../test/fixtures/screenshot.png",
  );

  if (!fs.existsSync(fixturePath)) {
    console.error("Error: test/fixtures/screenshot.png is missing");
    process.exit(1);
  }

  const imageBase64 = fs.readFileSync(fixturePath).toString("base64");
  const provider = new NvidiaVisionProvider();
  const input: VisionAnalyzeInput = {
    imageBase64,
    mimeType: "image/png",
    task: "target_detection",
    userPrompt: "Find any buttons",
  };

  try {
    const startTime = Date.now();
    const result = await provider.analyze(input);
    const duration = Date.now() - startTime;

    console.log("\n--- Result ---");
    console.log(`Provider: ${result.provider}`);
    console.log(`Model: ${result.model}`);
    console.log(`Latency: ${duration}ms (reported: ${result.latencyMs}ms)`);
    console.log(`Summary: ${result.summary}`);
    console.log(`Element count: ${result.elements.length}`);

    if (result.elements.length > 0) {
      console.log("Top Elements:");
      result.elements.slice(0, 3).forEach((element, index) => {
        console.log(
          `  ${index + 1}. ${element.label} (${element.type || "unknown"}) at [${element.center?.x ?? "?"}, ${element.center?.y ?? "?"}]`,
        );
      });
    }

    if (result.warnings.length > 0) {
      console.log("Warnings:");
      result.warnings.forEach((warning) => console.log(`  - ${warning}`));
    }

    console.log("\nSUCCESS: NVIDIA Vision API call completed.");
  } catch (error: any) {
    console.error("\n--- Error ---");
    console.error(`Code: ${error.code || "UNKNOWN"}`);
    console.error(`Message: ${error.message}`);
    if (error.safeDetails) {
      console.error(`Details: ${error.safeDetails}`);
    }
    process.exit(1);
  }
}

main();
