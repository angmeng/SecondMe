declare module 'qrcode-terminal' {
  interface QRCodeOptions {
    small?: boolean | undefined;
  }

  function generate(text: string, options?: QRCodeOptions): void;
  function generate(text: string, callback: (qrcode: string) => void): void;
  function generate(text: string, options: QRCodeOptions, callback: (qrcode: string) => void): void;

  function setErrorLevel(level: 'L' | 'M' | 'Q' | 'H'): void;

  export { generate, setErrorLevel };
}
