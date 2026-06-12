# ax-dump.ps1: walks the Windows UI Automation tree of a target app and emits
# a compact JSON list of elements with screen-space bounds. Mirrors the output
# schema of ax-dump.swift so the same TS picker works on either platform.
#
# Usage:
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File ax-dump.ps1 [<process-name>|<window-title>]
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File ax-dump.ps1 --frontmost-only
#
# When no argument is supplied, walks the foreground window's process.
# `--frontmost-only` is a fast probe: prints the foreground app's identity and
# exits without walking the AX tree. Used by the main process to capture the
# user's app *before* Specter's overlay steals focus.

param(
    [string]$AppArg = ""
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class WinNative {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll")]
    public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    public static readonly IntPtr DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = new IntPtr(-4);
}
"@

if ($AppArg -eq "--frontmost-only") {
    $hwnd = [WinNative]::GetForegroundWindow()
    if ($hwnd -eq [IntPtr]::Zero) {
        [Console]::Error.WriteLine("no-frontmost-app")
        exit 4
    }
    $procId = 0
    [void][WinNative]::GetWindowThreadProcessId($hwnd, [ref]$procId)
    $name = "unknown"
    try {
        $proc = Get-Process -Id $procId -ErrorAction Stop
        $name = $proc.ProcessName
    } catch {}
    $payload = @{
        bundleId = $null
        name     = $name
        pid      = [int]$procId
    } | ConvertTo-Json -Compress
    Write-Output $payload
    exit 0
}

# Match Electron's per-monitor DPI awareness so UIA's BoundingRectangle is
# returned in the same logical (DIP) coords as electron's screen.bounds.
# Without this, on a 150% scaled display the bounds come back 1.5x off and
# the cursor lands in the wrong place. SetProcessDpiAwarenessContext is a
# no-op on Windows 7/8 but harmless; the older fallback isn't needed because
# UIAutomation requires Vista+ anyway and modern Specter targets Win10+.
try {
    [void][WinNative]::SetProcessDpiAwarenessContext([WinNative]::DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2)
} catch {
    # Older Win10 builds may not have V2 context; ignore and continue.
}

function Resolve-Target([string]$arg) {
    $hwnd = [IntPtr]::Zero
    $appName = $arg
    $procId = 0

    if ([string]::IsNullOrEmpty($arg)) {
        $hwnd = [WinNative]::GetForegroundWindow()
        if ($hwnd -ne [IntPtr]::Zero) {
            [void][WinNative]::GetWindowThreadProcessId($hwnd, [ref]$procId)
            try {
                $appName = (Get-Process -Id $procId -ErrorAction Stop).ProcessName
            } catch {
                $appName = "unknown"
            }
        }
    } else {
        $proc = $null
        try {
            $proc = Get-Process -Name $arg -ErrorAction SilentlyContinue |
                Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } |
                Select-Object -First 1
        } catch { }

        if (-not $proc) {
            $proc = Get-Process | Where-Object {
                $_.MainWindowHandle -ne [IntPtr]::Zero -and
                $_.MainWindowTitle -and
                $_.MainWindowTitle.IndexOf($arg, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
            } | Select-Object -First 1
        }

        if ($proc) {
            $hwnd = $proc.MainWindowHandle
            $appName = $proc.ProcessName
            $procId = $proc.Id
        }
    }

    if ($hwnd -eq [IntPtr]::Zero) {
        return $null
    }

    return [pscustomobject]@{
        Hwnd    = $hwnd
        AppName = $appName
        Pid     = $procId
    }
}

$resolved = Resolve-Target $AppArg
if (-not $resolved) {
    [Console]::Error.WriteLine("not-found:$AppArg")
    exit 3
}

$ae = [System.Windows.Automation.AutomationElement]
$root = $ae::FromHandle($resolved.Hwnd)
if (-not $root) {
    [Console]::Error.WriteLine("ax-root-null:$($resolved.AppName)")
    exit 4
}

# Cache the properties we need so each child read does not round-trip across
# the UIA RPC boundary. This is the difference between sub-second and multi-
# second walks on large web-view apps like Edge or VSCode-on-Windows.
$cache = New-Object System.Windows.Automation.CacheRequest
$cache.Add($ae::NameProperty)
$cache.Add($ae::LocalizedControlTypeProperty)
$cache.Add($ae::ControlTypeProperty)
$cache.Add($ae::HelpTextProperty)
$cache.Add($ae::AutomationIdProperty)
$cache.Add($ae::BoundingRectangleProperty)
$cache.Add($ae::IsOffscreenProperty)
$cache.Add($ae::IsEnabledProperty)
$cache.TreeScope = [System.Windows.Automation.TreeScope]::Subtree
$cache.AutomationElementMode = [System.Windows.Automation.AutomationElementMode]::None

# ContentViewWalker filters out chrome-only nodes (scrollbars, layout
# spacers) so the picker sees the same logical surface a screen reader does.
$walker = [System.Windows.Automation.TreeWalker]::ContentViewWalker

$MAX_ELEMENTS = 4000
$MAX_DEPTH = 80
$elements = New-Object System.Collections.Generic.List[object]
$script:idx = 0

function Get-CachedString($elem, $prop) {
    try {
        $v = $elem.GetCachedPropertyValue($prop)
        if ($v -eq $null) { return "" }
        return [string]$v
    } catch {
        return ""
    }
}

function Get-CachedBool($elem, $prop) {
    try {
        $v = $elem.GetCachedPropertyValue($prop)
        if ($v -eq $null) { return $false }
        return [bool]$v
    } catch {
        return $false
    }
}

function Walk-Element($elem, [int]$depth) {
    if ($elements.Count -ge $script:MAX_ELEMENTS) { return }
    if ($depth -gt $script:MAX_DEPTH) { return }

    $rect = $null
    try {
        $rect = $elem.GetCachedPropertyValue($ae::BoundingRectangleProperty)
    } catch {
        $rect = $null
    }

    $offscreen = Get-CachedBool $elem $ae::IsOffscreenProperty
    $name = Get-CachedString $elem $ae::NameProperty
    $role = Get-CachedString $elem $ae::LocalizedControlTypeProperty
    $auto = Get-CachedString $elem $ae::AutomationIdProperty
    $help = Get-CachedString $elem $ae::HelpTextProperty

    $hasGeometry = $false
    $rx = 0.0; $ry = 0.0; $rw = 0.0; $rh = 0.0
    if ($rect -ne $null) {
        try {
            $rx = [double]$rect.X
            $ry = [double]$rect.Y
            $rw = [double]$rect.Width
            $rh = [double]$rect.Height
            $hasGeometry = ($rw -gt 0.5) -and ($rh -gt 0.5)
        } catch { $hasGeometry = $false }
    }

    $hasLabel = ($name.Length + $auto.Length + $help.Length) -gt 0

    if ($hasGeometry -and -not $offscreen -and ($hasLabel -or $role)) {
        $desc = if ($help) { $help } else { $auto }
        $element = [pscustomobject]@{
            i          = $script:idx
            role       = if ($role) { $role } else { "unknown" }
            title      = $name
            desc       = $desc
            value      = ""
            x          = $rx
            y          = $ry
            w          = $rw
            h          = $rh
            depth      = $depth
            actionable = $true
        }
        $elements.Add($element) | Out-Null
        $script:idx++
    }

    $child = $walker.GetFirstChild($elem)
    while ($child -ne $null) {
        Walk-Element $child ($depth + 1)
        if ($elements.Count -ge $script:MAX_ELEMENTS) { return }
        $child = $walker.GetNextSibling($child)
    }
}

$activate = $cache.Activate()
try {
    $cachedRoot = $root.GetUpdatedCache($cache)
    Walk-Element $cachedRoot 0
} finally {
    $activate.Dispose()
}

$result = [pscustomobject]@{
    app      = $resolved.AppName
    pid      = $resolved.Pid
    elements = $elements
}

# ConvertTo-Json with -Compress and a generous depth cap. PowerShell's
# default depth is 2 which would silently truncate.
$json = $result | ConvertTo-Json -Compress -Depth 8
[Console]::Out.WriteLine($json)
