import React, { useState, useEffect } from 'react';
import { api } from '../api/client';

interface Props {
  currentUserId: number;
  onTaskCreated: () => void;
}

function TaskForm({ currentUserId, onTaskCreated }: Props) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    dueDate: '',
    userId: 0,
  });
  const [submitting, setSubmitting] = useState(false);

  // BUG-012 (High / React): Infinite render loop.
  // `formData` is listed as a dependency, and the effect body calls
  // setFormData which produces a new `formData` reference, which triggers
  // the effect again — forever.
  // Fix: dependency array should be [currentUserId] only.
  useEffect(() => {
    setFormData({ ...formData, userId: currentUserId });
  }, [formData, currentUserId]);

  const handleSubmit = async (e: React.FormEvent) => {
    // BUG-017 (Medium / Logic): Missing e.preventDefault().
    // The form will perform a full page reload before the async handler runs,
    // meaning the API call never completes.
    setSubmitting(true);

    // BUG-028 (Medium / Logic): No client-side validation.
    // An empty title, past due date, or excessively long description will be
    // sent to the server without any user-facing feedback.
    try {
      await api.createTask(formData);
      onTaskCreated();
      setFormData({ title: '', description: '', dueDate: '', userId: currentUserId });
    } catch (err) {
      // BUG-017 (Medium / Logic): Error is swallowed — the user sees no
      // indication that the creation failed.
      console.error('Task creation failed:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={formData.title}
        onChange={e => setFormData({ ...formData, title: e.target.value })}
        placeholder="Task title"
        required
      />
      <textarea
        value={formData.description}
        onChange={e => setFormData({ ...formData, description: e.target.value })}
        placeholder="Description"
      />
      <input
        type="date"
        value={formData.dueDate}
        onChange={e => setFormData({ ...formData, dueDate: e.target.value })}
      />
      <button type="submit" disabled={submitting}>
        {submitting ? 'Creating…' : 'Create Task'}
      </button>
    </form>
  );
}

export default TaskForm;
