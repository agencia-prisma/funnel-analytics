import type { DeviceTypeV1 } from '@funnel/event-contracts';

export interface DeviceContext {
  deviceType: DeviceTypeV1;
  browserName: string;
  osName: string;
}

interface UserAgentDataLike {
  mobile?: boolean;
  platform?: string;
}

function detectBrowser(userAgent: string): string {
  if (/Edg\//i.test(userAgent)) return 'Edge';
  if (/OPR\//i.test(userAgent)) return 'Opera';
  if (/CriOS|Chrome\//i.test(userAgent)) return 'Chrome';
  if (/FxiOS|Firefox\//i.test(userAgent)) return 'Firefox';
  if (/Safari\//i.test(userAgent) && !/Chrome|CriOS|Chromium/i.test(userAgent)) {
    return 'Safari';
  }

  return 'Unknown';
}

function detectOs(userAgent: string, platform?: string): string {
  const value = `${platform ?? ''} ${userAgent}`;

  if (/Android/i.test(value)) return 'Android';
  if (/iPhone|iPad|iPod|iOS/i.test(value)) return 'iOS';
  if (/Windows/i.test(value)) return 'Windows';
  if (/Mac OS|macOS|MacIntel/i.test(value)) return 'macOS';
  if (/Linux/i.test(value)) return 'Linux';

  return 'Unknown';
}

function detectDeviceType(
  userAgent: string,
  mobileHint?: boolean,
): DeviceTypeV1 {
  if (mobileHint === true || /Mobi|iPhone|Android.*Mobile/i.test(userAgent)) {
    return 'mobile';
  }

  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(userAgent)) {
    return 'tablet';
  }

  if (userAgent) {
    return 'desktop';
  }

  return 'unknown';
}

export function detectDevice(navigatorRef: Navigator): DeviceContext {
  const userAgent = navigatorRef.userAgent ?? '';
  const uaData = (
    navigatorRef as Navigator & { userAgentData?: UserAgentDataLike }
  ).userAgentData;

  return {
    deviceType: detectDeviceType(userAgent, uaData?.mobile),
    browserName: detectBrowser(userAgent),
    osName: detectOs(userAgent, uaData?.platform),
  };
}
