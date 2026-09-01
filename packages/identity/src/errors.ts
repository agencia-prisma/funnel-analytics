export type IdentityErrorCode =
  | 'IDENTITY_INVALID'
  | 'IDENTITY_EMAIL_INVALID'
  | 'IDENTITY_PHONE_INVALID'
  | 'IDENTITY_CPF_INVALID'
  | 'IDENTITY_NAME_INVALID'
  | 'IDENTITY_CRYPTO_KEY_INVALID'
  | 'IDENTITY_DECRYPT_FAILED';

export class IdentityError extends Error {
  constructor(readonly code: IdentityErrorCode) {
    super(code);
    this.name = 'IdentityError';
  }
}
