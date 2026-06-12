# Vision Providers in Specter

Specter uses a flexible vision layer to understand desktop applications and identify UI elements. This document explains how to configure and use the available vision providers.

## Available Providers

- **NVIDIA (Default)**: Uses NVIDIA NIM (specifically `meta/llama-4-maverick-17b-128e-instruct`). This is the primary provider for production-grade UI understanding.
- **Anthropic**: Uses Claude Vision as a fallback or alternative.
- **Mock**: Used for development and testing without making real API calls.

## Configuration

All configuration is handled via environment variables in your local `.env` file.

### NVIDIA NIM (Llama 4 Maverick)

To use NVIDIA as your provider:

1. Obtain an API key from [NVIDIA Build](https://build.nvidia.com/).
2. Add it to your `.env`:
   ```env
   NVIDIA_API_KEY=<your_key_here>
   NVIDIA_CHAT_COMPLETIONS_URL=https://integrate.api.nvidia.com/v1/chat/completions
   NVIDIA_VISION_MODEL=meta/llama-4-maverick-17b-128e-instruct
   VISION_PROVIDER=nvidia
   ```
3. (Optional) Adjust request behavior:
   ```env
   NVIDIA_VISION_TIMEOUT_MS=20000
   NVIDIA_VISION_STREAM=false
   NVIDIA_VISION_MAX_TOKENS=1200
   NVIDIA_VISION_TEMPERATURE=0.1
   NVIDIA_VISION_TOP_P=1
   NVIDIA_VISION_FREQUENCY_PENALTY=0
   NVIDIA_VISION_PRESENCE_PENALTY=0
   ```

### Anthropic Claude

To use Anthropic:

1. Add your key to `.env`:
   ```env
   ANTHROPIC_API_KEY=sk-ant-...
   VISION_PROVIDER=anthropic
   ```

### Fallback Configuration

You can enable automatic fallback from NVIDIA to Anthropic if the NVIDIA API fails:

```env
VISION_FALLBACK_ENABLED=true
```

## Security

- **API Keys**: Never commit your `.env` file or hardcode API keys. The `scripts/security-check.ts` runs during build/test to prevent accidental leaks.
- **Renderer Safety**: API keys are only accessible in the Electron main process. They are never exposed to the renderer window, preload scripts, or IPC responses.
- **Data Privacy**: When using NVIDIA or Anthropic providers, screenshots are sent to their respective APIs for analysis.

## Development and Testing

### Mock Provider

To work offline or avoid API costs during UI development:

```env
VISION_PROVIDER=mock
```

_Note: The mock provider is blocked in production unless `DEMO_MODE=true` is set._

### Test Scripts

Run the offline vision test in clean checkouts and CI:

```bash
npm run test:vision
```

This does not require API keys. It verifies the NVIDIA request payload, default non-streaming behavior, parser validation, missing-key behavior, invalid JSON errors, and mock-provider production gating.

Run the live NVIDIA smoke test only after configuring `NVIDIA_API_KEY`:

```bash
npm run test:vision:live
```

The live test analyzes `test/fixtures/screenshot.png` and prints provider, model, latency, summary, element count, and warnings without printing the key or base64 payload.

## Troubleshooting

- **PROVIDER_NOT_CONFIGURED**: Check if `NVIDIA_API_KEY` is set in `.env`.
- **PROVIDER_PARSE_ERROR**: The model returned invalid JSON. Check logs for the raw response if in development.
- **Coordinate Precision**: Llama 4 Maverick is excellent at understanding structure, but coordinate precision may vary. Always validate coordinates before performing destructive automation.
