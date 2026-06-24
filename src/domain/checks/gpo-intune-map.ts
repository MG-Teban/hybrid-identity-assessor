/**
 * Static knowledge table mapping common GPO setting categories to their
 * Microsoft Intune / Endpoint Manager equivalents.
 *
 * Sources:
 * - https://learn.microsoft.com/en-us/mem/intune/configuration/group-policy-analytics
 * - https://learn.microsoft.com/en-us/mem/intune/configuration/administrative-templates-windows
 * - https://learn.microsoft.com/en-us/mem/intune/configuration/settings-catalog
 * - https://learn.microsoft.com/en-us/mem/intune/protect/endpoint-security-policy
 */

export type IntuneEquivalent = 'full' | 'partial' | 'none'

export interface GPOIntuneMapping {
  gpoCategory: string
  gpoDescription: string
  intuneEquivalent: IntuneEquivalent
  intuneArea: string
  intuneDocUrl: string
  notes: string
}

export const GPO_INTUNE_MAP: GPOIntuneMapping[] = [
  {
    gpoCategory: 'BitLocker',
    gpoDescription: 'BitLocker Drive Encryption settings',
    intuneEquivalent: 'full',
    intuneArea: 'Endpoint security > Disk encryption',
    intuneDocUrl: 'https://learn.microsoft.com/en-us/mem/intune/protect/encrypt-devices',
    notes: 'Full parity via Endpoint Security Disk Encryption profile. Requires Intune-managed device.',
  },
  {
    gpoCategory: 'Windows Firewall',
    gpoDescription: 'Windows Defender Firewall rules and settings',
    intuneEquivalent: 'full',
    intuneArea: 'Endpoint security > Firewall',
    intuneDocUrl: 'https://learn.microsoft.com/en-us/mem/intune/protect/endpoint-security-firewall-policy',
    notes: 'Full parity via Endpoint Security Firewall profile.',
  },
  {
    gpoCategory: 'Windows Update',
    gpoDescription: 'Windows Update/WSUS configuration',
    intuneEquivalent: 'full',
    intuneArea: 'Devices > Windows > Update rings',
    intuneDocUrl: 'https://learn.microsoft.com/en-us/mem/intune/protect/windows-update-for-business-configure',
    notes: 'Windows Update for Business rings replace WSUS. Full feature parity.',
  },
  {
    gpoCategory: 'Password Policy',
    gpoDescription: 'Default Domain Password Policy (length, complexity, expiry)',
    intuneEquivalent: 'full',
    intuneArea: 'Endpoint security > Account protection',
    intuneDocUrl: 'https://learn.microsoft.com/en-us/mem/intune/protect/endpoint-security-account-protection-policy',
    notes: 'Entra ID password policies apply to cloud accounts. Account Protection profile covers local accounts.',
  },
  {
    gpoCategory: 'Account Lockout',
    gpoDescription: 'Account lockout threshold and duration',
    intuneEquivalent: 'full',
    intuneArea: 'Endpoint security > Account protection',
    intuneDocUrl: 'https://learn.microsoft.com/en-us/mem/intune/protect/endpoint-security-account-protection-policy',
    notes: 'Full parity via Account Protection settings catalog.',
  },
  {
    gpoCategory: 'Audit Policy',
    gpoDescription: 'Advanced audit policy (logon, object access, privilege use)',
    intuneEquivalent: 'full',
    intuneArea: 'Endpoint security > Security baselines',
    intuneDocUrl: 'https://learn.microsoft.com/en-us/mem/intune/protect/security-baselines',
    notes: 'Microsoft Security Baseline includes audit policies. Custom policies via Settings Catalog.',
  },
  {
    gpoCategory: 'Screen Lock / Screen Saver',
    gpoDescription: 'Inactivity timeout and screen saver enforcement',
    intuneEquivalent: 'full',
    intuneArea: 'Devices > Configuration > Device restrictions',
    intuneDocUrl: 'https://learn.microsoft.com/en-us/mem/intune/configuration/device-restrictions-windows-10',
    notes: 'Full parity via Device Restrictions or Settings Catalog.',
  },
  {
    gpoCategory: 'UAC (User Account Control)',
    gpoDescription: 'UAC elevation prompt behaviour',
    intuneEquivalent: 'full',
    intuneArea: 'Devices > Configuration > Local security options',
    intuneDocUrl: 'https://learn.microsoft.com/en-us/mem/intune/configuration/device-restrictions-windows-10#local-security-options',
    notes: 'Full parity via Local Security Options configuration profile.',
  },
  {
    gpoCategory: 'Windows Defender Antivirus',
    gpoDescription: 'Antivirus scan settings, exclusions, real-time protection',
    intuneEquivalent: 'full',
    intuneArea: 'Endpoint security > Antivirus',
    intuneDocUrl: 'https://learn.microsoft.com/en-us/mem/intune/protect/endpoint-security-antivirus-policy',
    notes: 'Full parity via Endpoint Security Antivirus policy.',
  },
  {
    gpoCategory: 'Attack Surface Reduction',
    gpoDescription: 'ASR rules (block Office macros, credential theft, etc.)',
    intuneEquivalent: 'full',
    intuneArea: 'Endpoint security > Attack surface reduction',
    intuneDocUrl: 'https://learn.microsoft.com/en-us/mem/intune/protect/endpoint-security-asr-policy',
    notes: 'Full parity. Intune ASR profile is the recommended deployment method.',
  },
  {
    gpoCategory: 'Credential Guard',
    gpoDescription: 'Virtualization-based security for credential isolation',
    intuneEquivalent: 'full',
    intuneArea: 'Endpoint security > Security baselines',
    intuneDocUrl: 'https://learn.microsoft.com/en-us/windows/security/identity-protection/credential-guard/credential-guard-manage',
    notes: 'Enabled via Security Baseline or Device Configuration > VBS settings.',
  },
  {
    gpoCategory: 'LAPS (Local Administrator Password Solution)',
    gpoDescription: 'Local admin password rotation and storage',
    intuneEquivalent: 'full',
    intuneArea: 'Endpoint security > Account protection (Windows LAPS)',
    intuneDocUrl: 'https://learn.microsoft.com/en-us/mem/intune/protect/windows-laps-overview',
    notes: 'Windows LAPS natively integrates with Intune. Replaces legacy LAPS GPO extension.',
  },
  {
    gpoCategory: 'Wi-Fi Profiles',
    gpoDescription: 'Enterprise Wi-Fi (WPA2-Enterprise, SSID, certificates)',
    intuneEquivalent: 'full',
    intuneArea: 'Devices > Configuration > Wi-Fi',
    intuneDocUrl: 'https://learn.microsoft.com/en-us/mem/intune/configuration/wi-fi-settings-windows',
    notes: 'Full parity. Supports EAP-TLS with SCEP certificates.',
  },
  {
    gpoCategory: 'VPN Profiles',
    gpoDescription: 'Corporate VPN connection settings',
    intuneEquivalent: 'full',
    intuneArea: 'Devices > Configuration > VPN',
    intuneDocUrl: 'https://learn.microsoft.com/en-us/mem/intune/configuration/vpn-settings-windows-10',
    notes: 'Full parity for Always On VPN, IKEv2, and third-party VPN clients.',
  },
  {
    gpoCategory: 'Certificate Deployment',
    gpoDescription: 'Root CA, intermediate, and user/device certificate distribution',
    intuneEquivalent: 'full',
    intuneArea: 'Devices > Configuration > Certificates (SCEP/PKCS)',
    intuneDocUrl: 'https://learn.microsoft.com/en-us/mem/intune/protect/certificates-configure',
    notes: 'SCEP and PKCS certificate profiles replace GPO-based cert deployment.',
  },
  {
    gpoCategory: 'Proxy Settings',
    gpoDescription: 'HTTP/HTTPS proxy server configuration',
    intuneEquivalent: 'full',
    intuneArea: 'Devices > Configuration > Network proxy',
    intuneDocUrl: 'https://learn.microsoft.com/en-us/windows/client-management/mdm/networkproxy-csp',
    notes: 'Full parity via Network Proxy configuration profile or Settings Catalog.',
  },
  {
    gpoCategory: 'Remote Desktop (RDP)',
    gpoDescription: 'RDP access, NLA requirement, port configuration',
    intuneEquivalent: 'full',
    intuneArea: 'Devices > Configuration > Administrative templates',
    intuneDocUrl: 'https://learn.microsoft.com/en-us/mem/intune/configuration/administrative-templates-windows',
    notes: 'Full parity via ADMX administrative templates.',
  },
  {
    gpoCategory: 'USB Device Restrictions',
    gpoDescription: 'Removable storage and USB device access control',
    intuneEquivalent: 'full',
    intuneArea: 'Endpoint security > Attack surface reduction (Device Control)',
    intuneDocUrl: 'https://learn.microsoft.com/en-us/mem/intune/protect/endpoint-security-asr-policy',
    notes: 'Device Control rules in Endpoint Security ASR. Supports allow/block per device class.',
  },
  {
    gpoCategory: 'Power Management',
    gpoDescription: 'Sleep, hibernate, screen-off timeout settings',
    intuneEquivalent: 'full',
    intuneArea: 'Devices > Configuration > Administrative templates',
    intuneDocUrl: 'https://learn.microsoft.com/en-us/mem/intune/configuration/administrative-templates-windows',
    notes: 'Full parity via ADMX administrative templates.',
  },
  {
    gpoCategory: 'Desktop Wallpaper',
    gpoDescription: 'Corporate wallpaper / desktop background enforcement',
    intuneEquivalent: 'full',
    intuneArea: 'Devices > Configuration > Administrative templates',
    intuneDocUrl: 'https://learn.microsoft.com/en-us/mem/intune/configuration/administrative-templates-windows',
    notes: 'Full parity via ADMX template or Device Experience profile.',
  },
  {
    gpoCategory: 'Internet Explorer / Edge',
    gpoDescription: 'Browser security zones, homepage, trusted sites',
    intuneEquivalent: 'partial',
    intuneArea: 'Devices > Configuration > Microsoft Edge (Administrative templates)',
    intuneDocUrl: 'https://learn.microsoft.com/en-us/deployedge/configure-microsoft-edge',
    notes: 'IE settings migrate to Microsoft Edge CSP/ADMX. IE mode site lists supported. IE itself is deprecated.',
  },
  {
    gpoCategory: 'Drive Mappings',
    gpoDescription: 'Network drive letter assignments per user/group',
    intuneEquivalent: 'partial',
    intuneArea: 'Custom OMA-URI or Win32 app (logon script)',
    intuneDocUrl: 'https://learn.microsoft.com/en-us/mem/intune/configuration/custom-settings-windows-10',
    notes: 'No native Drive Mapping profile. Options: PowerShell logon script (Win32 app), custom OMA-URI, or OneDrive Known Folder Move as replacement.',
  },
  {
    gpoCategory: 'Folder Redirection',
    gpoDescription: 'Redirect Desktop/Documents/Downloads to UNC paths',
    intuneEquivalent: 'partial',
    intuneArea: 'OneDrive Known Folder Move (recommended replacement)',
    intuneDocUrl: 'https://learn.microsoft.com/en-us/sharepoint/redirect-known-folders',
    notes: 'GPO Folder Redirection is not replicated in Intune. Microsoft recommends OneDrive KFM (Known Folder Move) as the cloud-native replacement.',
  },
  {
    gpoCategory: 'Logon / Logoff Scripts',
    gpoDescription: 'Scripts that run at user logon or computer startup',
    intuneEquivalent: 'partial',
    intuneArea: 'Devices > Scripts > PowerShell scripts',
    intuneDocUrl: 'https://learn.microsoft.com/en-us/mem/intune/apps/intune-management-extension',
    notes: 'PowerShell scripts deploy via IME (Intune Management Extension). Shell scripts not supported on Windows. Complex orchestration needs Win32 app deployment.',
  },
  {
    gpoCategory: 'Printer Deployment',
    gpoDescription: 'Network printer assignment per OU/group',
    intuneEquivalent: 'partial',
    intuneArea: 'Universal Print + Intune (recommended)',
    intuneDocUrl: 'https://learn.microsoft.com/en-us/universal-print/fundamentals/universal-print-whatis',
    notes: 'Traditional print server shares require workarounds (PowerShell scripts). Microsoft recommends migrating to Universal Print for full cloud-native support.',
  },
  {
    gpoCategory: 'Software Installation (MSI)',
    gpoDescription: 'MSI packages deployed via GPO Software Installation',
    intuneEquivalent: 'partial',
    intuneArea: 'Apps > Windows > Win32 app / MSI (LOB)',
    intuneDocUrl: 'https://learn.microsoft.com/en-us/mem/intune/apps/apps-win32-app-management',
    notes: 'Win32 app deployment (Intune) supports MSI/EXE. Requires repackaging with IntuneWinAppUtil for complex apps.',
  },
  {
    gpoCategory: 'AppLocker',
    gpoDescription: 'Application whitelisting / blacklisting rules',
    intuneEquivalent: 'partial',
    intuneArea: 'Endpoint security > ASR (App Control)',
    intuneDocUrl: 'https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/applocker/applocker-overview',
    notes: 'AppLocker policies can be deployed via Intune OMA-URI. Microsoft recommends migrating to Windows Defender Application Control (WDAC) for modern devices.',
  },
  {
    gpoCategory: 'Kerberos Policy',
    gpoDescription: 'Kerberos ticket lifetime, renewal, clock skew',
    intuneEquivalent: 'partial',
    intuneArea: 'N/A (cloud auth uses OAuth 2.0 / OIDC tokens)',
    intuneDocUrl: 'https://learn.microsoft.com/en-us/entra/identity/devices/concept-hybrid-join',
    notes: 'Kerberos policy applies to domain-joined devices. Cloud-joined devices use Entra Kerberos for on-prem resource access. Ticket lifetime managed by Entra.',
  },
  {
    gpoCategory: 'Time Synchronisation (NTP)',
    gpoDescription: 'W32tm NTP server configuration',
    intuneEquivalent: 'partial',
    intuneArea: 'Custom OMA-URI (Policy CSP: ADMX_W32Time)',
    intuneDocUrl: 'https://learn.microsoft.com/en-us/windows/client-management/mdm/policy-csp-admx-w32time',
    notes: 'NTP configuration via custom OMA-URI using ADMX-backed policy. Cloud-joined devices use Windows Time service defaults (time.windows.com).',
  },
  {
    gpoCategory: 'Software Restriction Policies',
    gpoDescription: 'Legacy SRP rules (pre-AppLocker)',
    intuneEquivalent: 'none',
    intuneArea: 'Replace with WDAC (Windows Defender Application Control)',
    intuneDocUrl: 'https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/applocker/applocker-overview',
    notes: 'SRP has no direct Intune equivalent and is deprecated. Must migrate to AppLocker or WDAC before decommissioning on-prem AD.',
  },
  {
    gpoCategory: 'Network Access (NAP)',
    gpoDescription: 'Network Access Protection enforcement policies',
    intuneEquivalent: 'none',
    intuneArea: 'Replace with Entra Conditional Access + Compliance policies',
    intuneDocUrl: 'https://learn.microsoft.com/en-us/entra/identity/conditional-access/overview',
    notes: 'NAP is deprecated in Windows Server 2012 R2+. Replace with Entra Conditional Access device compliance requirements.',
  },
  {
    gpoCategory: 'Registry-based Settings',
    gpoDescription: 'Direct registry key enforcement via GPO preferences',
    intuneEquivalent: 'partial',
    intuneArea: 'Custom OMA-URI',
    intuneDocUrl: 'https://learn.microsoft.com/en-us/mem/intune/configuration/custom-settings-windows-10',
    notes: 'Registry settings deploy via Custom OMA-URI (Policy CSP) or PowerShell scripts. Evaluate each setting for a native Intune profile equivalent first.',
  },
]

export function getGPOMapping(gpoName: string): GPOIntuneMapping | undefined {
  const lower = gpoName.toLowerCase()
  return GPO_INTUNE_MAP.find(m => lower.includes(m.gpoCategory.toLowerCase()))
}

export function getMappingsByEquivalent(equiv: IntuneEquivalent): GPOIntuneMapping[] {
  return GPO_INTUNE_MAP.filter(m => m.intuneEquivalent === equiv)
}
