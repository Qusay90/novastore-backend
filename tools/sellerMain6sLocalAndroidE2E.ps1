param(
  [Parameter(Mandatory = $true)]
  [string]$Serial,

  [string]$ExpectedAvdName = 'novastore-seller-wave4-uat'
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = (
  Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')
).Path
$androidSdk = 'C:\Users\kusay\AppData\Local\Android\Sdk'
$adb = Join-Path $androidSdk 'platform-tools\adb.exe'
$image = 'postgres:16-alpine'
$serverPort = 5001
$serverProcess = $null
$containerStarted = $false
$beforeContainers = @()
$containerName = ''
$temporaryRoot = ''

function Require-LastExitCode {
  param([string]$Failure)
  if ($LASTEXITCODE -ne 0) {
    throw $Failure
  }
}

function Wait-LoopbackPort {
  param(
    [int]$Port,
    [System.Diagnostics.Process]$Process
  )
  for ($attempt = 0; $attempt -lt 120; $attempt++) {
    if ($Process.HasExited) {
      return $false
    }
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
      $task = $client.ConnectAsync('127.0.0.1', $Port)
      if ($task.Wait(250) -and $client.Connected) {
        return $true
      }
    }
    catch {
    }
    finally {
      $client.Dispose()
    }
    Start-Sleep -Milliseconds 250
  }
  return $false
}

function Invoke-Instrumentation {
  param([string[]]$Arguments)
  $output = @(& $adb -s $Serial @Arguments)
  $text = $output -join [Environment]::NewLine
  Write-Host $text
  Require-LastExitCode 'Seller Android instrumentation process failed.'
  if ($text -notmatch 'OK \(1 test\)') {
    throw 'Seller Android instrumentation did not report exactly one passing test.'
  }
}

