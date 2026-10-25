# Created by: Brennan Meyer with use of Claude Code 10/25/2026 Santa Clarita, CA
# brennanmmeyer@gmail.com
<#
.SYNOPSIS
  Launch a program, drive it a little, and capture ONLY its own window to PNG.

.DESCRIPTION
  1. Starts -Exe (optional -ArgList / -WorkDir).
  2. Waits -Wait seconds, then polls for the window: the process's MainWindowHandle,
     or any visible top-level window owned by the process or its children, or any
     window whose title matches -TitleMatch (EnumWindows).
  3. Optionally resizes it (-Size 1400x900) and runs -Steps (see below).
  4. Captures with PrintWindow(PW_RENDERFULLCONTENT). If that comes back black,
     brings the window to the front and uses CopyFromScreen of the window rect.
  5. Closes the program (CloseMainWindow, then Stop-Process on the whole tree).

  -Steps is a list of small commands, run in order (coords are window-client pixels):
     sleep:2.5                 wait seconds
     keys:^+b                  SendKeys syntax (^ ctrl, + shift, % alt, {ENTER} ...)
     tap:Enter / tap:ControlKey+S   real key press with scan code (use for games)
     hold:W,1500               hold a key for N ms
     type:hello world          literal text (special SendKeys chars are escaped)
     paste:C:\path\file.txt    put file text on the clipboard, send Ctrl+V
     click:x,y                 left click
     rclick:x,y                right click
     dclick:x,y                double click
     drag:x1,y1;x2,y2;...      press at first point, move through the rest, release
     wheel:x,y,n               mouse wheel n notches (negative = down/out)
     move:x,y                  move mouse
     front                     bring window to front
     shot:C:\path\out.png      capture now (several shots per run are fine)
  If no shot: step is given, one capture is saved to -Out at the end.

  -Attach     drive an already-running copy instead of launching (matched by -Exe path,
              or by -TitleMatch, which also finds console windows and owned dialogs).
  -NoClose    leave the program running afterwards (pair with -Attach for multi-step work).
  -ForceScreen  skip PrintWindow and always screen-copy the window.
  Console apps: launch C:\Windows\System32\conhost.exe with the app as -ArgList to get a
  classic console window of their own.

.EXAMPLE
  .\capture-window.ps1 -Exe "C:\Apps\Foo.exe" -Wait 5 -Out C:\shots\foo.png -Steps "keys:^n","sleep:1"
#>
param(
  [Parameter(Mandatory)][string]$Exe,
  [string]$ArgList = "",
  [string]$WorkDir = "",
  [string]$Out = "",
  [double]$Wait = 4,
  [int]$FindTimeout = 60,
  [string]$TitleMatch = "",
  [string]$Size = "",
  [string[]]$Steps = @(),
  [switch]$NoClose,
  [switch]$Attach,
  [switch]$ForceScreen
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing, System.Windows.Forms

if (-not ("CapWin.Native" -as [type])) {
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
namespace CapWin {
public static class Native {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int hh, bool repaint);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, int dx, int dy, int data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint f, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr v);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int attr, out RECT r, int size);

  public static string Title(IntPtr h) { var sb = new StringBuilder(512); GetWindowText(h, sb, 512); return sb.ToString(); }

  // All visible, unowned top-level windows: handle, pid, title, area
  public static List<object[]> TopWindows(bool includeOwned = false) {
    var list = new List<object[]>();
    EnumWindows((h, p) => {
      if (!IsWindowVisible(h)) return true;
      if (!includeOwned && GetWindow(h, 4) != IntPtr.Zero) return true; // GW_OWNER: skip owned popups
      uint pid; GetWindowThreadProcessId(h, out pid);
      RECT r; GetWindowRect(h, out r);
      long area = (long)(r.R - r.L) * (r.B - r.T);
      list.Add(new object[] { h, (int)pid, Title(h), area });
      return true;
    }, IntPtr.Zero);
    return list;
  }

  // Visible frame (no invisible resize borders / shadow)
  public static RECT Frame(IntPtr h) {
    RECT r;
    if (DwmGetWindowAttribute(h, 9, out r, Marshal.SizeOf(typeof(RECT))) != 0) GetWindowRect(h, out r);
    return r;
  }

  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint MapVirtualKey(uint code, uint type);
  // key down/up with a real scan code (games such as Godot ignore SendKeys)
  public static void Key(byte vk, bool up) {
    byte sc = (byte)MapVirtualKey(vk, 0);
    uint ext = (vk >= 0x21 && vk <= 0x2E) ? 1u : 0u; // arrows, home/end, ins/del are extended keys
    keybd_event(vk, sc, (up ? 2u : 0u) | ext, UIntPtr.Zero);
  }
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool attach);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr h, bool alt);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();

  public static bool Front(IntPtr h) {
    for (int i = 0; i < 5; i++) {
      if (IsIconic(h)) ShowWindow(h, 9);
      IntPtr fg = GetForegroundWindow();
      if (fg == h) return true;
      uint dummy;
      uint fgThread = GetWindowThreadProcessId(fg, out dummy);
      uint me = GetCurrentThreadId();
      keybd_event(0x12, 0, 0, UIntPtr.Zero); keybd_event(0x12, 0, 2, UIntPtr.Zero); // ALT tap unlocks foreground
      AttachThreadInput(me, fgThread, true);
      BringWindowToTop(h); SetForegroundWindow(h);
      AttachThreadInput(me, fgThread, false);
      if (GetForegroundWindow() != h) SwitchToThisWindow(h, true);
      System.Threading.Thread.Sleep(150);
    }
    return GetForegroundWindow() == h;
  }
}}
"@
}

