// BUG-022 (Medium / TypeScript): status should be a union literal type, not a
// plain string. Using string permits any value and removes exhaustiveness
// checking in switch statements.
export interface Task {
  id: number;
  title: string;
  description: string;
  status: string;
  userId: number;
  assigneeId: number;
  assignee?: User;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
}

// BUG-019 (High / Security): The password field should never exist on a
// frontend type. Its presence normalises treating it as safe to display.
export interface User {
  id: number;
  name: string;
  email: string;
  password?: string;
}

// BUG-022 (Medium / TypeScript): `data: any` gives up all type safety for
// every API call that uses this shape.
export interface ApiResponse {
  data: any;
  error?: string;
}
