declare module 'react-native-sound' {
  class Sound {
    static MAIN_BUNDLE: string;
    static setCategory(category: string): void;
    constructor(filename: string, basePath: string, onError?: (error: any) => void);
    play(onEnd?: (success: boolean) => void): void;
    stop(): void;
    release(): void;
    setVolume(volume: number): void;
  }
  export default Sound;
}
