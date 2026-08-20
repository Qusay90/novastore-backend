[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9]{3}$')]
    [string]$ReferenceNumber,

    [Parameter(Mandatory = $true)]
    [string]$ReferencePath,

    [Parameter(Mandatory = $true)]
    [string]$OutputDirectory,

    [string]$Serial = 'emulator-5554',
    [string]$Adb = 'adb',
    [ValidateRange(0.0, 5.0)]
    [double]$MaximumDeltaPercent = 5.0,
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$ExpectedRoute,
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$ExpectedSemanticMarker,
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$ExpectedFixture,
    [string]$RuntimePath = '',
    [string]$CaptureManifestPath = '',
    [string]$ExpectedAvdName = 'novastore-seller-wave4-uat',
    [string]$LayoutSpecPath = '',
    [switch]$RequireUiIdle
)

$ErrorActionPreference = 'Stop'
$reference = (Resolve-Path -LiteralPath $ReferencePath).Path
$captureMode = if ([string]::IsNullOrWhiteSpace($RuntimePath)) { 'LIVE_ADB' } else { 'MANIFEST_BOUND_PRECAPTURED' }
$captureManifestHash = $null
$captureManifestRowHash = $null
$captureManifestRowAttestation = $null
$captureReceiptHash = $null
$captureReceiptAttestation = $null
$captureAvdName = $null
$captureApkHash = $null
$captureUtc = $null
$runtimeInputHash = $null
$runtimeInputLastWriteUtc = $null
$repositoryRoot = (Resolve-Path -LiteralPath '.').Path
$canonicalCatalogPath = Join-Path $repositoryRoot 'docs/seller/wave4/SELLER-WAVE4-CANONICAL-STATE-CATALOG.tsv'
$sourceMapPath = Join-Path $repositoryRoot 'docs/seller/wave4/SELLER-WAVE4-SVG-SOURCE-MAP.tsv'
$canonicalCatalog = Import-Csv -Delimiter "`t" -LiteralPath $canonicalCatalogPath -Encoding UTF8
$catalogRows = @($canonicalCatalog | Where-Object {
    @($_.canonical_references -split ',') -contains $ReferenceNumber
})
if ($catalogRows.Count -ne 1) {
    throw "Canonical evidence policy must contain exactly one row for ref $ReferenceNumber."
}
$catalogRow = $catalogRows[0]
$catalogFixture = if ($catalogRow.fixture_strategy -eq 'NO_FIXTURE') { 'none' } else { "seller-canonical-ref-$ReferenceNumber" }
if ($ExpectedRoute -ne $catalogRow.route -or $ExpectedSemanticMarker -ne $catalogRow.expected_semantic_markers -or $ExpectedFixture -ne $catalogFixture) {
    throw "Caller evidence expectations differ from committed canonical policy for ref $ReferenceNumber."
}
$sourceMap = Import-Csv -Delimiter "`t" -LiteralPath $sourceMapPath -Encoding UTF8
$sourceRows = @($sourceMap | Where-Object { $_.REFERENCE_ID -eq $ReferenceNumber })
if ($sourceRows.Count -ne 1) {
    throw "SVG source map must contain exactly one row for ref $ReferenceNumber."
}
if (-not (Test-Path -LiteralPath $Adb -PathType Leaf) -and -not (Get-Command $Adb -ErrorAction SilentlyContinue)) {
    throw "ADB bulunamadı: $Adb"
}
if (-not $RequireUiIdle) {
    throw 'UI-idle doğrulaması zorunludur.'
}
if ($ExpectedFixture -ne 'none' -and $ExpectedFixture -ne "seller-canonical-ref-$ReferenceNumber") {
    throw "Beklenen fixture ref ile bağlı değildir: $ExpectedFixture"
}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$output = (Resolve-Path -LiteralPath $OutputDirectory).Path
$rawRuntime = Join-Path $output "$ReferenceNumber-runtime-raw.png"
$normalizedRuntime = Join-Path $output "$ReferenceNumber-runtime.png"
$sideBySide = Join-Path $output "$ReferenceNumber-side-by-side.png"
$overlay = Join-Path $output "$ReferenceNumber-overlay.png"
$diff = Join-Path $output "$ReferenceNumber-diff.json"
$captureRecordPath = Join-Path $output "$ReferenceNumber-capture.json"

function Invoke-SellerAdbText {
    param([string[]]$Arguments)

    $processInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $processInfo.FileName = $Adb
    $processInfo.Arguments = ($Arguments -join ' ')
    $processInfo.UseShellExecute = $false
    $processInfo.RedirectStandardOutput = $true
    $processInfo.RedirectStandardError = $true
    $processInfo.CreateNoWindow = $true
    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $processInfo
    if (-not $process.Start()) { throw 'ADB UI durum sorgusu başlatılamadı.' }
    $standardOutput = $process.StandardOutput.ReadToEnd()
    $standardError = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { throw "ADB UI durum sorgusu başarısız: $standardError" }
    return $standardOutput
}

function Get-SellerTextSha256 {
    param([string]$Text)

    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        return ([System.BitConverter]::ToString(
            $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Text))
        )).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $sha.Dispose()
    }
}