try { [void][CapWin.Native]::SetProcessDpiAwarenessContext([IntPtr](-4)) } catch { [void][CapWin.Native]::SetProcessDPIAware() }

function Get-Tree([int]$rootPid) {
  $all = Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId
  $set = [System.Collections.Generic.HashSet[int]]::new(); [void]$set.Add($rootPid)
  $changed = $true
  while ($changed) {
    $changed = $false
    foreach ($p in $all) { if ($set.Contains([int]$p.ParentProcessId) -and $set.Add([int]$p.ProcessId)) { $changed = $true } }
  }
  return $set
}

function Find-Window([System.Diagnostics.Process]$proc) {
  $deadline = (Get-Date).AddSeconds($FindTimeout)
  while ((Get-Date) -lt $deadline) {
    $proc.Refresh()
    if (-not $proc.HasExited -and $proc.MainWindowHandle -ne [IntPtr]::Zero -and -not $TitleMatch) { return $proc.MainWindowHandle }
    $tree = if ($proc.HasExited) { @() } else { @(Get-Tree $proc.Id) }
    $cands = [CapWin.Native]::TopWindows([bool]$TitleMatch) | Where-Object {
      ($_[3] -gt 40000) -and (
        ($TitleMatch -and $_[2] -match $TitleMatch) -or
        (-not $TitleMatch -and ($tree -contains [int]$_[1]))
      )
    } | Sort-Object { $_[3] } -Descending
    if ($cands) { return [IntPtr]$cands[0][0] }
    Start-Sleep -Milliseconds 500
  }
  throw "No window found for $Exe within $FindTimeout s"
}

# PrintWindow(PW_RENDERFULLCONTENT) into a bitmap, cropped to the visible frame
function Get-PrintWin([IntPtr]$h) {
  $wr = New-Object CapWin.Native+RECT; [void][CapWin.Native]::GetWindowRect($h, [ref]$wr)
  $fr = [CapWin.Native]::Frame($h)
  $w = $wr.R - $wr.L; $hh = $wr.B - $wr.T
  if ($w -le 0 -or $hh -le 0) { return $null }
  $full = New-Object System.Drawing.Bitmap $w, $hh
  $g = [System.Drawing.Graphics]::FromImage($full)
  $hdc = $g.GetHdc(); [void][CapWin.Native]::PrintWindow($h, $hdc, 2); $g.ReleaseHdc($hdc); $g.Dispose()
  $crop = New-Object System.Drawing.Rectangle ($fr.L - $wr.L), ($fr.T - $wr.T), ($fr.R - $fr.L), ($fr.B - $fr.T)
  $crop.Intersect((New-Object System.Drawing.Rectangle 0, 0, $w, $hh))
  $outBmp = $full.Clone($crop, $full.PixelFormat); $full.Dispose()
  return $outBmp
}

# Screen copy of the visible frame (window must be in front)
function Get-ScreenGrab([IntPtr]$h) {
  $fr = [CapWin.Native]::Frame($h)
  $w = $fr.R - $fr.L; $hh = $fr.B - $fr.T
  if ($w -le 0 -or $hh -le 0) { return $null }
  $b = New-Object System.Drawing.Bitmap $w, $hh
  $g = [System.Drawing.Graphics]::FromImage($b)
  $g.CopyFromScreen($fr.L, $fr.T, 0, 0, (New-Object System.Drawing.Size $w, $hh)); $g.Dispose()
  return $b
}

