export interface JsonCredentialDescriptor extends Omit<PublicKeyCredentialDescriptor, 'id'> {
  id: string;
}
export interface JsonCreationOptions extends Omit<
  PublicKeyCredentialCreationOptions,
  'challenge' | 'user' | 'excludeCredentials'
> {
  challenge: string;
  user: Omit<PublicKeyCredentialUserEntity, 'id'> & { id: string };
  excludeCredentials?: JsonCredentialDescriptor[];
}
export interface JsonRequestOptions extends Omit<PublicKeyCredentialRequestOptions, 'challenge' | 'allowCredentials'> {
  challenge: string;
  allowCredentials?: JsonCredentialDescriptor[];
}
export type RegistrationCredential = PublicKeyCredential & { response: AuthenticatorAttestationResponse };
export type AuthenticationCredential = PublicKeyCredential & { response: AuthenticatorAssertionResponse };
export interface NativePasskey {
  id: string;
  label?: string;
  createdAt?: string;
  lastUsedAt?: string;
}
export interface PasskeyPayload extends Record<string, unknown> {
  error?: string;
  reference?: string;
  options: JsonCreationOptions & JsonRequestOptions;
  pendingToken: string;
  passkeys: NativePasskey[];
}
