window.AGAPAYDonorSession.saveSession({ token: 'token', donor: { email: 'donor@example.test' } });
const headers: Record<string, string> = window.AGAPAYDonorSession.authHeaders();
void headers;
window.AGAPAYCampaignBox?.scan(document);
window.addEventListener('beforeinstallprompt', (event) => {
  void event.prompt();
  void event.userChoice;
});
const security: { turnstileToken: string } = window.agapaySecurityPayload();
void security;
// @ts-expect-error Session tokens are strings.
window.AGAPAYDonorSession.saveSession({ token: 123 });
// @ts-expect-error Embed roots must be DOM containers.
window.AGAPAYCampaignBox?.scan('body');
// @ts-expect-error Security tokens cannot be numeric.
window.agapayTurnstileToken = 123;