# Fraction of sampled pixels that are (near) black
function Get-BlackRatio($b) {
  $n = 0; $dark = 0
  $sx = [Math]::Max(1, [int]($b.Width / 40)); $sy = [Math]::Max(1, [int]($b.Height / 40))
  for ($y = [int]($sy / 2); $y -lt $b.Height; $y += $sy) {
    for ($x = [int]($sx / 2); $x -lt $b.Width; $x += $sx) {
      $c = $b.GetPixel($x, $y); $n++
      if ($c.R -lt 6 -and $c.G -lt 6 -and $c.B -lt 6) { $dark++ }
    }
  }
  if ($n -eq 0) { return 1.0 } else { return $dark / $n }
}

function Save-Shot([IntPtr]$h, [string]$path) {
  $dir = Split-Path $path -Parent
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
  $bmp = $null; $how = "PrintWindow"
  if (-not $ForceScreen) { $bmp = Get-PrintWin $h }
  if (-not $bmp -or (Get-BlackRatio $bmp) -gt 0.97) {
    if ($bmp) { $bmp.Dispose() }
    (Set-Front $h); Start-Sleep -Milliseconds 700
    $bmp = Get-ScreenGrab $h; $how = "CopyFromScreen"
  }
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Host ("saved {0} ({1}x{2}, {3}, black={4:P0})" -f $path, $bmp.Width, $bmp.Height, $how, (Get-BlackRatio $bmp))
  $bmp.Dispose()
}

# key name (Enter, Space, W, F1, Escape, Tab, Up...) -> virtual-key code
function Get-VK([string]$name) { return [byte][int][System.Windows.Forms.Keys]$name }
function Set-Front([IntPtr]$h) { if (-not [CapWin.Native]::Front($h)) { Write-Warning 'could not bring window to front' } }
function To-Screen([IntPtr]$h, [int]$x, [int]$y) {
  $pt = New-Object CapWin.Native+POINT; $pt.X = $x; $pt.Y = $y
  [void][CapWin.Native]::ClientToScreen($h, [ref]$pt); return $pt
}
function Mouse([uint32]$flags, [int]$data = 0) { [CapWin.Native]::mouse_event($flags, 0, 0, $data, [UIntPtr]::Zero) }
function Escape-Keys([string]$t) { return ($t -replace '([+^%~(){}\[\]])', '{$1}') }

# ---- launch ----
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $Exe
$psi.Arguments = $ArgList
$psi.UseShellExecute = $true   # own console window for console apps
$psi.WorkingDirectory = if ($WorkDir) { $WorkDir } else { Split-Path $Exe -Parent }
if (-not $psi.WorkingDirectory) { $psi.WorkingDirectory = (Get-Location).Path }
$proc = $null
if ($Attach) {
  # reuse an already-running copy (matched by full exe path)
  if ($TitleMatch) {
    # match by window title (console windows have no MainWindowHandle)
    $w = [CapWin.Native]::TopWindows($true) | Where-Object { $_[2] -match $TitleMatch } | Select-Object -First 1
    if ($w) { $proc = Get-Process -Id $w[1] }
  } else {
    $proc = Get-Process | Where-Object { $_.Path -eq $Exe -and $_.MainWindowHandle -ne [IntPtr]::Zero } | Select-Object -First 1
  }
  if (-not $proc) { throw "No running window for $Exe to attach to" }
  Write-Host "attached pid $($proc.Id)"
} else {
  $proc = [System.Diagnostics.Process]::Start($psi)
  Write-Host "started pid $($proc.Id): $Exe $ArgList"
  Start-Sleep -Milliseconds ([int]($Wait * 1000))
}

