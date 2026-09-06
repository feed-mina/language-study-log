export type SpeechVoiceCandidate = {
  lang: string;
  name: string;
  default?: boolean;
  localService?: boolean;
};

function normalizedLanguage(value: string): string {
  return value.trim().replaceAll('_', '-').toLowerCase();
}

export function selectSpeechVoice<T extends SpeechVoiceCandidate>(voices: readonly T[], targetLanguage: string): T | undefined {
  const target = normalizedLanguage(targetLanguage);
  const family = target.split('-')[0];
  let selected: { voice: T; score: number; index: number } | undefined;

  voices.forEach((voice, index) => {
    const language = normalizedLanguage(voice.lang);
    if (language !== family && !language.startsWith(`${family}-`)) return;
    const score = (language === target ? 100 : language === family ? 80 : 60)
      + (voice.localService ? 4 : 0)
      + (voice.default ? 1 : 0);
    if (!selected || score > selected.score) selected = { voice, score, index };
  });

  return selected?.voice;
}
