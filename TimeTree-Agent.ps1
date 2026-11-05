[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Check', 'Credentials', 'Calendars', 'Events', 'Daily', 'Summary')]
    [string]$Mode,
    [ValidatePattern('^[A-Za-z0-9_-]+$')]
    [string]$CalendarId
)

$ErrorActionPreference = 'Stop'
$state = Join-Path $env:LOCALAPPDATA 'LocalTimeTreeMcp'
$server = Join-Path $PSScriptRoot 'src/server.mjs'
$credentialFile = Join-Path $state 'credentials.clixml'
$agent = Join-Path $PSScriptRoot 'agent.mjs'

if ($Mode -eq 'Credentials') {
    New-Item -ItemType Directory -Force -Path $state | Out-Null
    $credential = Get-Credential -Message 'Enter the TimeTree Web email and password locally.'
    if (!$credential -or !$credential.UserName -or !$credential.Password.Length) {
        throw 'Credential entry cancelled or incomplete.'
    }
    $credential | Export-Clixml -LiteralPath $credentialFile
    Write-Host 'Credential saved for this Windows user on this PC.'
    return
}

if (!(Test-Path -LiteralPath $server)) { throw 'MCP server file missing.' }
if ($Mode -in 'Events', 'Daily', 'Summary' -and !$CalendarId) { throw 'Provide -CalendarId.' }
$node = (Get-Command node.exe -CommandType Application).Source
$version = & $node --version
if ([int]($version -replace '^v(\d+).*$', '$1') -lt 22) { throw 'Node.js 22 or newer is required.' }

try {
    if ($Mode -ne 'Check') {
        $credential = Import-Clixml -LiteralPath $credentialFile
        $env:TIMETREE_EMAIL = $credential.UserName
        $env:TIMETREE_PASSWORD = $credential.GetNetworkCredential().Password
    }
    $target = if ($CalendarId) { $CalendarId } else { '-' }
    & $node $agent $Mode $server $target $state
    $result = $LASTEXITCODE
} finally {
    Remove-Item Env:TIMETREE_EMAIL,Env:TIMETREE_PASSWORD -ErrorAction SilentlyContinue
}
exit $result
