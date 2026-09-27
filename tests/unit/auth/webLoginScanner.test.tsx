import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const scannerMock = vi.hoisted(() => ({
  callback: null as ((result: { getText: () => string } | undefined) => void) | null,
  stop: vi.fn(),
}));

vi.mock('@zxing/browser', () => ({
  BrowserQRCodeReader: class {
    async decodeFromVideoDevice(
      _deviceId: string | undefined,
      _videoElement: HTMLVideoElement,
      callback: (result: { getText: () => string } | undefined) => void,
    ) {
      scannerMock.callback = callback;
      return { stop: scannerMock.stop };
    }
  },
}));

import { WebLoginScanner } from '../../../src/features/auth/WebLoginScanner';

const requestId = 'c22e553d-87b3-44c4-9c0d-0137c8881111';
const approvalSecret = 'a'.repeat(64);

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="current-location">{`${location.pathname}${location.hash}`}</output>;
}

let secureContextDescriptor: PropertyDescriptor | undefined;
let mediaDevicesDescriptor: PropertyDescriptor | undefined;

beforeEach(() => {
  scannerMock.callback = null;
  scannerMock.stop.mockClear();
  secureContextDescriptor = Object.getOwnPropertyDescriptor(window, 'isSecureContext');
  mediaDevicesDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn() },
  });
});

afterEach(() => {
  cleanup();
  if (secureContextDescriptor) {
    Object.defineProperty(window, 'isSecureContext', secureContextDescriptor);
  } else {
    Reflect.deleteProperty(window, 'isSecureContext');
  }
  if (mediaDevicesDescriptor) {
    Object.defineProperty(navigator, 'mediaDevices', mediaDevicesDescriptor);
  } else {
    Reflect.deleteProperty(navigator, 'mediaDevices');
  }
});

describe('mobile web login scanner', () => {
  it('navigates to the approval route and stops the camera for a same-origin QR', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <LocationProbe />
        <WebLoginScanner />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Escanear QR con cámara' }));
    expect(await screen.findByText('Buscando un código QR…')).toBeInTheDocument();
    await waitFor(() => expect(scannerMock.callback).toBeTypeOf('function'));

    act(() => {
      scannerMock.callback?.({
        getText: () =>
          `${window.location.origin}/login/approve#request=${requestId}&approval=${approvalSecret}`,
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('current-location')).toHaveTextContent('/login/approve');
    });
    expect(scannerMock.stop).toHaveBeenCalledOnce();
  });

  it('rejects QR codes from another origin without navigating', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/profile?section=security']}>
        <LocationProbe />
        <WebLoginScanner />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Escanear QR con cámara' }));
    await waitFor(() => expect(scannerMock.callback).toBeTypeOf('function'));

    act(() => {
      scannerMock.callback?.({
        getText: () =>
          `https://other.example/login/approve#request=${requestId}&approval=${approvalSecret}`,
      });
    });

    expect(
      await screen.findByText('Este QR no corresponde a una solicitud de acceso de Mave.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('current-location')).toHaveTextContent('/profile');
    expect(scannerMock.stop).not.toHaveBeenCalled();
  });
});
