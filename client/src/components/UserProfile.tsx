import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { api } from '../api/client';

interface Props {
  userId: number;
}

function UserProfile({ userId }: Props) {
  const [user, setUser]     = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // BUG-017 (Medium / Logic): No try/catch. A failed request leaves
    // `loading` stuck as `true` and the component renders nothing.
    api.getUser(userId).then(data => {
      setUser(data);
      setLoading(false);
    });

    // BUG-015 (Medium / React): setInterval registered inside useEffect with
    // no cleanup return. On every re-render caused by userId changing, a new
    // interval is registered without the old one being cleared — eventually
    // dozens of concurrent polling intervals flood the server.
    const pollInterval = setInterval(() => {
      api.getUser(userId).then(data => setUser(data));
    }, 5000);

    // Missing: return () => clearInterval(pollInterval);
  }, [userId]);

  if (loading) return <div>Loading profile…</div>;

  // BUG-023 (Medium / TypeScript): Non-null assertion on `user` without any
  // runtime guard. If the API call failed and left `user` as null, these
  // lines throw "Cannot read properties of null" at runtime.
  return (
    <div>
      <h2>{user!.name}</h2>
      <p>{user!.email}</p>

      {/* BUG-019 (High / Security): Displaying the raw password field returned
          by the API. Even as a hash this should never appear in the UI. */}
      {user!.password && <p style={{ color: 'red' }}>Password hash: {user!.password}</p>}

      {/* BUG-022 (Medium / TypeScript): Casting to `any` to access a property
          that was never declared — silently undefined at runtime. */}
      <p>Open tasks: {(user as any).taskCount ?? '—'}</p>
    </div>
  );
}

export default UserProfile;
