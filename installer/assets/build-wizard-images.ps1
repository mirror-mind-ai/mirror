<#
.SYNOPSIS
    Generate the Inno Setup wizard bitmaps from a Mirror repo illustration.

.DESCRIPTION
    Produces the 24-bit BMPs used by the installer wizard (see mirror.iss):
      * wizard-large.bmp (328x628, 164x314 aspect) - the Welcome/Finished panel.
        The full illustration is letterboxed ("contain") on a white panel.
      * wizard-banner.bmp (900x300, 3:1) - a horizontal banner placed at the top
        of the final identity page (a custom TBitmapImage), where a landscape
        illustration reads well instead of a tiny corner thumbnail.

    Source defaults to the README hero image
    (docs/assets/mirror-mind-contractor-team-1200px.jpg). Override with -Source.

    Run:  pwsh -File installer\assets\build-wizard-images.ps1
#>
[CmdletBinding()]
param(
    [string]$Source
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent (Split-Path -Parent $here)
if (-not $Source) {
    $Source = Join-Path $repoRoot 'docs\assets\mirror-mind-contractor-team-1200px.jpg'
}
if (-not (Test-Path -LiteralPath $Source)) { throw "Source image not found: $Source" }

function New-WizardBitmap {
    param(
        [Parameter(Mandatory)][string]$SourcePath,
        [Parameter(Mandatory)][string]$OutPath,
        [Parameter(Mandatory)][int]$Width,
        [Parameter(Mandatory)][int]$Height,
        [ValidateSet('contain', 'cover')][string]$Fit = 'contain'
    )
    $src = [System.Drawing.Image]::FromFile($SourcePath)
    try {
        $bmp = New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        try {
            $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $g.Clear([System.Drawing.Color]::White)

            if ($Fit -eq 'contain') {
                # Scale the whole image to fit inside the canvas, centered.
                $scale = [Math]::Min($Width / $src.Width, $Height / $src.Height)
                $dw = [int]($src.Width * $scale)
                $dh = [int]($src.Height * $scale)
                $dx = [int](($Width - $dw) / 2)
                $dy = [int](($Height - $dh) / 2)
                $g.DrawImage($src, $dx, $dy, $dw, $dh)
            } else {
                # Cover: crop the source to the target aspect, centered, then fill.
                $targetAspect = $Width / $Height
                $srcAspect = $src.Width / $src.Height
                if ($srcAspect -gt $targetAspect) {
                    $cropH = $src.Height
                    $cropW = [int]($src.Height * $targetAspect)
                } else {
                    $cropW = $src.Width
                    $cropH = [int]($src.Width / $targetAspect)
                }
                $cropX = [int](($src.Width - $cropW) / 2)
                $cropY = [int](($src.Height - $cropH) / 2)
                $srcRect = New-Object System.Drawing.Rectangle($cropX, $cropY, $cropW, $cropH)
                $dstRect = New-Object System.Drawing.Rectangle(0, 0, $Width, $Height)
                $g.DrawImage($src, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
            }
        } finally {
            $g.Dispose()
        }
        $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Bmp)
        $bmp.Dispose()
        Write-Host ("wrote {0} ({1}x{2}, {3})" -f $OutPath, $Width, $Height, $Fit)
    } finally {
        $src.Dispose()
    }
}

New-WizardBitmap -SourcePath $Source -OutPath (Join-Path $here 'wizard-large.bmp') -Width 328 -Height 628 -Fit 'contain'
New-WizardBitmap -SourcePath $Source -OutPath (Join-Path $here 'wizard-banner.bmp') -Width 900 -Height 300 -Fit 'cover'
