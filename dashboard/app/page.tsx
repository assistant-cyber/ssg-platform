// Server component — just redirect to login.
// Auth state is handled client-side after login.
import { redirect } from 'next/navigation';

export default function Root() {
  redirect('/login');
}
