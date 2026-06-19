import { VoiceProvider } from './provider';
import { BolnaProvider } from './bolna-provider';

let provider: VoiceProvider | null = null;

export function configureProvider(customProvider?: VoiceProvider): void {
  provider = customProvider || new BolnaProvider();
}

export function getProvider(): VoiceProvider {
  if (!provider) {
    provider = new BolnaProvider();
  }
  return provider;
}
