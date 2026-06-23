<#
.SYNOPSIS
    Exports Active Directory data for the MigrateReady readiness assessment.

.DESCRIPTION
    Collects read-only AD DS data (users, groups, computers, OUs, GPOs, password
    policy, trusts, UPN suffixes) and writes a single ad-export.json file
    compatible with the MigrateReady schema v1.0.

    This script NEVER exports password hashes, Kerberos keys, NTLM hashes,
    LAPS credentials, or any secret material. See docs/data-collected.md for
    the exact attribute list.

    Run this on a Domain Controller or any machine with RSAT AD DS tools.

.PARAMETER OutputPath
    Destination path for the JSON file. Defaults to .\ad-export.json.

.PARAMETER AnonymiseNames
    When specified, hashes sAMAccountNames and display names with SHA-256
    so the export can be shared without exposing personal data.

.PARAMETER MaxUsers
    Limit user export to the first N users (useful for testing). Default: unlimited.

.EXAMPLE
    .\Get-ADAssessmentData.ps1 -OutputPath C:\Temp\ad-export.json

.EXAMPLE
    .\Get-ADAssessmentData.ps1 -AnonymiseNames -OutputPath .\ad-export-anon.json

.NOTES
    Requires: ActiveDirectory module (RSAT-AD-PowerShell or Windows Server AD DS role)
    Permissions: Domain Users read is sufficient; no elevated privileges required
                 for read-only data collection.
    Schema version: 1.0
#>

[CmdletBinding()]
param(
    [string]$OutputPath = '.\ad-export.json',
    [switch]$AnonymiseNames,
    [int]$MaxUsers = 0
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ─── Prerequisite check ───────────────────────────────────────────────────────

if (-not (Get-Module -ListAvailable -Name ActiveDirectory)) {
    throw 'ActiveDirectory module not found. Install RSAT: Add-WindowsCapability -Online -Name Rsat.ActiveDirectory.DS-LDS.Tools~~~~0.0.1.0'
}
Import-Module ActiveDirectory -Verbose:$false

Write-Host "[MigrateReady] Starting AD export..." -ForegroundColor Cyan
$startTime = Get-Date

# ─── Anonymisation helper ─────────────────────────────────────────────────────

function Get-AnonymisedName {
    param([string]$Value)
    if (-not $AnonymiseNames) { return $Value }
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value.ToLower())
    $hash  = [System.Security.Cryptography.SHA256]::Create().ComputeHash($bytes)
    return 'anon_' + ([BitConverter]::ToString($hash) -replace '-', '').Substring(0, 12).ToLower()
}

# ─── Domain info ──────────────────────────────────────────────────────────────

Write-Host "[MigrateReady] Collecting domain info..."
$domain = Get-ADDomain
$forest = Get-ADForest
$upnSuffixes = @($domain.DNSRoot) + @($forest.UPNSuffixes)

$domainInfo = [ordered]@{
    name                  = $domain.DNSRoot
    forest                = $forest.RootDomain
    netBIOSName           = $domain.NetBIOSName
    domainFunctionalLevel = $domain.DomainMode.ToString()
    forestFunctionalLevel = $forest.ForestMode.ToString()
    upnSuffixes           = $upnSuffixes
    pdcEmulator           = $domain.PDCEmulator
}

# ─── Users ────────────────────────────────────────────────────────────────────

Write-Host "[MigrateReady] Collecting users..."

$userProperties = @(
    'SamAccountName', 'UserPrincipalName', 'DisplayName', 'GivenName', 'Surname',
    'EmailAddress', 'Department', 'Title', 'Company', 'Manager',
    'DistinguishedName', 'Enabled', 'LastLogonDate', 'PasswordLastSet',
    'PasswordNeverExpires', 'PasswordNotRequired', 'ProxyAddresses',
    'MemberOf', 'ServicePrincipalNames', 'WhenCreated', 'WhenChanged',
    'AdminCount', 'UserAccountControl'
)

$adUsersRaw = Get-ADUser -Filter * -Properties $userProperties
if ($MaxUsers -gt 0) { $adUsersRaw = $adUsersRaw | Select-Object -First $MaxUsers }