function Resolve-SellerRepositoryPath {
    param([string]$RepositoryRelativePath)

    $normalizedRelativePath = $RepositoryRelativePath.Replace('\', '/')
    if ([System.IO.Path]::IsPathRooted($normalizedRelativePath)) {
        throw "Repository evidence path must be relative: $RepositoryRelativePath"
    }
    $candidate = [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot $normalizedRelativePath))
    $rootPrefix = $repositoryRoot.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
    if (-not $candidate.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Evidence path escaped the repository: $RepositoryRelativePath"
    }
    return $candidate
}

$canonicalReferenceSuffix = '/' + $sourceRows[0].PNG_PATH.Replace('\', '/')
if (-not $reference.Replace('\', '/').EndsWith($canonicalReferenceSuffix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "ReferencePath differs from the committed canonical PNG path for ref $ReferenceNumber."
}
$canonicalReferenceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $reference).Hash.ToLowerInvariant()
if ($sourceRows[0].PNG_SHA256 -ne $canonicalReferenceHash) {
    throw "Canonical PNG hash differs from the committed SVG source map for ref $ReferenceNumber."
}

$adbState = (Invoke-SellerAdbText -Arguments @('-s', $Serial, 'get-state')).Trim()
if ($adbState -ne 'device') {
    throw "Seller UAT AVD bağlı değil: serial=$Serial state=$adbState"
}
$actualAvdName = (Invoke-SellerAdbText -Arguments @('-s', $Serial, 'shell', 'getprop', 'ro.boot.qemu.avd_name')).Trim()
if ($actualAvdName -ne $ExpectedAvdName) {
    throw "Seller UAT AVD profili uyuşmuyor: expected=$ExpectedAvdName actual=$actualAvdName"
}
$sellerPackagePath = (Invoke-SellerAdbText -Arguments @('-s', $Serial, 'shell', 'pm', 'path', 'com.novastore.seller')).Trim()
if (-not $sellerPackagePath.StartsWith('package:')) {
    throw 'Seller test paketi doğrulanamadı.'
}
$sellerInstalledApkPath = $sellerPackagePath.Substring('package:'.Length)
if (
    -not $sellerInstalledApkPath.StartsWith('/data/app/', [System.StringComparison]::Ordinal) -or
    -not $sellerInstalledApkPath.EndsWith('/base.apk', [System.StringComparison]::Ordinal) -or
    $sellerInstalledApkPath -cmatch '[^A-Za-z0-9._=+~/-]'
) {
    throw "Seller installed APK path is unsafe: $sellerInstalledApkPath"
}
$sellerInstalledApkHashOutput = (Invoke-SellerAdbText -Arguments @(
    '-s', $Serial, 'shell', 'sha256sum', $sellerInstalledApkPath
)).Trim()
$sellerInstalledApkSha256 = ($sellerInstalledApkHashOutput -split '\s+')[0].ToLowerInvariant()
if ($sellerInstalledApkSha256 -notmatch '^[0-9a-f]{64}$') {
    throw 'Seller installed APK SHA-256 could not be verified.'
}
$sellerPackageDump = Invoke-SellerAdbText -Arguments @('-s', $Serial, 'shell', 'dumpsys', 'package', 'com.novastore.seller')
$sellerPackageIdentity = @(
    $sellerPackagePath
    $sellerPackageDump -split "`r?`n" |
        ForEach-Object { $_.Trim() } |
        Where-Object { $_ -match '^(versionCode=|versionName=|lastUpdateTime=|installerPackageName=)' } |
        Sort-Object -Unique
) -join "`n"
$sellerPackageFingerprint = Get-SellerTextSha256 -Text $sellerPackageIdentity

$expectedMarkers = @(
    $ExpectedSemanticMarker |
        ForEach-Object { $_ -split '\|' } |
        ForEach-Object { $_.Trim() } |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
)
if ($expectedMarkers.Count -eq 0) {
    throw 'En az bir bağlayıcı semantic marker zorunludur.'
}
$expectsFixture = $ExpectedFixture -ne 'none'
$uiIdle = $false
$wrongContext = $false
if (-not [string]::IsNullOrWhiteSpace($RuntimePath)) {
    $resolvedRuntime = (Resolve-Path -LiteralPath $RuntimePath).Path
    if ([string]::IsNullOrWhiteSpace($CaptureManifestPath)) {
        throw 'Pre-captured runtime evidence requires a capture manifest.'
    }
    $resolvedCaptureManifest = (Resolve-Path -LiteralPath $CaptureManifestPath).Path
    $captureManifestHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolvedCaptureManifest).Hash.ToLowerInvariant()
    $manifest = Import-Csv -Delimiter "`t" -LiteralPath $resolvedCaptureManifest -Encoding UTF8
    $manifestRow = @($manifest | Where-Object { $_.reference -eq $ReferenceNumber })
    if ($manifestRow.Count -ne 1) {
        throw "Capture manifest must contain exactly one row for ref $ReferenceNumber."
    }
    $expectedScreenshot = $manifestRow[0].screenshot.Replace('\', '/')
    $catalogScreenshot = $catalogRow.screenshot_path.Replace('\', '/')
    if ($expectedScreenshot -ne $catalogScreenshot) {
        throw "Capture manifest screenshot differs from committed canonical policy for ref $ReferenceNumber."
    }
    $resolvedExpectedRuntime = (Resolve-Path -LiteralPath (Resolve-SellerRepositoryPath -RepositoryRelativePath $expectedScreenshot)).Path
    if ($manifestRow[0].expected_route -ne $ExpectedRoute -or $manifestRow[0].actual_route -ne $ExpectedRoute) {
        throw "Capture manifest route mismatch for ref $ReferenceNumber."
    }
    if ($manifestRow[0].screenshot -ne $expectedScreenshot -or $resolvedRuntime -ne $resolvedExpectedRuntime) {
        throw "Capture manifest runtime path mismatch for ref $ReferenceNumber."
    }
    if (
        $manifestRow[0].state -ne $catalogRow.test_state -or
        $manifestRow[0].expected_markers -ne $ExpectedSemanticMarker -or
        $manifestRow[0].markers_found -ne $ExpectedSemanticMarker -or
        $manifestRow[0].expected_fixture -ne $ExpectedFixture -or
        $manifestRow[0].active_fixture -ne $ExpectedFixture -or
        $manifestRow[0].ui_idle -ne 'YES' -or
        $manifestRow[0].wrong_context -ne 'NO' -or
        $manifestRow[0].capture_valid -ne 'YES' -or
        $manifestRow[0].frame_stable -ne 'YES'
    ) {
        throw "Capture manifest validity gate failed for ref $ReferenceNumber."
    }
    $actualRoute = $manifestRow[0].actual_route
    $foundMarkers = @($manifestRow[0].markers_found -split '\|' | ForEach-Object { $_.Trim() })
    $activeFixture = $manifestRow[0].active_fixture
    $uiIdle = $manifestRow[0].ui_idle -eq 'YES'
    $wrongContext = $manifestRow[0].wrong_context -ne 'NO'
    $captureValid = $manifestRow[0].capture_valid -eq 'YES' -and $uiIdle -and -not $wrongContext
    $manifestRowPayload = @(
        $manifestRow[0].PSObject.Properties |
            ForEach-Object { "$($_.Name)=$($_.Value)" }
    ) -join "`n"
    $captureManifestRowHash = Get-SellerTextSha256 -Text $manifestRowPayload
    $captureManifestRowAttestation = [ordered]@{
        reference = $manifestRow[0].reference
        state = $manifestRow[0].state
        expected_route = $manifestRow[0].expected_route
        actual_route = $manifestRow[0].actual_route
        expected_markers = $manifestRow[0].expected_markers
        markers_found = $manifestRow[0].markers_found
        expected_fixture = $manifestRow[0].expected_fixture
        active_fixture = $manifestRow[0].active_fixture
        ui_idle = $manifestRow[0].ui_idle
        wrong_context = $manifestRow[0].wrong_context
        capture_valid = $manifestRow[0].capture_valid
        screenshot = $manifestRow[0].screenshot
        frame_stable = $manifestRow[0].frame_stable
        runtime_sha256 = $manifestRow[0].runtime_sha256
        capture_utc = $manifestRow[0].capture_utc
        avd_name = $manifestRow[0].avd_name
        apk_sha256 = $manifestRow[0].apk_sha256
        capture_receipt = $manifestRow[0].capture_receipt
        capture_receipt_sha256 = $manifestRow[0].capture_receipt_sha256
    }
    $runtimeInputHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolvedRuntime).Hash.ToLowerInvariant()
    if ($manifestRow[0].runtime_sha256 -ne $runtimeInputHash) {
        throw "Capture-time runtime hash mismatch for ref ${ReferenceNumber}: actual=$runtimeInputHash"
    }
    $expectedCaptureReceipt = $manifestRow[0].capture_receipt.Replace('\', '/')
    $resolvedCaptureReceipt = (Resolve-Path -LiteralPath (Resolve-SellerRepositoryPath -RepositoryRelativePath $expectedCaptureReceipt)).Path
    $captureReceiptHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolvedCaptureReceipt).Hash.ToLowerInvariant()
    if ($manifestRow[0].capture_receipt_sha256 -ne $captureReceiptHash) {
        throw "Capture receipt hash mismatch for ref $ReferenceNumber."
    }
    $captureReceipt = Get-Content -LiteralPath $resolvedCaptureReceipt -Raw -Encoding UTF8 | ConvertFrom-Json
    if (
        $captureReceipt.canonical_state_id -ne $ReferenceNumber -or
        $captureReceipt.state -ne $catalogRow.test_state -or
        $captureReceipt.expected_route -ne $ExpectedRoute -or
        $captureReceipt.actual_route -ne $ExpectedRoute -or
        ($captureReceipt.expected_semantic_markers -join '|') -ne $ExpectedSemanticMarker -or
        ($captureReceipt.markers_found -join '|') -ne $ExpectedSemanticMarker -or
        $captureReceipt.expected_fixture -ne $ExpectedFixture -or
        $captureReceipt.active_fixture -ne $ExpectedFixture -or
        $captureReceipt.screenshot_path -ne $catalogScreenshot -or
        $captureReceipt.runtime_sha256 -ne $runtimeInputHash -or
        $captureReceipt.avd_name -ne $ExpectedAvdName -or
        $captureReceipt.apk_sha256 -ne $manifestRow[0].apk_sha256 -or
        $captureReceipt.apk_sha256 -ne $sellerInstalledApkSha256 -or
        $captureReceipt.capture_valid -ne 'YES' -or
        $captureReceipt.frame_stable -ne 'YES' -or
        $captureReceipt.ui_idle -ne 'YES' -or
        $captureReceipt.wrong_context -ne 'NO'
    ) {
        throw "Capture receipt policy mismatch for ref $ReferenceNumber."
    }
    $captureReceiptAttestation = $captureReceipt
    $captureAvdName = $captureReceipt.avd_name
    $captureApkHash = $captureReceipt.apk_sha256
    $captureUtc = $captureReceipt.capture_utc
    $runtimeInputLastWriteUtc = (Get-Item -LiteralPath $resolvedRuntime).LastWriteTimeUtc.ToString('o')
    Copy-Item -LiteralPath $resolvedRuntime -Destination $rawRuntime -Force
} else {
    $uiDumpRemotePath = '/sdcard/seller-wave4-capture-window.xml'
    Invoke-SellerAdbText -Arguments @('-s', $Serial, 'shell', 'uiautomator', 'dump', $uiDumpRemotePath) | Out-Null
    $uiDump = Invoke-SellerAdbText -Arguments @('-s', $Serial, 'exec-out', 'cat', $uiDumpRemotePath)
    $actualRoute = [regex]::Match($uiDump, 'seller-route:([^"\s]+)').Groups[1].Value
    $foundMarkers = @($expectedMarkers | Where-Object { $uiDump.Contains($_) })
    $activeFixture = if (-not $expectsFixture) { 'none' } elseif ($uiDump.Contains($ExpectedFixture)) { $ExpectedFixture } else { 'none' }
    $uiIdle = $uiDump.Contains('seller-ui-idle:yes')
    $wrongContext = $actualRoute -ne $ExpectedRoute
    $captureValid = (
        $actualRoute -eq $ExpectedRoute -and
        $foundMarkers.Count -eq $expectedMarkers.Count -and
        (-not $expectsFixture -or $activeFixture -eq $ExpectedFixture) -and
        $uiIdle -and
        -not $wrongContext
    )
}
$captureRecord = [ordered]@{
    canonical_state_id = $ReferenceNumber
    expected_route = $ExpectedRoute
    actual_route = if ($actualRoute) { $actualRoute } else { 'NOT_FOUND' }
    expected_semantic_markers = $expectedMarkers
    markers_found = $foundMarkers
    expected_fixture = $ExpectedFixture
    active_fixture = $activeFixture
    ui_idle = if ($uiIdle) { 'YES' } else { 'NO' }
    wrong_context = if ($wrongContext) { 'YES' } else { 'NO' }
    capture_valid = if ($captureValid) { 'YES' } else { 'NO' }
    avd_name = $actualAvdName
    seller_package_fingerprint_sha256 = $sellerPackageFingerprint
    installed_apk_sha256 = $sellerInstalledApkSha256
    capture_time_avd_name = if ($captureAvdName) { $captureAvdName } else { $actualAvdName }
    capture_time_apk_sha256 = if ($captureApkHash) { $captureApkHash } else { $sellerInstalledApkSha256 }
    capture_time_utc = $captureUtc
} | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($captureRecordPath, $captureRecord + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
if (-not $captureValid) {
    throw "CAPTURE_INVALID: Ref $ReferenceNumber route/state/fixture gate failed."
}

if ([string]::IsNullOrWhiteSpace($RuntimePath)) {
    $capture = [System.Diagnostics.ProcessStartInfo]::new()
    $capture.FileName = $Adb
    $capture.Arguments = "-s $Serial exec-out screencap -p"
    $capture.UseShellExecute = $false
    $capture.RedirectStandardOutput = $true
    $capture.RedirectStandardError = $true
    $capture.CreateNoWindow = $true
    $captureProcess = [System.Diagnostics.Process]::new()
    $captureProcess.StartInfo = $capture
    if (-not $captureProcess.Start()) {
        throw 'ADB ekran yakalama süreci başlatılamadı.'
    }
    $captureBytes = [System.IO.MemoryStream]::new()
    $captureProcess.StandardOutput.BaseStream.CopyTo($captureBytes)
    $captureError = $captureProcess.StandardError.ReadToEnd()
    $captureProcess.WaitForExit()
    $runtimeBytes = $captureBytes.ToArray()
    $captureBytes.Dispose()
    if ($captureProcess.ExitCode -ne 0 -or $runtimeBytes.Length -eq 0) {
        throw 'Emulator ekran görüntüsü alınamadı.'
    }
    [System.IO.File]::WriteAllBytes($rawRuntime, $runtimeBytes)
}

Add-Type -AssemblyName System.Drawing
if (-not ('SellerWave4VisualComparer' -as [type])) {
    Add-Type -ReferencedAssemblies ([System.Drawing.Bitmap].Assembly.Location) -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;

public static class SellerWave4VisualComparer {
    private static bool PixelChanged(Color source, Color actual) {
        return Math.Abs(source.R - actual.R) + Math.Abs(source.G - actual.G) + Math.Abs(source.B - actual.B) > 36;
    }

    public static double[] MeasureRegion(
        string referencePath,
        string normalizedPath,
        int x,
        int y,
        int width,
        int height,
        int edgeThickness,
        int searchRadius
    ) {
        using (var reference = new Bitmap(referencePath))
        using (var normalized = new Bitmap(normalizedPath)) {
            int right = Math.Min(reference.Width, Math.Min(normalized.Width, x + width));
            int bottom = Math.Min(reference.Height, Math.Min(normalized.Height, y + height));
            int left = Math.Max(0, x);
            int top = Math.Max(0, y);
            long changedPixels = 0;
            long comparedPixels = 0;
            long changedEdgePixels = 0;
            long comparedEdgePixels = 0;
            for (int pixelY = top; pixelY < bottom; pixelY++) {
                for (int pixelX = left; pixelX < right; pixelX++) {
                    Color source = reference.GetPixel(pixelX, pixelY);
                    Color actual = normalized.GetPixel(pixelX, pixelY);
                    bool changed = PixelChanged(source, actual);
                    if (changed) changedPixels++;
                    comparedPixels++;
                    bool edge = pixelX < left + edgeThickness || pixelX >= right - edgeThickness || pixelY < top + edgeThickness || pixelY >= bottom - edgeThickness;
                    if (edge) {
                        if (changed) changedEdgePixels++;
                        comparedEdgePixels++;
                    }
                }
            }
            double bestEdgeDelta = 100d;
            int bestX = 0;
            int bestY = 0;
            for (int dy = -searchRadius; dy <= searchRadius; dy++) {
                for (int dx = -searchRadius; dx <= searchRadius; dx++) {
                    long candidateChanged = 0;
                    long candidateCompared = 0;
                    for (int pixelY = top; pixelY < bottom; pixelY++) {
                        for (int pixelX = left; pixelX < right; pixelX++) {
                            bool edge = pixelX < left + edgeThickness || pixelX >= right - edgeThickness || pixelY < top + edgeThickness || pixelY >= bottom - edgeThickness;
                            if (!edge) continue;
                            int actualX = pixelX + dx;
                            int actualY = pixelY + dy;
                            if (actualX < 0 || actualY < 0 || actualX >= normalized.Width || actualY >= normalized.Height) continue;
                            if (PixelChanged(reference.GetPixel(pixelX, pixelY), normalized.GetPixel(actualX, actualY))) candidateChanged++;
                            candidateCompared++;
                        }
                    }
                    double candidateDelta = candidateCompared == 0 ? 100d : candidateChanged * 100d / candidateCompared;
                    if (candidateDelta < bestEdgeDelta) {
                        bestEdgeDelta = candidateDelta;
                        bestX = dx;
                        bestY = dy;
                    }
                }
            }
            return new[] {
                comparedPixels == 0 ? 100d : changedPixels * 100d / comparedPixels,
                comparedEdgePixels == 0 ? 100d : changedEdgePixels * 100d / comparedEdgePixels,
                (double)bestX,
                (double)bestY,
                bestEdgeDelta
            };
        }
    }

    public static double NormalizeAndCompare(
        string referencePath,
        string runtimePath,
        string normalizedPath,
        string sideBySidePath,
        string overlayPath
    ) {
        using (var reference = new Bitmap(referencePath))
        using (var runtime = new Bitmap(runtimePath))
        using (var normalized = new Bitmap(reference.Width, reference.Height, PixelFormat.Format32bppArgb)) {
            using (var graphics = Graphics.FromImage(normalized)) {
                graphics.Clear(Color.Transparent);
                float scale = Math.Max((float)reference.Width / runtime.Width, (float)reference.Height / runtime.Height);
                int width = (int)Math.Ceiling(runtime.Width * scale);
                int height = (int)Math.Ceiling(runtime.Height * scale);
                int x = (reference.Width - width) / 2;
                int y = (reference.Height - height) / 2;
                graphics.DrawImage(runtime, new Rectangle(x, y, width, height));
            }
            normalized.Save(normalizedPath, ImageFormat.Png);
            using (var sideBySide = new Bitmap(reference.Width * 2, reference.Height, PixelFormat.Format32bppArgb))
            using (var sideGraphics = Graphics.FromImage(sideBySide)) {
                sideGraphics.DrawImage(reference, 0, 0, reference.Width, reference.Height);
                sideGraphics.DrawImage(normalized, reference.Width, 0, reference.Width, reference.Height);
                sideBySide.Save(sideBySidePath, ImageFormat.Png);
            }
            long changedPixels = 0;
            long comparedPixels = (long)reference.Width * reference.Height;
            using (var overlay = new Bitmap(reference.Width, reference.Height, PixelFormat.Format32bppArgb)) {
                for (int y = 0; y < reference.Height; y++) {
                    for (int x = 0; x < reference.Width; x++) {
                        Color left = reference.GetPixel(x, y);
                        Color right = normalized.GetPixel(x, y);
                        int delta = Math.Abs(left.R - right.R) + Math.Abs(left.G - right.G) + Math.Abs(left.B - right.B);
                        if (delta > 36) changedPixels++;
                        overlay.SetPixel(x, y, Color.FromArgb(128, left.R, right.G, right.B));
                    }
                }
                overlay.Save(overlayPath, ImageFormat.Png);
            }
            return comparedPixels == 0 ? 100d : changedPixels * 100d / comparedPixels;
        }
    }
}
'@
}

$deltaPercent = [SellerWave4VisualComparer]::NormalizeAndCompare(
    $reference,
    $rawRuntime,
    $normalizedRuntime,
    $sideBySide,
    $overlay
)
$evidenceProvenance = [ordered]@{
    capture_mode = $captureMode
    comparison_algorithm = 'UNMASKED_FULL_FRAME_RGB_ABSOLUTE_DIFFERENCE_SUM_GT_36'
    comparison_created_utc = [DateTime]::UtcNow.ToString('o')
    serial = $Serial
    avd_name = $actualAvdName
    seller_package_fingerprint_sha256 = $sellerPackageFingerprint
    installed_apk_sha256 = $sellerInstalledApkSha256
    capture_time_avd_name = if ($captureAvdName) { $captureAvdName } else { $actualAvdName }
    capture_time_apk_sha256 = if ($captureApkHash) { $captureApkHash } else { $sellerInstalledApkSha256 }
    capture_time_utc = $captureUtc
    capture_profile = [ordered]@{
        reference = $ReferenceNumber
        expected_route = $ExpectedRoute
        actual_route = if ($actualRoute) { $actualRoute } else { 'NOT_FOUND' }
        expected_markers = $expectedMarkers
        markers_found = $foundMarkers
        expected_fixture = $ExpectedFixture
        active_fixture = $activeFixture
        ui_idle = if ($uiIdle) { 'YES' } else { 'NO' }
        wrong_context = if ($wrongContext) { 'YES' } else { 'NO' }
        capture_valid = if ($captureValid) { 'YES' } else { 'NO' }
    }
    source_sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $reference).Hash.ToLowerInvariant()
    runtime_input_sha256 = if ($runtimeInputHash) { $runtimeInputHash } else { (Get-FileHash -Algorithm SHA256 -LiteralPath $rawRuntime).Hash.ToLowerInvariant() }
    runtime_input_last_write_utc = if ($runtimeInputLastWriteUtc) { $runtimeInputLastWriteUtc } else { (Get-Item -LiteralPath $rawRuntime).LastWriteTimeUtc.ToString('o') }
    raw_runtime_sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $rawRuntime).Hash.ToLowerInvariant()
    normalized_runtime_sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $normalizedRuntime).Hash.ToLowerInvariant()
    capture_manifest_sha256 = $captureManifestHash
    capture_manifest_row_sha256 = $captureManifestRowHash
    capture_manifest_row = $captureManifestRowAttestation
    capture_receipt_sha256 = $captureReceiptHash
    capture_receipt = $captureReceiptAttestation
    capture_record_sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $captureRecordPath).Hash.ToLowerInvariant()
}
$layoutSpecHash = 'NOT_PROVIDED'
$layoutSpecRecord = $null
$regionComparisons = @()
$geometryGate = $null
$goldenReferences = @('001', '055', '282')
$expectedLayoutSpecRelativePath = "docs/seller/wave4/spec/$ReferenceNumber-layout-spec.json"
if ($goldenReferences -contains $ReferenceNumber -and [string]::IsNullOrWhiteSpace($LayoutSpecPath)) {
    throw "Golden reference requires its committed layout specification: $expectedLayoutSpecRelativePath"
}
if (-not [string]::IsNullOrWhiteSpace($LayoutSpecPath)) {
    $resolvedLayoutSpec = (Resolve-Path -LiteralPath $LayoutSpecPath).Path
    $expectedLayoutSpecPath = (Resolve-Path -LiteralPath (
        Resolve-SellerRepositoryPath -RepositoryRelativePath $expectedLayoutSpecRelativePath
    )).Path
    if ($goldenReferences -contains $ReferenceNumber -and $resolvedLayoutSpec -ne $expectedLayoutSpecPath) {
        throw "Golden LayoutSpecPath differs from committed policy for ref $ReferenceNumber."
    }
    $layoutSpec = Get-Content -LiteralPath $resolvedLayoutSpec -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($layoutSpec.reference_id -ne $ReferenceNumber) {
        throw "Layout specification reference mismatch: expected=$ReferenceNumber actual=$($layoutSpec.reference_id)"
    }
    if ($layoutSpec.binding_png -ne $sourceRows[0].PNG_PATH -or $layoutSpec.binding_png_sha256 -ne $canonicalReferenceHash) {
        throw "Layout specification binding PNG differs from the committed source map for ref $ReferenceNumber."
    }
    if ($sourceRows[0].SVG_EXISTS -eq 'YES' -and (
        $layoutSpec.source_svg -ne $sourceRows[0].FULL_SCREEN_SVG_PATH -or
        $layoutSpec.source_svg_sha256 -ne $sourceRows[0].SVG_SHA256
    )) {
        throw "Layout specification SVG source differs from the committed source map for ref $ReferenceNumber."
    }
    $layoutSpecHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolvedLayoutSpec).Hash.ToLowerInvariant()
    $layoutSpecRecord = [ordered]@{
        path = $expectedLayoutSpecRelativePath
        sha256 = $layoutSpecHash
        authority = $layoutSpec.authority
    }
    $hasRuntimeBounds = (
        $null -ne $captureReceiptAttestation -and
        [int]$captureReceiptAttestation.schema_version -eq 2 -and
        $null -ne $captureReceiptAttestation.capture_canvas_px -and
        $null -ne $captureReceiptAttestation.runtime_bounds_raw_px
    )
    if ($goldenReferences -contains $ReferenceNumber -and -not $hasRuntimeBounds) {
            throw "Golden reference requires schema-v2 capture receipt runtime bounds: $ReferenceNumber"
    }
    $referenceCanvasWidth = [double]$layoutSpec.canvas.width
    $referenceCanvasHeight = [double]$layoutSpec.canvas.height
    $rawCanvasWidth = if ($hasRuntimeBounds) { [double]$captureReceiptAttestation.capture_canvas_px.width } else { 0.0 }
    $rawCanvasHeight = if ($hasRuntimeBounds) { [double]$captureReceiptAttestation.capture_canvas_px.height } else { 0.0 }
    if ($hasRuntimeBounds -and ($rawCanvasWidth -le 0 -or $rawCanvasHeight -le 0)) {
        throw "Invalid capture canvas in receipt for ref $ReferenceNumber."
    }
    $normalizationScale = if ($hasRuntimeBounds) { [Math]::Max(
        $referenceCanvasWidth / $rawCanvasWidth,
        $referenceCanvasHeight / $rawCanvasHeight
    ) } else { 1.0 }
    $scaledCanvasWidth = if ($hasRuntimeBounds) { [Math]::Ceiling($rawCanvasWidth * $normalizationScale) } else { $referenceCanvasWidth }
    $scaledCanvasHeight = if ($hasRuntimeBounds) { [Math]::Ceiling($rawCanvasHeight * $normalizationScale) } else { $referenceCanvasHeight }
    $normalizationOffsetX = if ($hasRuntimeBounds) { [int][Math]::Truncate(($referenceCanvasWidth - $scaledCanvasWidth) / 2.0) } else { 0 }
    $normalizationOffsetY = if ($hasRuntimeBounds) { [int][Math]::Truncate(($referenceCanvasHeight - $scaledCanvasHeight) / 2.0) } else { 0 }
    foreach ($region in @($layoutSpec.regions)) {
        $regionX = [Math]::Round([double]$region.x)
        $regionY = [Math]::Round([double]$region.y)
        $regionWidth = [Math]::Round([double]$region.width)
        $regionHeight = [Math]::Round([double]$region.height)
        if ($regionWidth -le 0 -or $regionHeight -le 0) {
            throw "Invalid layout specification region: $($region.id)"
        }
        $measurement = [SellerWave4VisualComparer]::MeasureRegion(
            $reference,
            $normalizedRuntime,
            $regionX,
            $regionY,
            $regionWidth,
            $regionHeight,
            3,
            12
        )
        $regionDelta = $measurement[0]
        $rawBoundsProperty = if ($hasRuntimeBounds) { $captureReceiptAttestation.runtime_bounds_raw_px.PSObject.Properties[$region.id] } else { $null }
        if ($hasRuntimeBounds -and $null -eq $rawBoundsProperty) {
            throw "Capture receipt is missing runtime bounds for ref $ReferenceNumber region $($region.id)."
        }
        $rawBounds = if ($hasRuntimeBounds) { $rawBoundsProperty.Value } else { $null }
        $runtimeX = if ($hasRuntimeBounds) { [int][Math]::Round(([double]$rawBounds.left * $normalizationScale) + $normalizationOffsetX) } else { $regionX + [int]$measurement[2] }
        $runtimeY = if ($hasRuntimeBounds) { [int][Math]::Round(([double]$rawBounds.top * $normalizationScale) + $normalizationOffsetY) } else { $regionY + [int]$measurement[3] }
        $runtimeWidth = if ($hasRuntimeBounds) { [int][Math]::Round([double]$rawBounds.width * $normalizationScale) } else { $regionWidth }
        $runtimeHeight = if ($hasRuntimeBounds) { [int][Math]::Round([double]$rawBounds.height * $normalizationScale) } else { $regionHeight }
        $boundsDeltaX = $runtimeX - $regionX
        $boundsDeltaY = $runtimeY - $regionY
        $boundsDeltaWidth = $runtimeWidth - $regionWidth
        $boundsDeltaHeight = $runtimeHeight - $regionHeight
        $boundsWithinTolerance = (
            [Math]::Abs($boundsDeltaX) -le 2 -and
            [Math]::Abs($boundsDeltaY) -le 2 -and
            [Math]::Abs($boundsDeltaWidth) -le 2 -and
            [Math]::Abs($boundsDeltaHeight) -le 2
        )
        $geometryResult = if (
            $boundsWithinTolerance -and
            $measurement[4] -le 8.0
        ) { 'PASS' } else { 'FAIL' }
        $classification = if ($geometryResult -eq 'PASS' -and $regionDelta -le $MaximumDeltaPercent) {
            'PASS'
        } elseif (
            [Math]::Abs($boundsDeltaWidth) -gt 2 -or
            [Math]::Abs($boundsDeltaHeight) -gt 2 -or
            $measurement[4] -gt 8.0
        ) {
            'SHAPE_MISMATCH'
        } elseif (
            ([Math]::Abs($boundsDeltaX) -gt 2 -or [Math]::Abs($boundsDeltaY) -gt 2) -and
            $measurement[4] -le 3.0
        ) {
            'POSITION_ONLY'
        } elseif ([Math]::Abs($boundsDeltaX) -gt 2 -or [Math]::Abs($boundsDeltaY) -gt 2) {
            'NEAR_POSITION'
        } else {
            'CONTENT_OR_TYPOGRAPHY'
        }
        $regionComparisons += [ordered]@{
            id = $region.id
            kind = $region.kind
            source_bounds_px = [ordered]@{
                x = $regionX
                y = $regionY
                width = $regionWidth
                height = $regionHeight
            }
            runtime_bounds_raw_px = [ordered]@{
                x = if ($hasRuntimeBounds) { [int]$rawBounds.left } else { $null }
                y = if ($hasRuntimeBounds) { [int]$rawBounds.top } else { $null }
                width = if ($hasRuntimeBounds) { [int]$rawBounds.width } else { $null }
                height = if ($hasRuntimeBounds) { [int]$rawBounds.height } else { $null }
            }
            runtime_bounds_px = [ordered]@{
                x = $runtimeX
                y = $runtimeY
                width = $runtimeWidth
                height = $runtimeHeight
            }
            bounds_delta_px = [ordered]@{
                x = $boundsDeltaX
                y = $boundsDeltaY
                width = $boundsDeltaWidth
                height = $boundsDeltaHeight
            }
            pixel_delta_percent = [Math]::Round($regionDelta, 4)
            edge_delta_percent = [Math]::Round($measurement[1], 4)
            best_translation_px = [ordered]@{ x = [int]$measurement[2]; y = [int]$measurement[3] }
            translated_edge_delta_percent = [Math]::Round($measurement[4], 4)
            geometry_result = $geometryResult
            classification = $classification
            threshold_percent = $MaximumDeltaPercent
            result = if ($regionDelta -le $MaximumDeltaPercent) { 'PASS' } else { 'FAIL' }
        }
    }
    if ($regionComparisons.Count -eq 0) {
        throw "Layout specification has no comparable regions: $resolvedLayoutSpec"
    }
    $criticalKinds = @('rounded_card', 'input', 'button', 'task_card', 'summary_card', 'list_card', 'navigation', 'source_rect')
    $criticalRegions = @($regionComparisons | Where-Object { $criticalKinds -contains $_.kind })
    $failedCriticalRegions = @($criticalRegions | Where-Object { $_.geometry_result -ne 'PASS' })
    $geometryGate = [ordered]@{
        result = if ($criticalRegions.Count -gt 0 -and $failedCriticalRegions.Count -eq 0) { 'PASS' } else { 'FAIL' }
        critical_region_count = $criticalRegions.Count
        failed_region_ids = @($failedCriticalRegions | ForEach-Object { $_.id })
        edge_thickness_px = 3
        translation_search_radius_px = 12
        pass_rule = 'abs(runtime/source x,y,width,height delta)<=2 and translated_edge_delta_percent<=8'
        runtime_bounds_normalization = [ordered]@{
            raw_canvas_width = if ($hasRuntimeBounds) { [int]$rawCanvasWidth } else { $null }
            raw_canvas_height = if ($hasRuntimeBounds) { [int]$rawCanvasHeight } else { $null }
            reference_canvas_width = [int]$referenceCanvasWidth
            reference_canvas_height = [int]$referenceCanvasHeight
            scale = [Math]::Round($normalizationScale, 8)
            offset_x = $normalizationOffsetX
            offset_y = $normalizationOffsetY
        }
    }
}
$visualGatePassed = $deltaPercent -le $MaximumDeltaPercent -and (
    $goldenReferences -notcontains $ReferenceNumber -or $geometryGate.result -eq 'PASS'
)
$result = [ordered]@{
    reference_number = $ReferenceNumber
    serial = $Serial
    reference_path = $sourceRows[0].PNG_PATH
    raw_runtime_path = $rawRuntime
    normalized_runtime_path = $normalizedRuntime
    side_by_side_path = $sideBySide
    overlay_path = $overlay
    evidence_provenance = $evidenceProvenance
    layout_spec = $layoutSpecRecord
    geometry_gate = $geometryGate
    region_comparisons = $regionComparisons
    delta_percent = [Math]::Round($deltaPercent, 4)
    threshold_percent = $MaximumDeltaPercent
    result = if ($visualGatePassed) { 'PASS' } else { 'FAIL' }
} | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($diff, $result + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
Write-Output "SELLER_WAVE4_VISUAL_EVIDENCE: $($result)"
if (-not $visualGatePassed) {
    throw "Kanonik fark eşiği aşıldı: $([Math]::Round($deltaPercent, 4))% > $MaximumDeltaPercent%"
}
