import React, { useState, useEffect } from 'react';
import TaskList from './components/TaskList';
import TaskForm from './components/TaskForm';
import LoginForm from './components/LoginForm';
import UserProfile from './components/UserProfile';
import { useTasks } from './hooks/useTasks';
import { User } from './types';

function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const { tasks, loading, error, deleteTask, completeTask } = useTasks(currentUser?.id ?? 0);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      // BUG-028 (Medium / Logic): JSON.parse of untrusted localStorage data
      // with no validation. Malformed JSON throws; a valid but unexpected
      // shape passes through without type checking.
      setCurrentUser(JSON.parse(savedUser));
    }
  }, []);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    // BUG-026 (Medium / Security): Storing the full user object (potentially
    // including a password field) in localStorage.
    localStorage.setItem('user', JSON.stringify(user));
  };

  if (!currentUser) {
    return <LoginForm onLogin={handleLogin} />;
  }

  return (
    <div style={{ padding: '24px' }}>
      <UserProfile userId={currentUser.id} />
      <TaskForm currentUserId={currentUser.id} onTaskCreated={() => { }} />

      {loading && <p>Loading tasks…</p>}
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}

      {/* BUG-027 (Low / Performance): Object literal `{ status: 'pending' }`
          is a new reference on every render of App. TaskList always sees a
          changed `filters` prop even when nothing actually changed. */}
      <TaskList
        tasks={tasks}
        onDelete={deleteTask}
        onComplete={completeTask}
        filters={{ status: 'pending' }}
      />
    </div>
  );
}

export default App;
