import React, { useState } from 'react';
import { api } from '../api/client';

// BUG-022 (Medium / TypeScript): Callback typed as `any` — the actual User
// shape is not communicated to callers of this component.
interface Props {
  onLogin: (user: any) => void;
}

function LoginForm({ onLogin }: Props) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');

  const handleLogin = async () => {
    try {
      const data = await api.login(email, password);

      // BUG-026 (Medium / Security): Token stored in localStorage.
      // Any script running on this origin (including injected scripts from an
      // XSS attack) can read it. Prefer an httpOnly cookie set by the server.
      localStorage.setItem('token', data.token);

      // BUG-029 (Low / Code Quality): Logs user data (including any fields
      // the server mistakenly returns, like password hash) to the console.
      console.log('Logged in:', data.user);

      onLogin(data.user);
    } catch (err: any) {
      // BUG-022 (Medium / TypeScript): `err` typed as `any` — should be
      // `unknown` with a proper type guard.
      setError('Login failed. Please try again.');
    }
  };

  return (
    <div>
      {/* BUG-008 (Critical / Security): Error message rendered as raw HTML.
          If the server ever returns HTML in the error body, or if `error`
          is set from an untrusted source, this is an XSS vector. */}
      {error && <div dangerouslySetInnerHTML={{ __html: error }} />}

      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="Email"
      />

      <input
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        placeholder="Password"
        // BUG-030 (Low / Code Quality): Magic number — 8 is not named or
        // documented. If the server-side minimum changes this gets out of sync.
        minLength={8}
      />

      {/* BUG-017 (Medium / Logic): No keyboard/Enter submit. The form has no
          onSubmit handler so pressing Enter does nothing — mouse-only UX. */}
      <button onClick={handleLogin}>Log In</button>
    </div>
  );
}

export default LoginForm;
