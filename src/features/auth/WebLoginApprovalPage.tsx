import { useEffect, useState } from 'react';
import { Check, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { FeedbackMessage } from '../../app/components/FeedbackMessage';
import { LoadingIndicator } from '../../app/components/LoadingIndicator';
import { webLoginService } from './webLoginService';
import brandLogo from '../../../info/finanzas-pwa/assets/brand/logo.svg';

type ApprovalState = 'checking' | 'pending' | 'approving' | 'approved' | 'expired' | 'failed';

type WebLoginApprovalPageProps = {
  accountEmail: string;
  approvalSecret: string;
  requestId: string;
};

export function WebLoginApprovalPage({
  accountEmail,
  approvalSecret,
  requestId,
}: WebLoginApprovalPageProps) {
  const navigate = useNavigate();
  const [state, setState] = useState<ApprovalState>('checking');
  const [clientLabel, setClientLabel] = useState('');

  useEffect(() => {
    let isActive = true;

    void webLoginService
      .inspect(requestId, approvalSecret)
      .then((result) => {
        if (!isActive) {
          return;
        }
        setClientLabel(result.clientLabel ?? 'navegador web');
        setState(result.status);
      })
      .catch(() => {
        if (isActive) {
          setState('failed');
        }
      });

    return () => {
      isActive = false;
    };
  }, [approvalSecret, requestId]);

  async function handleApprove() {
    setState('approving');
    try {
      const result = await webLoginService.approve(requestId, approvalSecret);
      setState(result === 'approved' ? 'approved' : result === 'expired' ? 'expired' : 'failed');
    } catch {
      setState('failed');
    }
  }

  return (
    <main className="auth-page">
      <section aria-labelledby="web-login-approval-title" className="auth-panel web-login-approval">
        <p className="eyebrow">Aprobación de acceso</p>
        <div className="auth-brand">
          <img alt="" src={brandLogo} />
          <h1>Mave</h1>
        </div>

        <h2 id="web-login-approval-title">Autorizar inicio en PC</h2>
        <p>
          Cuenta seleccionada: <strong>{accountEmail}</strong>
        </p>

        {state === 'checking' ? <LoadingIndicator label="Comprobando la solicitud" /> : null}
        {state === 'pending' || state === 'approving' ? (
          <>
            <div className="web-login-approval__target">
              <span>Equipo que solicita acceso</span>
              <strong>{clientLabel}</strong>
            </div>
            <p className="web-login-approval__notice">
              Continúa solo si reconoces este equipo. La sesión se abrirá en el PC, no en este
              celular.
            </p>
            <button
              className="web-login-approval__confirm"
              disabled={state === 'approving'}
              onClick={() => void handleApprove()}
              type="button"
            >
              {state === 'approving' ? (
                'Autorizando…'
              ) : (
                <>
                  <ShieldCheck aria-hidden="true" size={18} />
                  <span>Autorizar inicio de sesión</span>
                </>
              )}
            </button>
            {state === 'pending' ? (
              <button
                className="web-login-approval__cancel"
                onClick={() => navigate('/')}
                type="button"
              >
                Ahora no
              </button>
            ) : null}
          </>
        ) : null}
        {state === 'approved' ? (
          <FeedbackMessage tone="info">
            <Check aria-hidden="true" size={17} /> Acceso autorizado. Vuelve al PC.
          </FeedbackMessage>
        ) : null}
        {state === 'expired' ? (
          <FeedbackMessage tone="info">
            La solicitud venció o ya se utilizó. Genera otro QR en el PC.
          </FeedbackMessage>
        ) : null}
        {state === 'failed' ? (
          <FeedbackMessage tone="error">
            No se pudo comprobar la solicitud. Genera otro QR en el PC.
          </FeedbackMessage>
        ) : null}
      </section>
    </main>
  );
}
