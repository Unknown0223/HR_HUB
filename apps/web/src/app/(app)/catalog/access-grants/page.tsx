import { redirect } from 'next/navigation';
import { EMPLOYEE_ACCESS_HREF, employeeAccessHref } from '@/lib/access';

/** Legacy generic CRUD → Доступы → Доступы сотрудников */
export default async function AccessGrantsRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ employeeId?: string }>;
}) {
  const { employeeId } = await searchParams;
  redirect(employeeId ? employeeAccessHref(employeeId) : EMPLOYEE_ACCESS_HREF);
}