$shell = New-Object -ComObject WScript.Shell
$tookShot = $false
try {
  $h = Find-Window $proc
  Write-Host ("window 0x{0:X} '{1}'" -f [int64]$h, [CapWin.Native]::Title($h))
  if ($Size -match '^(\d+)x(\d+)$') {
    $fr = [CapWin.Native]::Frame($h)
    [void][CapWin.Native]::MoveWindow($h, [Math]::Max(0, $fr.L), [Math]::Max(0, $fr.T), [int]$matches[1], [int]$matches[2], $true)
    Start-Sleep -Milliseconds 800
  }
  foreach ($s in $Steps) {
    $cmd, $arg = $s -split ':', 2
    switch ($cmd) {
      'sleep'  { Start-Sleep -Milliseconds ([int]([double]$arg * 1000)) }
      'front'  { (Set-Front $h); Start-Sleep -Milliseconds 300 }
      'keys'   { (Set-Front $h); Start-Sleep -Milliseconds 200; $shell.SendKeys($arg); Start-Sleep -Milliseconds 300 }
      'type'   { (Set-Front $h); Start-Sleep -Milliseconds 200; $shell.SendKeys((Escape-Keys $arg)); Start-Sleep -Milliseconds 300 }
      'paste'  {
        $old = try { Get-Clipboard -Raw } catch { $null }
        Set-Clipboard -Value (Get-Content -Raw $arg); (Set-Front $h); Start-Sleep -Milliseconds 200; $shell.SendKeys('^v'); Start-Sleep -Milliseconds 700
        if ($old) { Set-Clipboard -Value $old }   # put the user's clipboard back
      }
      'move'   { $x, $y = $arg -split ','; $p = To-Screen $h $x $y; [void][CapWin.Native]::SetCursorPos($p.X, $p.Y) }
      { $_ -in 'click', 'rclick', 'dclick' } {
        (Set-Front $h); Start-Sleep -Milliseconds 150
        $x, $y = $arg -split ','; $p = To-Screen $h $x $y; [void][CapWin.Native]::SetCursorPos($p.X, $p.Y); Start-Sleep -Milliseconds 80
        $n = if ($cmd -eq 'dclick') { 2 } else { 1 }
        for ($i = 0; $i -lt $n; $i++) {
          if ($cmd -eq 'rclick') { Mouse 0x08; Mouse 0x10 } else { Mouse 0x02; Start-Sleep -Milliseconds 40; Mouse 0x04 }
          Start-Sleep -Milliseconds 60
        }
        Start-Sleep -Milliseconds 300
      }
      'drag' {
        (Set-Front $h); Start-Sleep -Milliseconds 150
        $pts = $arg -split ';' | ForEach-Object { $x, $y = $_ -split ','; To-Screen $h $x $y }
        [void][CapWin.Native]::SetCursorPos($pts[0].X, $pts[0].Y); Start-Sleep -Milliseconds 60
        Mouse 0x02
        for ($i = 1; $i -lt $pts.Count; $i++) {
          $a = $pts[$i - 1]; $b = $pts[$i]
          for ($k = 1; $k -le 12; $k++) {
            [void][CapWin.Native]::SetCursorPos([int]($a.X + ($b.X - $a.X) * $k / 12), [int]($a.Y + ($b.Y - $a.Y) * $k / 12))
            Start-Sleep -Milliseconds 12
          }
        }
        Mouse 0x04; Start-Sleep -Milliseconds 200
      }
      'wheel' {
        (Set-Front $h)
        $x, $y, $n = $arg -split ','; $p = To-Screen $h $x $y; [void][CapWin.Native]::SetCursorPos($p.X, $p.Y)
        $n = [int]$n; $one = if ($n -lt 0) { -120 } else { 120 }
        for ($i = 0; $i -lt [Math]::Abs($n); $i++) { Mouse 0x0800 $one; Start-Sleep -Milliseconds 60 }
        Start-Sleep -Milliseconds 300
      }
      'tap'    { (Set-Front $h); foreach ($k in ($arg -split '\+')) { [CapWin.Native]::Key((Get-VK $k), $false) }; Start-Sleep -Milliseconds 60; foreach ($k in ($arg -split '\+')) { [CapWin.Native]::Key((Get-VK $k), $true) }; Start-Sleep -Milliseconds 250 }
      'hold'   { (Set-Front $h); $k, $ms = $arg -split ','; [CapWin.Native]::Key((Get-VK $k), $false); Start-Sleep -Milliseconds ([int]$ms); [CapWin.Native]::Key((Get-VK $k), $true); Start-Sleep -Milliseconds 150 }
      'shot'   { Save-Shot $h $arg; $tookShot = $true }
      default  { Write-Warning "unknown step '$s'" }
    }
  }
  if (-not $tookShot -and $Out) { Save-Shot $h $Out }
}
finally {
  if (-not $NoClose) {
    try { if (-not $proc.HasExited) { [void]$proc.CloseMainWindow(); [void]$proc.WaitForExit(3000) } } catch {}
    $tree = if ($proc.HasExited) { @() } else { Get-Tree $proc.Id }
    foreach ($id in $tree) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
    if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
    Write-Host "closed"
  }
}
