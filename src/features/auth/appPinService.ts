export const APP_PIN_LENGTH = 6;

const appPinIterations = 600_000;
const storagePrefix = 'mave:app-pin:v1:';

type PinRecord = {
  salt: string;
  verifier: string;
};

type PinStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function createAppPinService(
  storageProvider: () => PinStorage = () => window.localStorage,
  cryptoProvider: () => Crypto = () => globalThis.crypto,
) {
  return {
    isEnabled(userId: string): boolean {
      return storageProvider().getItem(storageKey(userId)) !== null;
    },

    async setPin(userId: string, pin: string): Promise<void> {
      if (!isValidPin(pin)) {
        throw new Error('PIN must contain six digits.');
      }

      const cryptoApi = cryptoProvider();
      const salt = cryptoApi.getRandomValues(new Uint8Array(16));
      const verifier = await deriveVerifier(pin, salt, cryptoApi);
      const record: PinRecord = { salt: toHex(salt), verifier };
      storageProvider().setItem(storageKey(userId), JSON.stringify(record));
    },

    async verifyPin(userId: string, pin: string): Promise<boolean> {
      if (!isValidPin(pin)) {
        return false;
      }

      const rawRecord = storageProvider().getItem(storageKey(userId));
      if (!rawRecord) {
        return false;
      }

      const record = parseRecord(rawRecord);
      if (!record) {
        return false;
      }

      const cryptoApi = cryptoProvider();
      const verifier = await deriveVerifier(pin, fromHex(record.salt), cryptoApi);
      return constantTimeEqual(verifier, record.verifier);
    },

    clearPin(userId: string): void {
      storageProvider().removeItem(storageKey(userId));
    },
  };
}

export const appPinService = createAppPinService();

function storageKey(userId: string): string {
  return `${storagePrefix}${userId}`;
}

function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${APP_PIN_LENGTH}}$`).test(pin);
}

function parseRecord(value: string): PinRecord | null {
  try {
    const record = JSON.parse(value) as Partial<PinRecord>;
    if (
      typeof record.salt === 'string' &&
      /^[a-f\d]{32}$/.test(record.salt) &&
      typeof record.verifier === 'string' &&
      /^[a-f\d]{64}$/.test(record.verifier)
    ) {
      return { salt: record.salt, verifier: record.verifier };
    }
  } catch {
    return null;
  }

  return null;
}

async function deriveVerifier(pin: string, salt: Uint8Array, cryptoApi: Crypto): Promise<string> {
  const keyMaterial = await cryptoApi.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const saltBuffer = new ArrayBuffer(salt.byteLength);
  new Uint8Array(saltBuffer).set(salt);
  const verifier = await cryptoApi.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBuffer, iterations: appPinIterations },
    keyMaterial,
    256,
  );

  return toHex(new Uint8Array(verifier));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fromHex(value: string): Uint8Array {
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return difference === 0;
}
