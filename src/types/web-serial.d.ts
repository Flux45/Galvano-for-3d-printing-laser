// Minimal ambient typings for the Web Serial API, used only for the optional
// "stream to hardware" feature in the Export page. Not all browsers support this.
interface SerialPort {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  writable: WritableStream<Uint8Array> | null;
  readable: ReadableStream<Uint8Array> | null;
}

interface Serial {
  requestPort(): Promise<SerialPort>;
}

interface Navigator {
  serial?: Serial;
}
