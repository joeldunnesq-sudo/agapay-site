interface AgapayInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}
interface WindowEventMap {
  beforeinstallprompt: AgapayInstallPromptEvent;
}
interface Navigator {
  readonly standalone?: boolean;
}
interface AgapayPixel {
  (...args: unknown[]): void;
  callMethod?: { apply(thisArg: AgapayPixel, args: IArguments): void };
  queue: IArguments[];
  push: AgapayPixel;
  loaded: boolean;
  version: string;
}
interface Window {
  __agapaySwRegisterStarted?: boolean;
  agapayTurnstileToken: string;
  turnstile?: {
    render(
      target: HTMLElement,
      options: {
        sitekey: string;
        action?: string;
        callback(token: string): void;
        'expired-callback'(): void;
        'error-callback'(): void;
      }
    ): unknown;
  };
  agapaySecurityPayload(): { turnstileToken: string };
  fbq?: AgapayPixel;
  _fbq?: AgapayPixel;
  __agapayMetaPixelInitialized?: boolean;
  __agapayMetaPageViewTracked?: boolean;
  trackMetaEvent(name: string, data?: Record<string, unknown>): boolean;
  trackMetaStandardEvent(name: string, data?: Record<string, unknown>): boolean;
  AGAPAYCampaignBox?: { scan(root?: Document | HTMLElement): void };
}
declare module '*attribution.js' {
  export function getAttribution(): unknown;
}