$users = foreach ($u in $adUsersRaw) {
    [ordered]@{
        sAMAccountName       = Get-AnonymisedName $u.SamAccountName
        userPrincipalName    = if ($AnonymiseNames) { "$(Get-AnonymisedName $u.SamAccountName)@$($domain.DNSRoot)" } else { $u.UserPrincipalName }
        displayName          = if ($AnonymiseNames) { Get-AnonymisedName ($u.DisplayName ?? $u.SamAccountName) } else { $u.DisplayName }
        givenName            = if ($AnonymiseNames) { $null } else { $u.GivenName }
        surname              = if ($AnonymiseNames) { $null } else { $u.Surname }
        mail                 = if ($AnonymiseNames) { $null } else { $u.EmailAddress }
        department           = $u.Department
        title                = $u.Title
        company              = $u.Company
        manager              = if ($u.Manager) { (Get-AnonymisedName ($u.Manager -replace '^CN=([^,]+).*$','$1')) } else { $null }
        distinguishedName    = $u.DistinguishedName
        enabled              = [bool]$u.Enabled
        lastLogonDate        = if ($u.LastLogonDate) { $u.LastLogonDate.ToString('o') } else { $null }
        passwordLastSet      = if ($u.PasswordLastSet) { $u.PasswordLastSet.ToString('o') } else { $null }
        passwordNeverExpires = [bool]$u.PasswordNeverExpires
        passwordNotRequired  = [bool]$u.PasswordNotRequired
        proxyAddresses       = @($u.ProxyAddresses)
        memberOf             = @($u.MemberOf)
        servicePrincipalNames = @($u.ServicePrincipalNames)
        whenCreated          = if ($u.WhenCreated) { $u.WhenCreated.ToString('o') } else { $null }
        whenChanged          = if ($u.WhenChanged) { $u.WhenChanged.ToString('o') } else { $null }
        adminCount           = $u.AdminCount
        userAccountControl   = $u.UserAccountControl
    }
}

Write-Host "[MigrateReady]   → $(@($users).Count) users collected"

# ─── Groups ───────────────────────────────────────────────────────────────────

Write-Host "[MigrateReady] Collecting groups..."

$groupProperties = @('Name', 'SamAccountName', 'DistinguishedName', 'GroupScope', 'GroupCategory', 'Members', 'MemberOf', 'Description', 'ManagedBy', 'WhenCreated')

$groups = foreach ($g in (Get-ADGroup -Filter * -Properties $groupProperties)) {
    [ordered]@{
        name              = $g.Name
        sAMAccountName    = $g.SamAccountName
        distinguishedName = $g.DistinguishedName
        groupScope        = $g.GroupScope.ToString()
        groupCategory     = $g.GroupCategory.ToString()
        members           = @($g.Members)
        memberOf          = @($g.MemberOf)
        description       = $g.Description
        managedBy         = $g.ManagedBy
        whenCreated       = if ($g.WhenCreated) { $g.WhenCreated.ToString('o') } else { $null }
    }
}

Write-Host "[MigrateReady]   → $(@($groups).Count) groups collected"

# ─── Computers ────────────────────────────────────────────────────────────────

Write-Host "[MigrateReady] Collecting computers..."

$computerProperties = @('Name', 'SamAccountName', 'DistinguishedName', 'DNSHostName', 'OperatingSystem', 'OperatingSystemVersion', 'Enabled', 'LastLogonDate', 'WhenCreated')

$computers = foreach ($c in (Get-ADComputer -Filter * -Properties $computerProperties)) {
    [ordered]@{
        name                    = $c.Name
        sAMAccountName          = $c.SamAccountName
        distinguishedName       = $c.DistinguishedName
        dnsHostName             = $c.DNSHostName
        operatingSystem         = $c.OperatingSystem
        operatingSystemVersion  = $c.OperatingSystemVersion
        enabled                 = [bool]$c.Enabled
        lastLogonDate           = if ($c.LastLogonDate) { $c.LastLogonDate.ToString('o') } else { $null }
        whenCreated             = if ($c.WhenCreated) { $c.WhenCreated.ToString('o') } else { $null }
    }
}

Write-Host "[MigrateReady]   → $(@($computers).Count) computers collected"

# ─── OUs ──────────────────────────────────────────────────────────────────────

Write-Host "[MigrateReady] Collecting OUs..."

$ous = foreach ($ou in (Get-ADOrganizationalUnit -Filter * -Properties Description, LinkedGroupPolicyObjects)) {
    [ordered]@{
        name              = $ou.Name
        distinguishedName = $ou.DistinguishedName
        description       = $ou.Description
        gpLinks           = @($ou.LinkedGroupPolicyObjects)
    }
}

