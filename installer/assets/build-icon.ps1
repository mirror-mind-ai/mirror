<#
.SYNOPSIS
    Render the Mirror Mind icon -- the product's diamond sign (◇) as an
    octahedron -- into mirror.ico (16..256) and the wizard's small image.

.DESCRIPTION
    Chosen 2026-10-16 over flat, lens, dialogue and typographic candidates:
    a solid with four visible faces in violet to indigo, no background plate,
    like Node's hexagon. Each size is rendered at that size (not scaled), so
    the edges stay crisp at 16 and 32. The .ico carries PNG-compressed
    images, which Windows reads at every size since Vista.
#>
Add-Type -AssemblyName System.Drawing
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
function C($a, $r, $g, $b) { [System.Drawing.Color]::FromArgb($a, $r, $g, $b) }
$v1 = C 255 168 132 232; $v2 = C 255 124 88 200; $v3 = C 255 80 52 150; $v4 = C 255 44 30 96; $v5 = C 255 24 16 60

function Render([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = "AntiAlias"; $g.Clear([System.Drawing.Color]::Transparent)
    $k = $size / 256.0
    function P([float]$x, [float]$y) { [Drawing.PointF]::new($x * $k, $y * $k) }
    function Face($pts, $c1, $c2) {
        $xs = $pts | ForEach-Object { $_.X }; $ys = $pts | ForEach-Object { $_.Y }
        $x0 = ($xs | Measure-Object -Minimum).Minimum; $y0 = ($ys | Measure-Object -Minimum).Minimum
        $r = [Drawing.RectangleF]::new($x0, $y0, 1 + ($xs | Measure-Object -Maximum).Maximum - $x0, 1 + ($ys | Measure-Object -Maximum).Maximum - $y0)
        $b = New-Object System.Drawing.Drawing2D.LinearGradientBrush $r, $c1, $c2, 60
        $g.FillPolygon($b, [Drawing.PointF[]]$pts)
    }
    # A little more margin at small sizes so the points do not clip.
    $m = if ($size -le 32) { 10 } else { 0 }
    Face @((P 128 (24 + $m)), (P 128 128), (P (36 + $m) 112)) $v1 $v2
    Face @((P 128 (24 + $m)), (P (220 - $m) 112), (P 128 128)) $v2 $v3
    Face @((P (36 + $m) 112), (P 128 128), (P 128 (232 - $m))) $v3 $v4
    Face @((P 128 128), (P (220 - $m) 112), (P 128 (232 - $m))) $v4 $v5
    if ($size -ge 48) {
        $pen = New-Object System.Drawing.Pen -ArgumentList (C 160 255 255 255), ([float][Math]::Max(1, 3 * $k))
        $g.DrawLine($pen, [float]((36 + $m) * $k), [float](112 * $k), [float](128 * $k), [float]((24 + $m) * $k))
    }
    $g.Dispose()
    return $bmp
}

# --- mirror.ico ---------------------------------------------------------
# Classic DIB entries (32-bit BGRA + AND mask) up to 64 px -- what every icon
# reader understands, Inno Setup and System.Drawing included -- and PNG
# entries at 128 and 256, the Vista+ convention. An .ico made of PNG only
# shows as noise in older readers (the Frame's icon did).
function DibBytes([System.Drawing.Bitmap]$bmp) {
    $w = $bmp.Width; $h = $bmp.Height
    $ms = New-Object IO.MemoryStream; $bw = New-Object IO.BinaryWriter $ms
    $bw.Write([uint32]40); $bw.Write([int32]$w); $bw.Write([int32]($h * 2)); $bw.Write([uint16]1); $bw.Write([uint16]32)
    $bw.Write([uint32]0); $bw.Write([uint32]($w * $h * 4)); $bw.Write([int32]0); $bw.Write([int32]0); $bw.Write([uint32]0); $bw.Write([uint32]0)
    for ($y = $h - 1; $y -ge 0; $y--) {
        for ($x = 0; $x -lt $w; $x++) {
            $c = $bmp.GetPixel($x, $y)
            $bw.Write([byte]$c.B); $bw.Write([byte]$c.G); $bw.Write([byte]$c.R); $bw.Write([byte]$c.A)
        }
    }
    $maskRow = [int][Math]::Ceiling($w / 32.0) * 4
    $bw.Write((New-Object byte[] ($maskRow * $h)))
    $bw.Flush(); return ,([byte[]]$ms.ToArray())
}
$sizes = @(16, 20, 24, 32, 40, 48, 64, 128, 256)
$entries = foreach ($sz in $sizes) {
    $bmp = Render $sz
    if ($sz -le 64) {
        [byte[]]$bytes = DibBytes $bmp
    } else {
        $ms = New-Object IO.MemoryStream; $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); [byte[]]$bytes = $ms.ToArray()
    }
    $bmp.Dispose()
    @{ size = $sz; bytes = $bytes }
}
$ico = New-Object IO.MemoryStream
$w = New-Object IO.BinaryWriter $ico
$w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]$entries.Count)
$offset = 6 + 16 * $entries.Count
foreach ($e in $entries) {
    $dim = if ($e.size -ge 256) { 0 } else { $e.size }
    $w.Write([byte]$dim); $w.Write([byte]$dim); $w.Write([byte]0); $w.Write([byte]0)
    $w.Write([uint16]1); $w.Write([uint16]32)
    $w.Write([uint32]$e.bytes.Length); $w.Write([uint32]$offset)
    $offset += $e.bytes.Length
}
foreach ($e in $entries) { $w.Write([byte[]]$e.bytes) }
$w.Flush()
[IO.File]::WriteAllBytes((Join-Path $here "mirror.ico"), $ico.ToArray())

# --- wizard-small.bmp: the wizard's top-right image, 55x58 and 110x116 (200%) --
foreach ($pair in @(@(55, 58, "wizard-small.bmp"), @(110, 116, "wizard-small-200.bmp"))) {
    $wd, $ht, $name = $pair
    $bmp = New-Object System.Drawing.Bitmap $wd, $ht
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::White)
    $g.InterpolationMode = "HighQualityBicubic"
    $icon = Render ([Math]::Min($wd, $ht))
    $g.DrawImage($icon, [int](($wd - $icon.Width) / 2), [int](($ht - $icon.Height) / 2))
    $bmp.Save((Join-Path $here $name), [System.Drawing.Imaging.ImageFormat]::Bmp)
    $g.Dispose(); $bmp.Dispose(); $icon.Dispose()
}
# A 256 preview for the README and the repo.
(Render 256).Save((Join-Path $here "mirror-256.png"), [System.Drawing.Imaging.ImageFormat]::Png)
"mirror.ico ({0} sizes), wizard-small.bmp, wizard-small-200.bmp, mirror-256.png" -f $entries.Count
