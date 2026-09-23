import { useState } from 'react';
import { login } from '../api/auth';

interface LoginScreenProps {
  onSuccess: () => void;
}

export function LoginScreen({ onSuccess }: LoginScreenProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!pin || submitting) return;
    setSubmitting(true);
    setError('');
    const result = await login(pin);
    setSubmitting(false);
    if (result.ok) onSuccess();
    else setError(result.error ?? 'Incorrect PIN');
  };

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card" style={{ maxWidth: 320, width: '100%', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 18 }}>SignageMadeEasy</h1>
        <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>Enter the PIN to manage this hub.</p>
        <div className="field">
          <label htmlFor="hub-pin">PIN</label>
          <input
            id="hub-pin"
            className="input"
            type="password"
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
          />
        </div>
        {error && <p style={{ color: 'var(--color-danger, #c0392b)', fontSize: 12, margin: 0 }}>{error}</p>}
        <button type="button" className="btn btn-primary btn-block" disabled={submitting || !pin} onClick={() => void submit()}>
          {submitting ? 'Checking…' : 'Unlock'}
        </button>
      </div>
    </div>
  );
}
