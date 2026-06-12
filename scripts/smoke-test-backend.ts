import "dotenv/config";
import { checkAIHealth } from "../src/main/ai/health";
import { transcribe } from "../src/main/ai/whisper";
import { speak } from "../src/main/ai/tts";

async function runSmokeTest() {
  console.log("== [AI_HEALTH] SMOKE TEST ==");
  try {
    const health = await checkAIHealth();
    console.log(JSON.stringify(health, null, 2));
  } catch (err) {
    console.error("Health check failed:", err);
  }

  console.log("\n== [TTS] SMOKE TEST (Checking Fallback/ElevenLabs) ==");
  try {
    // We won't actually speak because we're in a headless environment,
    // but we can check if it tries to call ElevenLabs or macOS say.
    // Actually, speak() calls spawn('say' or 'afplay').
    // We can just check the logs it produces.
    console.log('Calling speak("Specter test")...');
    await speak("Specter test");
  } catch (err) {
    console.error("TTS test failed:", err);
  }

  console.log("\n== [WHISPER] SMOKE TEST (Checking Key/Config) ==");
  try {
    // Empty buffer test
    const result = await transcribe(Buffer.alloc(0));
    console.log("Empty buffer result:", result);
  } catch (err) {
    console.error("Whisper test failed:", err);
  }
}

runSmokeTest();