Write-Host "[MigrateReady]   → $(@($ous).Count) OUs collected"

# ─── GPOs ─────────────────────────────────────────────────────────────────────

Write-Host "[MigrateReady] Collecting GPOs..."

$gpos = @()
try {
    if (Get-Module -ListAvailable -Name GroupPolicy) {
        Import-Module GroupPolicy -Verbose:$false
        $gpos = foreach ($gpo in (Get-GPO -All)) {
            $links = (Get-GPOReport -Guid $gpo.Id -ReportType Xml -ErrorAction SilentlyContinue) -as [xml]
            $linkedOUs = @()
            if ($links) {
                $linkedOUs = $links.GPO.LinksTo | Where-Object { $_ } | ForEach-Object { $_.SOMPath }
            }
            [ordered]@{
                displayName = $gpo.DisplayName
                id          = $gpo.Id.ToString()
                gpoStatus   = $gpo.GpoStatus.ToString()
                linkedOUs   = @($linkedOUs)
                description = $gpo.Description
            }
        }
        Write-Host "[MigrateReady]   → $(@($gpos).Count) GPOs collected"
    } else {
        Write-Warning "[MigrateReady] GroupPolicy module not available — GPO data skipped"
    }
} catch {
    Write-Warning "[MigrateReady] GPO collection failed: $($_.Exception.Message)"
}

# ─── Password policy ──────────────────────────────────────────────────────────

Write-Host "[MigrateReady] Collecting default domain password policy..."

$policy = Get-ADDefaultDomainPasswordPolicy
$passwordPolicy = [ordered]@{
    minPasswordLength          = $policy.MinPasswordLength
    maxPasswordAge             = $policy.MaxPasswordAge.ToString()
    minPasswordAge             = $policy.MinPasswordAge.ToString()
    passwordHistoryCount       = $policy.PasswordHistoryCount
    lockoutThreshold           = $policy.LockoutThreshold
    lockoutDuration            = $policy.LockoutDuration.ToString()
    complexityEnabled          = [bool]$policy.ComplexityEnabled
    reversibleEncryptionEnabled = [bool]$policy.ReversibleEncryptionEnabled
}

# ─── Trusts ───────────────────────────────────────────────────────────────────

Write-Host "[MigrateReady] Collecting trusts..."

$trusts = foreach ($t in (Get-ADTrust -Filter * -Properties *)) {
    [ordered]@{
        name                    = $t.Name
        distinguishedName       = $t.DistinguishedName
        trustType               = $t.TrustType.ToString()
        trustDirection          = $t.Direction.ToString()
        trustAttributes         = $t.TrustAttributes
        selectiveAuthentication = [bool]($t.TrustAttributes -band 0x80)
    }
}

Write-Host "[MigrateReady]   → $(@($trusts).Count) trusts collected"

# ─── Assemble & validate ──────────────────────────────────────────────────────

$export = [ordered]@{
    schemaVersion  = '1.0'
    exportedAt     = (Get-Date).ToUniversalTime().ToString('o')
    domainInfo     = $domainInfo
    users          = @($users)
    groups         = @($groups)
    computers      = @($computers)
    ous            = @($ous)
    gpos           = @($gpos)
    passwordPolicy = $passwordPolicy
    trusts         = @($trusts)
    anonymised     = [bool]$AnonymiseNames
}

# ─── Write output ─────────────────────────────────────────────────────────────

$jsonContent = $export | ConvertTo-Json -Depth 20 -Compress:$false
$resolvedPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
Set-Content -Path $resolvedPath -Value $jsonContent -Encoding UTF8

$elapsed = (Get-Date) - $startTime
Write-Host ""
Write-Host "[MigrateReady] Export complete in $([math]::Round($elapsed.TotalSeconds, 1))s" -ForegroundColor Green
Write-Host "[MigrateReady] Output: $resolvedPath" -ForegroundColor Green
Write-Host "[MigrateReady] Users: $(@($users).Count) | Groups: $(@($groups).Count) | Computers: $(@($computers).Count)"
Write-Host ""
Write-Host "Upload $resolvedPath to MigrateReady at https://migrate-ready.vercel.app" -ForegroundColor Cyan
