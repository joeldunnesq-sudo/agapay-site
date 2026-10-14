const donorPushConfig: DonorPushResponse = { configured: true, publicKey: 'AQID' };
void donorPushConfig;
const iosStandalone: boolean | undefined = navigator.standalone;
void iosStandalone;
// @ts-expect-error Configuration flags are boolean.
const invalidPushConfig: DonorPushResponse = { configured: 'true' };
void invalidPushConfig;
// @ts-expect-error Application server keys are encoded strings.
const invalidPushKey: DonorPushResponse = { publicKey: new Uint8Array([1]) };
void invalidPushKey;
