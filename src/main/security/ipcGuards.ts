import { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { safeWarn } from "../logger";

export function validateSender(
  event: IpcMainInvokeEvent,
  allowedWindow: BrowserWindow | null,
): boolean {
  if (!allowedWindow || allowedWindow.isDestroyed()) {
    safeWarn(
      `[IPC_GUARD] Blocked channel ${event.sender.id}: target window is null or destroyed`,
    );
    return false;
  }

  if (event.sender.id !== allowedWindow.webContents.id) {
    safeWarn(
      `[IPC_GUARD] Blocked channel: sender ${event.sender.id} does not match allowed window ${allowedWindow.webContents.id}`,
    );
    return false;
  }

  return true;
}
