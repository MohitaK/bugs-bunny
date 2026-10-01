import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Task } from '../types';

export function useTasks(userId: number) {
  const [tasks, setTasks]   = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  // BUG-011 (High / React): No AbortController and no cleanup return value.
  // If the component unmounts while the request is in-flight, setState is
  // called on an unmounted component (React warning + potential memory leak).
  // A fast userId change also causes a race: the slower earlier request can
  // resolve after the later one and overwrite correct data with stale data.
  useEffect(() => {
    setLoading(true);
    api.getTasks()
      .then(data => {
        setTasks(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, [userId]);

  // BUG-016 (Medium / React): Stale closure — `tasks` captured at mount time
  // is always the initial empty array inside the handler. The dependency array
  // should include `tasks`, but doing so would also require useCallback to
  // avoid re-registering the listener on every render.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('Cached task count on refocus:', tasks.length);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []); // missing [tasks]

  const deleteTask = async (id: number) => {
    // BUG-013 (High / React): Mutating the state array directly with splice
    // instead of producing a new array. React may not re-render because the
    // reference is the same object.
    // Also: optimistic update with no rollback if the API call fails.
    const updatedTasks = tasks;
    const index = updatedTasks.findIndex(t => t.id === id);
    updatedTasks.splice(index, 1);
    setTasks(updatedTasks);

    await api.deleteTask(id);
  };

  const completeTask = (id: number) => {
    // BUG-013 (High / React): Directly mutating a property of an object that
    // lives inside state. React's reconciler sees the same reference and will
    // not schedule a re-render reliably.
    const task = tasks.find(t => t.id === id);
    if (task) {
      task.status = 'completed';
      setTasks([...tasks]);
    }
  };

  return { tasks, loading, error, deleteTask, completeTask };
}