try {
  if (-not (Test-Path -LiteralPath $adb -PathType Leaf)) {
    throw 'Android adb executable is unavailable.'
  }
  Set-Location -LiteralPath $repositoryRoot
  $avdName = ([string]((
    & $adb -s $Serial emu avd name |
      Select-Object -First 1
  ))).Trim()
  if ($avdName -ne $ExpectedAvdName) {
    throw "Unexpected Android target: $Serial/$avdName"
  }
  $bootCompleted = ([string](
    & $adb -s $Serial shell getprop sys.boot_completed
  )).Trim()
  if ($bootCompleted -ne '1') {
    throw 'Seller UAT AVD is not boot-complete.'
  }
  if (
    Get-NetTCPConnection `
      -LocalPort $serverPort `
      -State Listen `
      -ErrorAction SilentlyContinue
  ) {
    throw "Host port $serverPort is already in use."
  }

  $imageInfo = docker image inspect $image --format '{{json .RepoTags}}'
  Require-LastExitCode 'Official local PostgreSQL image is unavailable.'
  if ($imageInfo -notmatch '"postgres:16-alpine"') {
    throw 'The selected image is not the pinned official PostgreSQL image.'
  }
  $beforeContainers = @(docker ps -a --format '{{.ID}}')
  Require-LastExitCode 'Unable to inventory local containers.'

  $suffix = [Guid]::NewGuid().ToString('N').Substring(0, 12)
  $containerName = "novastore-seller-main6s-android-$suffix"
  $databaseName = "novastore_seller_wave3_test_android_$suffix"
  $databasePassword = (
    [Guid]::NewGuid().ToString('N') +
    [Guid]::NewGuid().ToString('N')
  )
  $tokenSecret = (
    [Guid]::NewGuid().ToString('N') +
    [Guid]::NewGuid().ToString('N') +
    [Guid]::NewGuid().ToString('N')
  )
  $temporaryRoot = Join-Path (
    [System.IO.Path]::GetTempPath()
  ) "novastore-seller-main6s-$suffix"
  New-Item -ItemType Directory -Path $temporaryRoot | Out-Null

  $containerId = docker run `
    -d `
    --rm `
    --pull=never `
    --name $containerName `
    --label novastore.seller.main6s.android=true `
    -e POSTGRES_USER=postgres `
    -e "POSTGRES_PASSWORD=$databasePassword" `
    -e POSTGRES_DB=postgres `
    -p 127.0.0.1::5432 `
    --tmpfs /var/lib/postgresql/data:rw,noexec,nosuid,size=512m `
    $image
  Require-LastExitCode 'Android E2E PostgreSQL failed to start.'
  if ([string]::IsNullOrWhiteSpace($containerId)) {
    throw 'Android E2E PostgreSQL returned no container identity.'
  }
  $containerStarted = $true

  $databaseReady = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    docker exec `
      $containerName `
      pg_isready `
      -U postgres `
      -d postgres *> $null
    if ($LASTEXITCODE -eq 0) {
      $databaseReady = $true
      break
    }
    Start-Sleep -Milliseconds 500
  }
  if (-not $databaseReady) {
    throw 'Android E2E PostgreSQL did not become ready.'
  }
  $portOutput = @(
    docker port $containerName 5432/tcp
  )
  Require-LastExitCode 'Unable to resolve disposable PostgreSQL port.'
  $portLine = ([string](
    $portOutput |
      Select-Object -First 1
  )).Trim()
  if ([string]::IsNullOrWhiteSpace($portLine)) {
    throw 'Disposable PostgreSQL returned no loopback port.'
  }
  if ($portLine -notmatch '^127\.0\.0\.1:(\d+)$') {
    throw "Unexpected loopback DB port: $portLine"
  }
  $databasePort = $Matches[1]
  $connection = (
    "postgresql://postgres:$databasePassword" +
    "@127.0.0.1:$databasePort/$databaseName"
  )

  $node = (Get-Command node).Source
  $fixtureOutput = @(
    & $node `
      tests/helpers/sellerMain6sAndroidFixture.js `
      --db-enabled `
      --allow-db-operation `
      --allow-migration-apply `
      --allow-db-cleanup `
      --prepare-android-fixture `
      --connection $connection 2>&1
  )
  if ($LASTEXITCODE -ne 0) {
    $fixtureFailure = $fixtureOutput -join [Environment]::NewLine
    throw "Seller Main-6S Android fixture setup failed: $fixtureFailure"
  }
  if ($fixtureOutput.Count -eq 0) {
    throw 'Seller Main-6S Android fixture returned no target matrix.'
  }
  $fixture = $fixtureOutput[-1] | ConvertFrom-Json
  $requiredFixtureFields = @(
    'foreignStoreId',
    'foreignStoreRevision',
    'foreignOfferId',
    'foreignOfferRevision',
    'foreignInventoryItemId',
    'foreignInventoryRevision',
    'foreignOrderId',
    'foreignOrderRevision',
    'foreignOrderPackageId',
    'foreignConversationId',
    'foreignConversationRevision'
  )
  foreach ($field in $requiredFixtureFields) {
    if ([long]$fixture.$field -lt 1) {
      throw "Invalid fixture field: $field"
    }
  }

  $serverInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $serverInfo.FileName = $node
  $serverInfo.WorkingDirectory = $temporaryRoot
  $serverInfo.UseShellExecute = $false
  $serverInfo.CreateNoWindow = $true
  $serverInfo.RedirectStandardOutput = $true
  $serverInfo.RedirectStandardError = $true
  $serverScript = Join-Path $repositoryRoot 'server.js'
  if ($serverScript.Contains('"')) {
    throw 'Seller server path contains an unsupported quote.'
  }
  $serverInfo.Arguments = '"' + $serverScript + '"'
  $serverInfo.Environment.Clear()
  $serverInfo.Environment['PATH'] = $env:PATH
  $serverInfo.Environment['SystemRoot'] = $env:SystemRoot
  $serverInfo.Environment['TEMP'] = $env:TEMP
  $serverInfo.Environment['TMP'] = $env:TMP
  $serverInfo.Environment['NODE_ENV'] = 'development'
  $serverInfo.Environment['PORT'] = [string]$serverPort
  $serverInfo.Environment['NOVASTORE_BIND_HOST'] = '127.0.0.1'
  $serverInfo.Environment['DATABASE_URL'] = $connection
  $serverInfo.Environment['DB_HOST'] = '127.0.0.1'
  $serverInfo.Environment['DB_PORT'] = [string]$databasePort
  $serverInfo.Environment['DB_NAME'] = $databaseName
  $serverInfo.Environment['DB_USER'] = 'postgres'
  $serverInfo.Environment['DB_PASSWORD'] = $databasePassword
  $serverInfo.Environment['DB_SSL'] = 'false'
  $serverInfo.Environment['NOVASTORE_SAFE_LOCAL_BACKEND'] = 'true'
  $serverInfo.Environment['NOVASTORE_ALLOW_REMOTE_DB'] = 'false'
  $serverInfo.Environment['SKIP_SCHEMA_INIT'] = 'true'
  $serverInfo.Environment['NOVASTORE_ALLOW_SCHEMA_INIT'] = 'false'
  $serverInfo.Environment['SELLER_API_V1_ENABLED'] = 'true'
  $serverInfo.Environment['SELLER_API_V1_LOCAL_ONLY'] = 'true'
  $serverInfo.Environment['SELLER_OFFER_WRITE_ENABLED'] = 'true'
  $serverInfo.Environment['SELLER_ORDER_WRITE_ENABLED'] = 'true'
  $serverInfo.Environment['SELLER_FINANCE_READ_ENABLED'] = 'true'
  $serverInfo.Environment['SELLER_E2E_TRACE_ENABLED'] = 'true'
  $serverInfo.Environment['SELLER_ACCESS_TOKEN_SECRET'] = $tokenSecret
  $serverInfo.Environment['SELLER_E2E_ACCESS_TOKEN_EXPIRES_IN'] = '15m'
  $serverProcess = [System.Diagnostics.Process]::Start($serverInfo)
  if (-not (Wait-LoopbackPort -Port $serverPort -Process $serverProcess)) {
    $serverError = $serverProcess.StandardError.ReadToEnd()
    throw "Seller local server failed to listen. $serverError"
  }

  $debugApk = (
    Resolve-Path -LiteralPath `
      'seller-app\build\outputs\apk\debug\seller-app-debug.apk'
  ).Path
  $testApk = (
    Resolve-Path -LiteralPath `
      'seller-app\build\outputs\apk\androidTest\debug\seller-app-debug-androidTest.apk'
  ).Path
  & $adb -s $Serial install -r $debugApk | Out-Host
  Require-LastExitCode 'Seller debug APK install failed.'
  & $adb -s $Serial install -r $testApk | Out-Host
  Require-LastExitCode 'Seller androidTest APK install failed.'
  & $adb -s $Serial shell input keyevent 82 *> $null
  & $adb -s $Serial shell wm dismiss-keyguard *> $null
  foreach ($scale in @(
    'window_animation_scale',
    'transition_animation_scale',
    'animator_duration_scale'
  )) {
    & $adb -s $Serial shell settings put global $scale 0 *> $null
  }
  & $adb -s $Serial shell pm clear com.novastore.seller *> $null

  $runner = 'com.novastore.seller.test/androidx.test.runner.AndroidJUnitRunner'
  Invoke-Instrumentation -Arguments @(
    'shell',
    'am',
    'instrument',
    '-w',
    '-r',
    '-e',
    'class',
    'com.novastore.seller.SellerNavigationInstrumentationTest#realSellerApiLoginAndLaunchScreensUseTheAndroidHttpPath',
    '-e',
    'sellerRealApiE2e',
    'true',
    $runner
  )
  Invoke-Instrumentation -Arguments @(
    'shell',
    'am',
    'instrument',
    '-w',
    '-r',
    '-e',
    'class',
    'com.novastore.seller.SellerNavigationInstrumentationTest#realSellerMutationAndConflictPathsUseOnlyTheAndroidUi',
    '-e',
    'sellerMutationE2e',
    'true',
    '-e',
    'sellerCrossTenantStoreId',
    [string]$fixture.foreignStoreId,
    '-e',
    'sellerCrossTenantStoreRevision',
    [string]$fixture.foreignStoreRevision,
    '-e',
    'sellerCrossTenantOfferId',
    [string]$fixture.foreignOfferId,
    '-e',
    'sellerCrossTenantOfferRevision',
    [string]$fixture.foreignOfferRevision,
    '-e',
    'sellerCrossTenantInventoryItemId',
    [string]$fixture.foreignInventoryItemId,
    '-e',
    'sellerCrossTenantInventoryRevision',
    [string]$fixture.foreignInventoryRevision,
    '-e',
    'sellerCrossTenantOrderId',
    [string]$fixture.foreignOrderId,
    '-e',
    'sellerCrossTenantOrderRevision',
    [string]$fixture.foreignOrderRevision,
    '-e',
    'sellerCrossTenantOrderPackageId',
    [string]$fixture.foreignOrderPackageId,
    '-e',
    'sellerCrossTenantConversationId',
    [string]$fixture.foreignConversationId,
    '-e',
    'sellerCrossTenantConversationRevision',
    [string]$fixture.foreignConversationRevision,
    $runner
  )

  $foreignCheckSql = @"
SELECT CASE WHEN
    store_row.revision = $($fixture.foreignStoreRevision)
    AND offer_row.revision = $($fixture.foreignOfferRevision)
    AND inventory_row.revision = $($fixture.foreignInventoryRevision)
    AND inventory_row.quantity = 7
    AND order_row.revision = $($fixture.foreignOrderRevision)
    AND order_row.status = 'new'
    AND conversation_row.revision = $($fixture.foreignConversationRevision)
    AND NOT EXISTS (
        SELECT 1 FROM seller_support_messages message_row
        WHERE message_row.conversation_id = conversation_row.id
    )
    AND NOT EXISTS (
        SELECT 1 FROM seller_audit_events audit_row
        WHERE audit_row.store_id = store_row.id
    )
    AND NOT EXISTS (
        SELECT 1 FROM seller_outbox_events outbox_row
        WHERE outbox_row.store_id = store_row.id
    )
THEN 'PASS' ELSE 'FAIL' END
FROM seller_stores store_row
JOIN seller_offers offer_row ON offer_row.store_id = store_row.id
JOIN seller_offer_variants variant_row ON variant_row.offer_id = offer_row.id
JOIN seller_inventory_items inventory_row
  ON inventory_row.variant_id = variant_row.id
JOIN seller_orders order_row ON order_row.store_id = store_row.id
JOIN seller_support_conversations conversation_row
  ON conversation_row.store_id = store_row.id
WHERE store_row.id = $($fixture.foreignStoreId)
  AND offer_row.id = $($fixture.foreignOfferId)
  AND inventory_row.id = $($fixture.foreignInventoryItemId)
  AND order_row.id = $($fixture.foreignOrderId)
  AND conversation_row.id = $($fixture.foreignConversationId);
"@
  $foreignCheck = (
    docker exec `
      $containerName `
      psql `
      -U postgres `
      -d $databaseName `
      -tAc $foreignCheckSql
  ).Trim()
  Require-LastExitCode 'Unable to verify foreign-store target state.'
  if ($foreignCheck -ne 'PASS') {
    throw "Android foreign-store unchanged DB proof failed: $foreignCheck"
  }
  $auditCheck = (
    docker exec `
      $containerName `
      psql `
      -U postgres `
      -d $databaseName `
      -tAc `
      "SELECT CASE WHEN COUNT(*) > 0 AND COUNT(*) FILTER (WHERE session_id IS NULL) = 0 THEN 'PASS' ELSE 'FAIL' END FROM seller_audit_events;"
  ).Trim()
  Require-LastExitCode 'Unable to verify seller audit session identity.'
  if ($auditCheck -ne 'PASS') {
    throw "Android audit session attribution proof failed: $auditCheck"
  }

  Start-Sleep -Milliseconds 500
  if (-not $serverProcess.HasExited) {
    $serverProcess.Kill()
    $serverProcess.WaitForExit(10000) | Out-Null
  }
  $serverOutput = $serverProcess.StandardOutput.ReadToEnd()
  $serverErrorOutput = $serverProcess.StandardError.ReadToEnd()
  $httpLines = @(
    $serverOutput -split "`r?`n" |
      Where-Object { $_ -like 'SELLER_E2E_HTTP *' }
  )
  if ($httpLines.Count -lt 20) {
    throw "Insufficient real HTTP trace count: $($httpLines.Count)"
  }
  $unexpectedHttp = @(
    $httpLines |
      Where-Object { $_ -match ' 5\d\d$' }
  )
  if ($unexpectedHttp.Count -ne 0) {
    throw "Unexpected seller HTTP 5xx trace: $($unexpectedHttp -join ', ')"
  }
  if (
    $serverOutput.Contains($databasePassword) -or
    $serverErrorOutput.Contains($databasePassword) -or
    $serverOutput.Contains($tokenSecret) -or
    $serverErrorOutput.Contains($tokenSecret)
  ) {
    throw 'Seller local server output exposed a generated credential.'
  }

  Write-Host 'SELLER_MAIN6S_ANDROID_NAVIGATION_E2E: PASS'
  Write-Host 'SELLER_MAIN6S_ANDROID_MUTATION_MATRIX: PASS'
  Write-Host 'SELLER_MAIN6S_ANDROID_FOREIGN_STORE_UNCHANGED: PASS'
  Write-Host 'SELLER_MAIN6S_ANDROID_AUDIT_SESSION: PASS'
  Write-Host "SELLER_MAIN6S_HTTP_TRACE_COUNT: $($httpLines.Count)"
}
finally {
  if ($serverProcess -and -not $serverProcess.HasExited) {
    $serverProcess.Kill()
    $serverProcess.WaitForExit(10000) | Out-Null
  }
  if ($containerStarted) {
    docker rm -f $containerName *> $null
  }
  if ($containerName) {
    $residual = @(
      docker ps `
        -a `
        --filter 'label=novastore.seller.main6s.android=true' `
        --format '{{.Names}}' |
        Where-Object { $_ -eq $containerName }
    )
    if ($residual.Count -ne 0) {
      throw 'Seller Android E2E container remains after cleanup.'
    }
  }
  if ($beforeContainers.Count -gt 0) {
    $afterContainers = @(docker ps -a --format '{{.ID}}')
    $unrelatedRemoved = @(
      $beforeContainers |
        Where-Object { $_ -notin $afterContainers }
    )
    if ($unrelatedRemoved.Count -ne 0) {
      throw 'An unrelated container disappeared during Seller Android E2E.'
    }
  }
  if ($temporaryRoot -and (Test-Path -LiteralPath $temporaryRoot)) {
    $resolvedTemporaryRoot = (Resolve-Path -LiteralPath $temporaryRoot).Path
    $safeTemporaryRoot = [System.IO.Path]::GetFullPath(
      [System.IO.Path]::GetTempPath()
    )
    if (
      -not $resolvedTemporaryRoot.StartsWith(
        $safeTemporaryRoot,
        [System.StringComparison]::OrdinalIgnoreCase
      )
    ) {
      throw 'Unsafe temporary cleanup target.'
    }
    Remove-Item -LiteralPath $resolvedTemporaryRoot -Recurse -Force
  }
  Write-Host 'SELLER_MAIN6S_ANDROID_E2E_CLEANUP: PASS'
}
