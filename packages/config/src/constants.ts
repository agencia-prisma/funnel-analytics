export const PRODUCT_NAME = 'Funnel Analytics';
export const PRODUCT_VERSION = '0.1.0';

export const SERVICES = {
  admin: 'admin',
  web: 'web',
} as const;

export type ServiceName = (typeof SERVICES)[keyof typeof SERVICES];
