import { redirect } from 'next/navigation';

/** Legacy /employees/new → list with create modal */
export default function EmployeesNewRedirectPage() {
  redirect('/employees?create=1');
}
